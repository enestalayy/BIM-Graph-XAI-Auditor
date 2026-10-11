"""
Tests — ETL Layer Unit Tests.

Tests the IFC parser models and the data exporter independently of
a real IFC file (no IfcOpenShell dependency for unit tests).
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from src.etl.data_exporter import DataExporter
from src.etl.models import BoundingBox, IFCElement, IFCRelationship, ParsedIFCModel, PropertySet


# ---------------------------------------------------------------------------
# BoundingBox Tests
# ---------------------------------------------------------------------------


class TestBoundingBox:
    """Unit tests for the BoundingBox Pydantic model."""

    def test_valid_bounding_box(self) -> None:
        """Test that a valid bounding box is created without errors."""
        bbox = BoundingBox(
            min_x=0.0, min_y=0.0, min_z=0.0,
            max_x=1.0, max_y=2.0, max_z=3.0,
        )
        assert bbox.volume == pytest.approx(6.0)

    def test_centroid_calculation(self) -> None:
        """Test that centroid coordinates are computed correctly."""
        bbox = BoundingBox(
            min_x=0.0, min_y=0.0, min_z=0.0,
            max_x=2.0, max_y=4.0, max_z=6.0,
        )
        assert bbox.centroid_x == pytest.approx(1.0)
        assert bbox.centroid_y == pytest.approx(2.0)
        assert bbox.centroid_z == pytest.approx(3.0)

    def test_invalid_max_less_than_min(self) -> None:
        """Test that max < min raises a validation error."""
        with pytest.raises(Exception):
            BoundingBox(
                min_x=5.0, min_y=0.0, min_z=0.0,
                max_x=1.0, max_y=2.0, max_z=3.0,  # max_x < min_x
            )

    def test_neo4j_properties_keys(self) -> None:
        """Test that to_neo4j_properties returns all expected keys."""
        bbox = BoundingBox(
            min_x=0.0, min_y=0.0, min_z=0.0,
            max_x=1.0, max_y=1.0, max_z=1.0,
        )
        props = bbox.to_neo4j_properties()
        expected_keys = {
            "bbox_min_x", "bbox_min_y", "bbox_min_z",
            "bbox_max_x", "bbox_max_y", "bbox_max_z",
            "bbox_centroid_x", "bbox_centroid_y", "bbox_centroid_z",
            "bbox_volume",
        }
        assert expected_keys == set(props.keys())


# ---------------------------------------------------------------------------
# IFCElement Tests
# ---------------------------------------------------------------------------


class TestIFCElement:
    """Unit tests for the IFCElement Pydantic model."""

    def _make_element(self, ifc_type: str = "IfcWall") -> IFCElement:
        """Create a minimal IFCElement for testing."""
        return IFCElement(
            guid="0" * 22,
            ifc_type=ifc_type,
            name="Test Wall",
        )

    def test_node_label_strips_ifc_prefix(self) -> None:
        """Test that IfcWall → Wall, IfcPipe → Pipe."""
        wall = self._make_element("IfcWall")
        assert wall.to_neo4j_node_label() == "Wall"

        pipe = self._make_element("IfcPipeSegment")
        assert pipe.to_neo4j_node_label() == "PipeSegment"

    def test_guid_must_be_22_chars(self) -> None:
        """Test that a GUID shorter or longer than 22 chars is rejected."""
        with pytest.raises(Exception):
            IFCElement(guid="short", ifc_type="IfcWall")

    def test_get_pset_value_found(self) -> None:
        """Test looking up an existing Pset property."""
        elem = IFCElement(
            guid="0" * 22,
            ifc_type="IfcWall",
            psets=[
                PropertySet(
                    name="Pset_WallCommon",
                    properties={"FireRating": "EI 90"},
                )
            ],
        )
        assert elem.get_pset_value("Pset_WallCommon", "FireRating") == "EI 90"

    def test_get_pset_value_missing(self) -> None:
        """Test that a missing Pset property returns None."""
        elem = self._make_element()
        assert elem.get_pset_value("Pset_WallCommon", "FireRating") is None


# ---------------------------------------------------------------------------
# DataExporter Tests
# ---------------------------------------------------------------------------


class TestDataExporter:
    """Tests for the DataExporter round-trip (write → read)."""

    def _make_parsed_model(self) -> ParsedIFCModel:
        """Create a minimal ParsedIFCModel for export testing."""
        element = IFCElement(
            guid="A" * 22,
            ifc_type="IfcWall",
            name="Test Wall",
            bounding_box=BoundingBox(
                min_x=0.0, min_y=0.0, min_z=0.0,
                max_x=5.0, max_y=0.3, max_z=3.0,
            ),
        )
        relationship = IFCRelationship(
            source_guid="B" * 22,
            target_guid="A" * 22,
            relationship_type="CONTAINS",
        )
        return ParsedIFCModel(
            ifc_file_path="/test/model.ifc",
            schema_version="IFC4",
            element_count=1,
            elements=[element],
            relationships=[relationship],
        )

    def test_json_round_trip(self) -> None:
        """Test that exporting to JSON and reloading produces identical data."""
        model = self._make_parsed_model()

        with tempfile.TemporaryDirectory() as tmpdir:
            exporter = DataExporter(tmpdir)
            json_path = exporter.export_json(model)

            assert json_path.exists()

            reloaded = DataExporter.load_from_json(json_path)
            assert reloaded.element_count == model.element_count
            assert reloaded.elements[0].guid == model.elements[0].guid
            assert reloaded.elements[0].ifc_type == model.elements[0].ifc_type

    def test_csv_exports_created(self) -> None:
        """Test that all expected CSV files are created."""
        model = self._make_parsed_model()

        with tempfile.TemporaryDirectory() as tmpdir:
            exporter = DataExporter(tmpdir)
            paths = exporter.export_full_model(model)

            assert paths["json"].exists()
            assert paths["elements_csv"].exists()
            assert paths["relationships_csv"].exists()

    def test_elements_csv_contains_guid(self) -> None:
        """Test that the elements CSV contains the expected GUID."""
        model = self._make_parsed_model()

        with tempfile.TemporaryDirectory() as tmpdir:
            exporter = DataExporter(tmpdir)
            paths = exporter.export_full_model(model)

            csv_content = paths["elements_csv"].read_text(encoding="utf-8")
            assert "A" * 22 in csv_content
