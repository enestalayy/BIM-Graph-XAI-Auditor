"""
Graph Layer — Knowledge Graph Builder Service.

Transforms parsed IFC data (IFCElement / IFCRelationship models)
into a Neo4j Labeled Property Graph.

Node labeling strategy:
    Every building element gets two labels:
    1. ``:Element`` — the base label, always present, enables global queries.
    2. A type-specific label (e.g., ``:Wall``, ``:Pipe``) derived from the IFC type.

    This dual-label approach allows both:
    - ``MATCH (e:Element)`` — query all elements
    - ``MATCH (w:Wall)`` — query only walls (fast, type-indexed)

Relationship types written to the graph:
    - CONTAINS  : Spatial structure containment (Building→Storey→Space→Element)
    - HOSTED_BY : Door/Window hosted in a Wall
    - BOUNDS    : Space boundary relationship
    - PART_OF   : Aggregation relationships
"""

from __future__ import annotations

import json
from typing import Any

from src.etl.models import IFCElement, IFCRelationship, ParsedIFCModel
from src.graph.neo4j_repository import Neo4jRepository
from src.logger import get_logger

logger = get_logger(__name__)

# Cypher template for bulk node creation.
# Uses MERGE on guid (unique constraint) so re-runs are idempotent.
_MERGE_ELEMENT_CYPHER = """
UNWIND $batch AS row
MERGE (e:Element {guid: row.guid})
SET e += row.props
WITH e, row
CALL apoc.create.addLabels(e, [row.type_label]) YIELD node
RETURN count(node) AS created
"""

# Fallback without APOC (slower but compatible with all Neo4j setups).
_MERGE_ELEMENT_NO_APOC_CYPHER = """
UNWIND $batch AS row
MERGE (e:Element {guid: row.guid})
SET e += row.props
RETURN count(e) AS created
"""

# Cypher for bulk relationship creation.
_MERGE_RELATIONSHIP_CYPHER = """
UNWIND $batch AS row
MATCH (src:Element {guid: row.source_guid})
MATCH (tgt:Element {guid: row.target_guid})
CALL apoc.merge.relationship(src, row.rel_type, {}, row.props, tgt) YIELD rel
RETURN count(rel) AS created
"""

_MERGE_RELATIONSHIP_NO_APOC_CYPHER = """
UNWIND $batch AS row
MATCH (src:Element {guid: row.source_guid})
MATCH (tgt:Element {guid: row.target_guid})
MERGE (src)-[r:CONTAINS]->(tgt)
SET r += row.props
RETURN count(r) AS created
"""


class GraphBuilderService:
    """Builds the Neo4j Knowledge Graph from parsed IFC data.

    Coordinates node creation, relationship creation, and post-processing
    enrichment (e.g., marking fire walls, fire dampers).

    Example:
        >>> repo = Neo4jRepository(...)
        >>> repo.connect()
        >>> builder = GraphBuilderService(repo, use_apoc=True)
        >>> builder.build(parsed_model)
    """

    def __init__(
        self,
        repo: Neo4jRepository,
        batch_size: int = 500,
        use_apoc: bool = True,
    ) -> None:
        """Initialize the builder.

        Args:
            repo: A connected :class:`Neo4jRepository` instance.
            batch_size: Number of nodes/relationships per write transaction.
            use_apoc: Whether to use APOC procedures for dynamic labels
                and relationship types. Set to ``False`` if APOC is not
                installed (labels will be applied in a separate pass).
        """
        self._repo = repo
        self._batch_size = batch_size
        self._use_apoc = use_apoc

    def build(self, model: ParsedIFCModel, clear_first: bool = False) -> dict[str, int]:
        """Build the full Knowledge Graph from a parsed IFC model.

        Args:
            model: The parsed IFC model from the ETL layer.
            clear_first: If ``True``, clears the database before importing.
                Use only during development or full re-imports.

        Returns:
            A summary dict with counts: ``{"nodes": N, "relationships": M}``.
        """
        logger.info(
            "Starting Knowledge Graph build",
            extra={"element_count": model.element_count, "clear_first": clear_first},
        )

        if clear_first:
            self._repo.clear_database()

        node_count = self._create_elements(model.elements)
        rel_count = self._create_relationships(model.relationships)

        # Post-processing: mark fire walls and dampers using semantic flags.
        self._enrich_fire_safety_labels()

        summary = {"nodes": node_count, "relationships": rel_count}
        logger.info("Knowledge Graph build complete", extra=summary)
        return summary

    # -------------------------------------------------------------------------
    # Node Creation
    # -------------------------------------------------------------------------

    def _create_elements(self, elements: list[IFCElement]) -> int:
        """Bulk-create or update Element nodes in Neo4j.

        Args:
            elements: List of parsed IFC elements.

        Returns:
            Total number of nodes created/merged.
        """
        batch_records = [self._element_to_node_record(e) for e in elements]

        if self._use_apoc:
            cypher = _MERGE_ELEMENT_CYPHER
        else:
            cypher = _MERGE_ELEMENT_NO_APOC_CYPHER

        total = self._repo.execute_batch(cypher, batch_records, self._batch_size)

        # If not using APOC, apply type labels in a separate pass.
        if not self._use_apoc:
            self._apply_type_labels_manual(elements)

        logger.info("Element nodes written", extra={"count": total})
        return total

    def _element_to_node_record(self, elem: IFCElement) -> dict[str, Any]:
        """Convert an IFCElement to a Neo4j-compatible property map.

        Args:
            elem: The IFC element to convert.

        Returns:
            A dict with ``guid``, ``type_label``, and ``props`` keys.
        """
        props: dict[str, Any] = {
            "guid": elem.guid,
            "ifc_type": elem.ifc_type,
            "name": elem.name,
            "is_fire_rated": elem.is_fire_rated,
            "load_bearing": elem.load_bearing,
        }

        if elem.description:
            props["description"] = elem.description
        if elem.object_type:
            props["object_type"] = elem.object_type
        if elem.storey_guid:
            props["storey_guid"] = elem.storey_guid
        if elem.space_guid:
            props["space_guid"] = elem.space_guid
        if elem.building_guid:
            props["building_guid"] = elem.building_guid
        if elem.fire_rating_value:
            props["fire_rating_value"] = elem.fire_rating_value
        if elem.material:
            props["material"] = elem.material

        # Flatten bounding box
        if elem.bounding_box:
            props.update(elem.bounding_box.to_neo4j_properties())

        # Serialize Psets as JSON string (Neo4j doesn't support nested objects)
        if elem.psets:
            props["psets_json"] = json.dumps(
                [{"name": p.name, "properties": p.properties} for p in elem.psets]
            )

        return {
            "guid": elem.guid,
            "type_label": elem.to_neo4j_node_label(),
            "props": props,
        }

    def _apply_type_labels_manual(self, elements: list[IFCElement]) -> None:
        """Apply type-specific labels without APOC (fallback path).

        Groups elements by IFC type and applies labels in batch per type.
        Less efficient than APOC but works on Community Edition without APOC.

        Args:
            elements: List of elements to label.
        """
        # Group by type label
        type_groups: dict[str, list[str]] = {}
        for elem in elements:
            label = elem.to_neo4j_node_label()
            type_groups.setdefault(label, []).append(elem.guid)

        for label, guids in type_groups.items():
            # Dynamic labels require raw Cypher with f-string.
            # This is safe because `label` comes from IFC type stripping (controlled input).
            cypher = f"""
            UNWIND $guids AS guid
            MATCH (e:Element {{guid: guid}})
            SET e:{label}
            """
            self._repo.execute_query(cypher, {"guids": guids}, write=True)
            logger.debug("Type labels applied", extra={"label": label, "count": len(guids)})

    # -------------------------------------------------------------------------
    # Relationship Creation
    # -------------------------------------------------------------------------

    def _create_relationships(self, relationships: list[IFCRelationship]) -> int:
        """Bulk-create relationships between Element nodes.

        Args:
            relationships: List of IFC relationships to write.

        Returns:
            Total number of relationships created/merged.
        """
        if not relationships:
            return 0

        # Group relationships by type for efficient batch processing.
        type_groups: dict[str, list[IFCRelationship]] = {}
        for rel in relationships:
            type_groups.setdefault(rel.relationship_type, []).append(rel)

        total = 0
        for rel_type, rels in type_groups.items():
            count = self._create_typed_relationships(rel_type, rels)
            total += count
            logger.debug(
                "Relationships written",
                extra={"type": rel_type, "count": count},
            )

        logger.info("All relationships written", extra={"total": total})
        return total

    def _create_typed_relationships(
        self, rel_type: str, relationships: list[IFCRelationship]
    ) -> int:
        """Create all relationships of a single type.

        Args:
            rel_type: The Cypher relationship type string.
            relationships: Relationships of this type.

        Returns:
            Number of relationships written.
        """
        # rel_type is safe to interpolate: it comes from controlled IFC parsing.
        cypher = f"""
        UNWIND $batch AS row
        MATCH (src:Element {{guid: row.source_guid}})
        MATCH (tgt:Element {{guid: row.target_guid}})
        MERGE (src)-[r:{rel_type}]->(tgt)
        SET r += row.props
        RETURN count(r) AS created
        """
        batch = [
            {
                "source_guid": r.source_guid,
                "target_guid": r.target_guid,
                "props": r.properties,
            }
            for r in relationships
        ]
        return self._repo.execute_batch(cypher, batch, self._batch_size)

    # -------------------------------------------------------------------------
    # Semantic Enrichment
    # -------------------------------------------------------------------------

    def _enrich_fire_safety_labels(self) -> None:
        """Add semantic fire-safety labels based on element properties.

        This post-processing step adds domain-specific labels that the
        clash detection rules use directly:
        - ``:FireWall`` — walls with a fire rating (EI 30, EI 60, EI 90...)
        - ``:FireDamper`` — IfcDamper elements tagged as fire dampers

        This is the "semantic enrichment" step that bridges raw IFC data
        with fire-safety domain knowledge.
        """
        logger.info("Applying fire-safety semantic labels")

        # Label fire-rated walls
        self._repo.execute_query(
            """
            MATCH (e:Element)
            WHERE e.is_fire_rated = true AND e.ifc_type IN ['IfcWall', 'IfcWallStandardCase']
            SET e:FireWall
            """,
            write=True,
        )

        # Label fire dampers (IfcDamper with fire classification)
        self._repo.execute_query(
            """
            MATCH (e:Element)
            WHERE e.ifc_type = 'IfcDamper'
            SET e:FireDamper
            """,
            write=True,
        )

        # Label fire suppression terminals (sprinklers, etc.)
        self._repo.execute_query(
            """
            MATCH (e:Element)
            WHERE e.ifc_type = 'IfcFireSuppressionTerminal'
            SET e:FireSuppression
            """,
            write=True,
        )

        # Label pipe segments as Pipe for cleaner rule queries
        self._repo.execute_query(
            """
            MATCH (e:Element)
            WHERE e.ifc_type IN ['IfcPipeSegment', 'IfcPipeFitting']
            SET e:Pipe
            """,
            write=True,
        )

        # Label HVAC duct segments
        self._repo.execute_query(
            """
            MATCH (e:Element)
            WHERE e.ifc_type IN ['IfcDuctSegment', 'IfcDuctFitting']
            SET e:Duct
            """,
            write=True,
        )

        logger.info("Fire-safety semantic labels applied")
