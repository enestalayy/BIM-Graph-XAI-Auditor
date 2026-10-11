"""
ETL Layer — Data Export Service.

Writes the output of the IFC parser to intermediate file formats
(JSON and CSV) that act as checkpoints between pipeline stages.

This decoupling is critical for large IFC models: if the graph
construction fails, the re-run resumes from the checkpoint rather
than re-parsing the IFC file (which can take minutes).
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from src.etl.models import IFCElement, IFCRelationship, ParsedIFCModel
from src.logger import get_logger

logger = get_logger(__name__)


class DataExporter:
    """Exports parsed IFC data to JSON and CSV checkpoint files.

    Attributes:
        output_dir: Base directory where processed files are written.
    """

    def __init__(self, output_dir: str | Path) -> None:
        """Initialize the exporter with an output directory.

        Args:
            output_dir: Directory where exported files will be written.
                Created if it does not exist.
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_full_model(self, model: ParsedIFCModel) -> dict[str, Path]:
        """Export all parsed data to disk.

        Writes three files:
        - ``elements.json``: Full model dump (used by graph builder)
        - ``elements.csv``: Flat CSV for quick inspection / Excel
        - ``relationships.csv``: Relationship list for graph builder

        Args:
            model: The parsed IFC model to export.

        Returns:
            A dictionary mapping file type to the written :class:`Path`.
        """
        paths: dict[str, Path] = {}

        paths["json"] = self.export_json(model)
        paths["elements_csv"] = self.export_elements_csv(model.elements)
        paths["relationships_csv"] = self.export_relationships_csv(model.relationships)

        logger.info(
            "Full model exported",
            extra={
                "output_dir": str(self.output_dir),
                "element_count": model.element_count,
                "rel_count": len(model.relationships),
            },
        )
        return paths

    def export_json(self, model: ParsedIFCModel) -> Path:
        """Serialize the full ParsedIFCModel to a JSON checkpoint file.

        Args:
            model: The model to serialize.

        Returns:
            Path to the written JSON file.
        """
        output_path = self.output_dir / "elements.json"
        output_path.write_text(model.model_dump_json(indent=2), encoding="utf-8")
        logger.debug("JSON checkpoint written", extra={"path": str(output_path)})
        return output_path

    def export_elements_csv(self, elements: list[IFCElement]) -> Path:
        """Write a flat CSV of element properties for quick inspection.

        Args:
            elements: List of IFC elements to export.

        Returns:
            Path to the written CSV file.
        """
        output_path = self.output_dir / "elements.csv"

        fieldnames = [
            "guid",
            "ifc_type",
            "name",
            "storey_guid",
            "space_guid",
            "is_fire_rated",
            "fire_rating_value",
            "load_bearing",
            "material",
            "bbox_min_x",
            "bbox_min_y",
            "bbox_min_z",
            "bbox_max_x",
            "bbox_max_y",
            "bbox_max_z",
            "bbox_volume",
        ]

        with output_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for elem in elements:
                row: dict[str, object] = {
                    "guid": elem.guid,
                    "ifc_type": elem.ifc_type,
                    "name": elem.name,
                    "storey_guid": elem.storey_guid or "",
                    "space_guid": elem.space_guid or "",
                    "is_fire_rated": elem.is_fire_rated,
                    "fire_rating_value": elem.fire_rating_value or "",
                    "load_bearing": elem.load_bearing,
                    "material": elem.material or "",
                }
                if elem.bounding_box:
                    row.update(
                        {
                            "bbox_min_x": elem.bounding_box.min_x,
                            "bbox_min_y": elem.bounding_box.min_y,
                            "bbox_min_z": elem.bounding_box.min_z,
                            "bbox_max_x": elem.bounding_box.max_x,
                            "bbox_max_y": elem.bounding_box.max_y,
                            "bbox_max_z": elem.bounding_box.max_z,
                            "bbox_volume": elem.bounding_box.volume,
                        }
                    )
                writer.writerow(row)

        logger.debug(
            "Elements CSV written",
            extra={"path": str(output_path), "count": len(elements)},
        )
        return output_path

    def export_relationships_csv(self, relationships: list[IFCRelationship]) -> Path:
        """Write a flat CSV of all IFC relationships.

        Args:
            relationships: List of relationships to export.

        Returns:
            Path to the written CSV file.
        """
        output_path = self.output_dir / "relationships.csv"

        fieldnames = ["source_guid", "target_guid", "relationship_type", "properties"]

        with output_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for rel in relationships:
                writer.writerow(
                    {
                        "source_guid": rel.source_guid,
                        "target_guid": rel.target_guid,
                        "relationship_type": rel.relationship_type,
                        "properties": json.dumps(rel.properties) if rel.properties else "{}",
                    }
                )

        logger.debug(
            "Relationships CSV written",
            extra={"path": str(output_path), "count": len(relationships)},
        )
        return output_path

    @staticmethod
    def load_from_json(json_path: str | Path) -> ParsedIFCModel:
        """Load a previously exported JSON checkpoint back into memory.

        Args:
            json_path: Path to the JSON file written by :meth:`export_json`.

        Returns:
            A reconstructed :class:`ParsedIFCModel`.

        Raises:
            FileNotFoundError: If the checkpoint file does not exist.
        """
        path = Path(json_path)
        if not path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {path}")

        data = json.loads(path.read_text(encoding="utf-8"))
        model = ParsedIFCModel.model_validate(data)
        logger.info(
            "JSON checkpoint loaded",
            extra={"path": str(path), "element_count": model.element_count},
        )
        return model
