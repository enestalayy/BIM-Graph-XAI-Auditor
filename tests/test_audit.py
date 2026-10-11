"""
Tests — Spatial Geometry Unit Tests.

Tests the BoundingBox3D AABB intersection logic with precise edge cases
critical for engineering audit correctness.
"""

from __future__ import annotations

import pytest

from src.audit.geometry import BoundingBox3D
from src.audit.rules import ACTIVE_RULES, get_rule_by_id, get_rules_for_labels


# ---------------------------------------------------------------------------
# BoundingBox3D Tests
# ---------------------------------------------------------------------------


class TestBoundingBox3D:
    """Tests for 3D AABB intersection and volume computations."""

    def _box(
        self,
        x0: float, y0: float, z0: float,
        x1: float, y1: float, z1: float,
        guid: str = "test",
    ) -> BoundingBox3D:
        return BoundingBox3D(min_x=x0, min_y=y0, min_z=z0,
                             max_x=x1, max_y=y1, max_z=z1, guid=guid)

    def test_clearly_intersecting(self) -> None:
        """Two overlapping boxes should intersect."""
        a = self._box(0, 0, 0, 2, 2, 2)
        b = self._box(1, 1, 1, 3, 3, 3)
        assert a.intersects(b) is True

    def test_clearly_disjoint(self) -> None:
        """Two separated boxes should not intersect."""
        a = self._box(0, 0, 0, 1, 1, 1)
        b = self._box(2, 2, 2, 3, 3, 3)
        assert a.intersects(b) is False

    def test_touching_faces_no_tolerance(self) -> None:
        """Boxes that share a face (no gap) should intersect with zero tolerance."""
        a = self._box(0, 0, 0, 1, 1, 1)
        b = self._box(1, 0, 0, 2, 1, 1)  # Share face at x=1
        assert a.intersects(b, tolerance=0.0) is True

    def test_gap_within_tolerance(self) -> None:
        """A small gap within the tolerance should be reported as intersection."""
        a = self._box(0, 0, 0, 1.0, 1, 1)
        b = self._box(1.005, 0, 0, 2.0, 1, 1)  # 5mm gap
        assert a.intersects(b, tolerance=0.0) is False
        assert a.intersects(b, tolerance=0.01) is True  # 1cm tolerance covers 5mm gap

    def test_gap_exceeds_tolerance(self) -> None:
        """A gap larger than the tolerance should NOT be reported as intersection."""
        a = self._box(0, 0, 0, 1.0, 1, 1)
        b = self._box(1.05, 0, 0, 2.0, 1, 1)  # 5cm gap
        assert a.intersects(b, tolerance=0.01) is False

    def test_intersection_volume_correct(self) -> None:
        """Intersection volume should be correctly computed for known overlap."""
        a = self._box(0, 0, 0, 2, 2, 2)
        b = self._box(1, 1, 1, 3, 3, 3)
        # Overlap: 1×1×1 = 1.0 m³
        assert a.intersection_volume(b) == pytest.approx(1.0)

    def test_intersection_volume_no_overlap(self) -> None:
        """Non-intersecting boxes should have zero intersection volume."""
        a = self._box(0, 0, 0, 1, 1, 1)
        b = self._box(5, 5, 5, 6, 6, 6)
        assert a.intersection_volume(b) == pytest.approx(0.0)

    def test_centroid_calculation(self) -> None:
        """Centroid should be the geometric centre of the box."""
        box = self._box(0, 0, 0, 4, 6, 8)
        cx, cy, cz = box.centroid()
        assert cx == pytest.approx(2.0)
        assert cy == pytest.approx(3.0)
        assert cz == pytest.approx(4.0)

    def test_volume_calculation(self) -> None:
        """Volume should equal width × depth × height."""
        box = self._box(0, 0, 0, 5, 3, 2)
        assert box.volume() == pytest.approx(30.0)

    def test_z_ranges_overlap(self) -> None:
        """Z-range overlap check should correctly identify overlapping extents."""
        a = self._box(0, 0, 0, 1, 1, 3)
        b = self._box(0, 0, 2, 1, 1, 5)  # Z overlap: [2, 3]
        assert a.z_ranges_overlap(b) is True

        c = self._box(0, 0, 4, 1, 1, 6)  # No Z overlap
        assert a.z_ranges_overlap(c) is False

    def test_from_neo4j_node(self) -> None:
        """Test construction from a Neo4j-like property dict."""
        props = {
            "bbox_min_x": 0.0, "bbox_min_y": 0.0, "bbox_min_z": 0.0,
            "bbox_max_x": 1.0, "bbox_max_y": 2.0, "bbox_max_z": 3.0,
            "guid": "test_guid_22_chars_00",
        }
        box = BoundingBox3D.from_neo4j_node(props)
        assert box.min_x == 0.0
        assert box.max_z == 3.0
        assert box.guid == "test_guid_22_chars_00"


# ---------------------------------------------------------------------------
# Rule Registry Tests
# ---------------------------------------------------------------------------


class TestRuleRegistry:
    """Tests for the BYKHY 2015 rule registry."""

    def test_active_rules_not_empty(self) -> None:
        """There must be at least one active rule."""
        assert len(ACTIVE_RULES) > 0

    def test_all_rules_have_unique_ids(self) -> None:
        """All rule IDs must be unique."""
        ids = [r.rule_id for r in ACTIVE_RULES]
        assert len(ids) == len(set(ids))

    def test_get_rule_by_id_found(self) -> None:
        """Should return the correct rule for a known rule_id."""
        rule = get_rule_by_id("BYKHY-2015-M51-R001")
        assert rule is not None
        assert rule.severity == "CRITICAL"
        assert "Pipe" in rule.source_labels
        assert "FireWall" in rule.target_labels

    def test_get_rule_by_id_not_found(self) -> None:
        """Should return None for an unknown rule_id."""
        assert get_rule_by_id("NONEXISTENT-RULE-999") is None

    def test_get_rules_for_pipe_and_firewall(self) -> None:
        """Should return at least one rule for Pipe vs FireWall."""
        rules = get_rules_for_labels(["Pipe", "Element"], ["FireWall", "Element"])
        assert len(rules) >= 1
        assert any(r.rule_id == "BYKHY-2015-M51-R001" for r in rules)

    def test_get_rules_for_unrelated_types(self) -> None:
        """Should return no rules for unrelated element types."""
        rules = get_rules_for_labels(["Slab"], ["Column"])
        assert len(rules) == 0

    def test_critical_rules_have_mitigation(self) -> None:
        """All CRITICAL severity rules must specify required mitigation."""
        for rule in ACTIVE_RULES:
            if rule.severity == "CRITICAL":
                assert rule.required_mitigation_labels is not None, (
                    f"CRITICAL rule {rule.rule_id} has no mitigation labels defined"
                )
