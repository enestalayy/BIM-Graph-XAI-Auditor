"""
ETL Layer — IFC Parser Service.

Parses IFC files using IfcOpenShell and extracts building elements
with their geometric and semantic properties. Processes elements in
configurable batches to manage memory for large models.

Key design decisions:
- GlobalId is used as the primary key for all elements.
- Geometry is extracted as Axis-Aligned Bounding Boxes (AABB) using
  world coordinates to avoid coordinate system mismatches.
- Property Sets (Psets) are extracted to derive semantic attributes
  such as fire ratings and material properties.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Generator

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.util.placement
import numpy as np

from src.etl.models import (
    BoundingBox,
    IFCElement,
    IFCRelationship,
    ParsedIFCModel,
    PropertySet,
)
from src.logger import get_logger

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)

# IFC types that we parse and include in the Knowledge Graph.
# This list covers the main architectural and MEP categories.
SUPPORTED_IFC_TYPES = frozenset(
    {
        # Architectural
        "IfcWall",
        "IfcWallStandardCase",
        "IfcSlab",
        "IfcRoof",
        "IfcColumn",
        "IfcBeam",
        "IfcDoor",
        "IfcWindow",
        "IfcStair",
        "IfcRailing",
        "IfcSpace",
        "IfcBuildingStorey",
        "IfcBuilding",
        "IfcSite",
        # MEP — Piping
        "IfcPipeSegment",
        "IfcPipeFitting",
        "IfcFlowTerminal",
        # MEP — HVAC
        "IfcDuctSegment",
        "IfcDuctFitting",
        "IfcAirTerminal",
        "IfcUnitaryEquipment",
        # MEP — Electrical
        "IfcCableCarrierSegment",
        "IfcCableSegment",
        # Fire Safety
        "IfcFireSuppressionTerminal",
        "IfcDamper",
    }
)

# Pset property mappings for fire-safety attribute extraction.
# Maps (pset_name, property_name) → IFCElement attribute name.
FIRE_SAFETY_PSET_MAP: dict[tuple[str, str], str] = {
    ("Pset_WallCommon", "FireRating"): "fire_rating_value",
    ("Pset_DoorCommon", "FireRating"): "fire_rating_value",
    ("Pset_WallCommon", "LoadBearing"): "load_bearing",
    ("Pset_SlabCommon", "LoadBearing"): "load_bearing",
    ("Pset_ColumnCommon", "LoadBearing"): "load_bearing",
}


class IFCParserService:
    """Service for parsing IFC files into structured data models.

    Handles memory-efficient batch processing of large IFC models.
    Uses IfcOpenShell's geometry engine to extract world-coordinate
    Axis-Aligned Bounding Boxes for each supported element.

    Example:
        >>> parser = IFCParserService("path/to/model.ifc", batch_size=200)
        >>> parsed = parser.parse()
        >>> print(f"Parsed {parsed.element_count} elements")
    """

    def __init__(self, ifc_path: str | Path, batch_size: int = 500) -> None:
        """Initialize the parser with file path and processing options.

        Args:
            ifc_path: Path to the IFC file to parse.
            batch_size: Number of elements to process per batch.
                Lower values reduce peak memory usage.
        """
        self._ifc_path = Path(ifc_path)
        self._batch_size = batch_size
        self._model: ifcopenshell.file | None = None
        self._geom_settings: ifcopenshell.geom.settings | None = None

        if not self._ifc_path.exists():
            raise FileNotFoundError(f"IFC file not found: {self._ifc_path}")

    def parse(self) -> ParsedIFCModel:
        """Parse the IFC file and return a complete structured model.

        This is the primary entry point. It orchestrates:
        1. Opening the IFC file and configuring geometry settings
        2. Extracting spatial hierarchy (building → storey → space)
        3. Batch-processing all supported element types
        4. Extracting containment relationships

        Returns:
            A :class:`ParsedIFCModel` with all elements and relationships.

        Raises:
            FileNotFoundError: If the IFC file does not exist.
            RuntimeError: If IfcOpenShell fails to open the file.
        """
        logger.info(
            "Starting IFC parse",
            extra={"ifc_path": str(self._ifc_path)},
        )

        self._model = self._open_model()
        self._geom_settings = self._configure_geometry_settings()

        schema = self._model.schema
        logger.info("IFC schema detected", extra={"schema": schema})

        # Build hierarchy lookup maps upfront (O(n) scan, cheap)
        storey_map = self._build_storey_map()
        space_map = self._build_space_map()
        building_map = self._build_building_map()

        elements: list[IFCElement] = []
        relationships: list[IFCRelationship] = []

        # Process elements in batches
        for batch in self._iter_elements_in_batches():
            for ifc_element in batch:
                parsed = self._parse_element(
                    ifc_element, storey_map, space_map, building_map
                )
                if parsed is not None:
                    elements.append(parsed)

        # Extract structural relationships
        relationships.extend(self._extract_containment_relationships())
        relationships.extend(self._extract_host_relationships())
        relationships.extend(self._extract_space_boundary_relationships())

        result = ParsedIFCModel(
            ifc_file_path=str(self._ifc_path.resolve()),
            schema_version=schema,
            element_count=len(elements),
            elements=elements,
            relationships=relationships,
        )

        logger.info(
            "IFC parse complete",
            extra={
                "element_count": result.element_count,
                "relationship_count": len(relationships),
            },
        )
        return result

    # -------------------------------------------------------------------------
    # Private Methods
    # -------------------------------------------------------------------------

    def _open_model(self) -> ifcopenshell.file:
        """Open the IFC file with IfcOpenShell.

        Returns:
            The opened IfcOpenShell file object.

        Raises:
            RuntimeError: If the file cannot be opened.
        """
        try:
            model = ifcopenshell.open(str(self._ifc_path))
            logger.debug("IFC file opened successfully")
            return model
        except Exception as exc:
            raise RuntimeError(f"Failed to open IFC file: {self._ifc_path}") from exc

    def _configure_geometry_settings(self) -> ifcopenshell.geom.settings:
        """Configure IfcOpenShell geometry extraction settings.

        We use world coordinates so that all bounding boxes are in the
        same coordinate system, making intersection tests straightforward.

        Returns:
            Configured geometry settings object.
        """
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        settings.set(settings.APPLY_DEFAULT_MATERIALS, False)
        settings.set(settings.GENERATE_UVS, False)  # Not needed for auditing
        return settings

    def _iter_elements_in_batches(
        self,
    ) -> Generator[list[ifcopenshell.entity_instance], None, None]:
        """Yield batches of IFC elements of supported types.

        Groups elements into fixed-size batches to bound memory usage
        during geometry extraction.

        Yields:
            Lists of IfcOpenShell entity instances, each list of size
            at most ``self._batch_size``.
        """
        assert self._model is not None

        all_elements: list[ifcopenshell.entity_instance] = []
        for ifc_type in SUPPORTED_IFC_TYPES:
            try:
                all_elements.extend(self._model.by_type(ifc_type))
            except Exception:  # noqa: BLE001
                # Some IFC types may not exist in older schemas
                pass

        total = len(all_elements)
        logger.info(
            "Elements queued for processing",
            extra={"total_elements": total, "batch_size": self._batch_size},
        )

        for i in range(0, total, self._batch_size):
            batch = all_elements[i : i + self._batch_size]
            logger.debug(
                "Processing batch",
                extra={"batch_start": i, "batch_end": min(i + self._batch_size, total)},
            )
            yield batch

    def _parse_element(
        self,
        ifc_element: ifcopenshell.entity_instance,
        storey_map: dict[str, str],
        space_map: dict[str, str],
        building_map: dict[str, str],
    ) -> IFCElement | None:
        """Parse a single IFC element into an IFCElement model.

        Args:
            ifc_element: The raw IfcOpenShell entity instance.
            storey_map: Map from element GlobalId → storey GlobalId.
            space_map: Map from element GlobalId → space GlobalId.
            building_map: Map from element GlobalId → building GlobalId.

        Returns:
            A populated :class:`IFCElement`, or ``None`` if the element
            has no valid GlobalId.
        """
        assert self._model is not None

        try:
            guid = ifc_element.GlobalId
            if not guid:
                return None

            ifc_type = ifc_element.is_a()
            name = getattr(ifc_element, "Name", "") or ""
            description = getattr(ifc_element, "Description", None)
            object_type = getattr(ifc_element, "ObjectType", None)

            # Extract geometry → bounding box
            bbox = self._extract_bounding_box(ifc_element)

            # Extract Property Sets
            psets = self._extract_psets(ifc_element)

            # Derive semantic fire-safety flags
            fire_rating, is_fire_rated, load_bearing, material = self._extract_semantic_props(
                ifc_element, psets
            )

            return IFCElement(
                guid=guid,
                ifc_type=ifc_type,
                name=name,
                description=description,
                object_type=object_type,
                bounding_box=bbox,
                storey_guid=storey_map.get(guid),
                space_guid=space_map.get(guid),
                building_guid=building_map.get(guid),
                is_fire_rated=is_fire_rated,
                fire_rating_value=fire_rating,
                material=material,
                load_bearing=load_bearing,
                psets=psets,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to parse element",
                extra={"guid": getattr(ifc_element, "GlobalId", "unknown"), "error": str(exc)},
            )
            return None

    def _extract_bounding_box(
        self, ifc_element: ifcopenshell.entity_instance
    ) -> BoundingBox | None:
        """Extract a world-coordinate AABB for the given element.

        Uses the IfcOpenShell geometry engine to compute the shape,
        then derives min/max extents from the triangle mesh vertices.

        Args:
            ifc_element: The IFC entity to extract geometry from.

        Returns:
            A :class:`BoundingBox` in metres, or ``None`` if geometry
            extraction fails (e.g., abstract or non-geometric elements).
        """
        assert self._geom_settings is not None

        try:
            shape = ifcopenshell.geom.create_shape(self._geom_settings, ifc_element)
            verts = np.array(shape.geometry.verts).reshape(-1, 3)

            if len(verts) == 0:
                return None

            return BoundingBox(
                min_x=float(verts[:, 0].min()),
                min_y=float(verts[:, 1].min()),
                min_z=float(verts[:, 2].min()),
                max_x=float(verts[:, 0].max()),
                max_y=float(verts[:, 1].max()),
                max_z=float(verts[:, 2].max()),
            )
        except Exception:  # noqa: BLE001
            return None

    def _extract_psets(
        self, ifc_element: ifcopenshell.entity_instance
    ) -> list[PropertySet]:
        """Extract all Property Sets from an IFC element.

        Args:
            ifc_element: The IFC entity to extract Psets from.

        Returns:
            A list of :class:`PropertySet` instances.
        """
        psets: list[PropertySet] = []
        try:
            raw_psets = ifcopenshell.util.element.get_psets(ifc_element)
            for pset_name, props in raw_psets.items():
                cleaned: dict[str, str | float | bool | None] = {
                    k: v for k, v in props.items() if k != "id"
                }
                psets.append(PropertySet(name=pset_name, properties=cleaned))
        except Exception:  # noqa: BLE001
            pass
        return psets

    def _extract_semantic_props(
        self,
        ifc_element: ifcopenshell.entity_instance,  # noqa: ARG002
        psets: list[PropertySet],
    ) -> tuple[str | None, bool, bool, str | None]:
        """Derive fire-safety semantic properties from raw Psets.

        Args:
            ifc_element: The raw IFC element (reserved for future use).
            psets: Extracted Property Set list.

        Returns:
            A 4-tuple: (fire_rating_value, is_fire_rated, load_bearing, material).
        """
        pset_dict: dict[str, dict[str, str | float | bool | None]] = {
            p.name: p.properties for p in psets
        }

        fire_rating: str | None = None
        is_fire_rated = False
        load_bearing = False
        material: str | None = None

        # Check fire rating in common Psets
        for pset_name in ("Pset_WallCommon", "Pset_DoorCommon", "Pset_SlabCommon"):
            if pset_name in pset_dict:
                fr = pset_dict[pset_name].get("FireRating")
                if fr and str(fr).strip() not in ("", "0", "None"):
                    fire_rating = str(fr)
                    is_fire_rated = True
                    break

        # Check load bearing
        for pset_name in ("Pset_WallCommon", "Pset_SlabCommon", "Pset_ColumnCommon"):
            if pset_name in pset_dict:
                lb = pset_dict[pset_name].get("LoadBearing")
                if lb is True or str(lb).lower() == "true":
                    load_bearing = True
                    break

        # Extract material from Pset_MaterialCommon or similar
        if "Pset_MaterialCommon" in pset_dict:
            mat = pset_dict["Pset_MaterialCommon"].get("Description")
            material = str(mat) if mat else None

        return fire_rating, is_fire_rated, load_bearing, material

    # -------------------------------------------------------------------------
    # Hierarchy Map Builders
    # -------------------------------------------------------------------------

    def _build_storey_map(self) -> dict[str, str]:
        """Build a map from element GlobalId → containing storey GlobalId.

        Traverses IfcRelContainedInSpatialStructure relationships to find
        which storey contains each element.

        Returns:
            Dictionary mapping element GUID to storey GUID.
        """
        assert self._model is not None
        mapping: dict[str, str] = {}
        try:
            for rel in self._model.by_type("IfcRelContainedInSpatialStructure"):
                container = rel.RelatingStructure
                if container.is_a("IfcBuildingStorey"):
                    storey_guid = container.GlobalId
                    for elem in rel.RelatedElements or []:
                        if hasattr(elem, "GlobalId"):
                            mapping[elem.GlobalId] = storey_guid
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to build storey map", extra={"error": str(exc)})
        return mapping

    def _build_space_map(self) -> dict[str, str]:
        """Build a map from element GlobalId → containing space GlobalId.

        Returns:
            Dictionary mapping element GUID to space GUID.
        """
        assert self._model is not None
        mapping: dict[str, str] = {}
        try:
            for rel in self._model.by_type("IfcRelContainedInSpatialStructure"):
                container = rel.RelatingStructure
                if container.is_a("IfcSpace"):
                    space_guid = container.GlobalId
                    for elem in rel.RelatedElements or []:
                        if hasattr(elem, "GlobalId"):
                            mapping[elem.GlobalId] = space_guid
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to build space map", extra={"error": str(exc)})
        return mapping

    def _build_building_map(self) -> dict[str, str]:
        """Build a map from storey GlobalId → building GlobalId.

        Returns:
            Dictionary mapping storey GUID to building GUID.
        """
        assert self._model is not None
        mapping: dict[str, str] = {}
        try:
            for rel in self._model.by_type("IfcRelAggregates"):
                parent = rel.RelatingObject
                if parent.is_a("IfcBuilding"):
                    building_guid = parent.GlobalId
                    for child in rel.RelatedObjects or []:
                        if hasattr(child, "GlobalId"):
                            mapping[child.GlobalId] = building_guid
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to build building map", extra={"error": str(exc)})
        return mapping

    # -------------------------------------------------------------------------
    # Relationship Extractors
    # -------------------------------------------------------------------------

    def _extract_containment_relationships(self) -> list[IFCRelationship]:
        """Extract spatial containment relationships from the IFC model.

        Maps IfcRelContainedInSpatialStructure to CONTAINS relationships.

        Returns:
            List of CONTAINS :class:`IFCRelationship` instances.
        """
        assert self._model is not None
        rels: list[IFCRelationship] = []
        try:
            for rel in self._model.by_type("IfcRelContainedInSpatialStructure"):
                container_guid = rel.RelatingStructure.GlobalId
                for elem in rel.RelatedElements or []:
                    if hasattr(elem, "GlobalId"):
                        rels.append(
                            IFCRelationship(
                                source_guid=container_guid,
                                target_guid=elem.GlobalId,
                                relationship_type="CONTAINS",
                            )
                        )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to extract containment rels", extra={"error": str(exc)})
        return rels

    def _extract_host_relationships(self) -> list[IFCRelationship]:
        """Extract host-element relationships (doors/windows in walls).

        Maps IfcRelVoidsElement to HOSTED_BY relationships.

        Returns:
            List of HOSTED_BY :class:`IFCRelationship` instances.
        """
        assert self._model is not None
        rels: list[IFCRelationship] = []
        try:
            for rel in self._model.by_type("IfcRelVoidsElement"):
                host = rel.RelatingBuildingElement
                opening = rel.RelatedOpeningElement
                if hasattr(host, "GlobalId") and hasattr(opening, "GlobalId"):
                    rels.append(
                        IFCRelationship(
                            source_guid=opening.GlobalId,
                            target_guid=host.GlobalId,
                            relationship_type="HOSTED_BY",
                        )
                    )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to extract host rels", extra={"error": str(exc)})
        return rels

    def _extract_space_boundary_relationships(self) -> list[IFCRelationship]:
        """Extract adjacency relationships between spaces.

        Maps IfcRelSpaceBoundary to ADJACENT_TO relationships between spaces.
        These are useful for fire compartment analysis.

        Returns:
            List of ADJACENT_TO :class:`IFCRelationship` instances.
        """
        assert self._model is not None
        rels: list[IFCRelationship] = []
        try:
            for rel in self._model.by_type("IfcRelSpaceBoundary"):
                space = rel.RelatingSpace
                elem = rel.RelatedBuildingElement
                if (
                    space is not None
                    and elem is not None
                    and hasattr(space, "GlobalId")
                    and hasattr(elem, "GlobalId")
                ):
                    rels.append(
                        IFCRelationship(
                            source_guid=space.GlobalId,
                            target_guid=elem.GlobalId,
                            relationship_type="BOUNDS",
                            properties={"connection_geometry": "IfcRelSpaceBoundary"},
                        )
                    )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to extract space boundary rels", extra={"error": str(exc)})
        return rels


def parse_ifc_to_json(ifc_path: str | Path, output_path: str | Path, batch_size: int = 500) -> ParsedIFCModel:
    """Convenience function: parse an IFC file and save the result as JSON.

    Args:
        ifc_path: Path to the IFC file.
        output_path: Path where the JSON checkpoint will be written.
        batch_size: Elements per batch for memory management.

    Returns:
        The :class:`ParsedIFCModel` (also saved to disk).
    """
    parser = IFCParserService(ifc_path, batch_size=batch_size)
    result = parser.parse()

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(result.model_dump_json(indent=2), encoding="utf-8")

    logger.info(
        "IFC parse result saved",
        extra={"output_path": str(output), "element_count": result.element_count},
    )
    return result
