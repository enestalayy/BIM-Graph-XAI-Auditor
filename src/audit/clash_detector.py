"""
Audit Layer — Clash Detector Service.

Implements deterministic spatial reasoning to detect fire-safety code
violations in the Neo4j Knowledge Graph.

Algorithm Overview:
    1. SPATIAL PRE-FILTER (Cypher):
       Query Neo4j for candidate element pairs using bounding-box Z-range
       overlap on the same storey. This reduces the O(n²) comparison space
       dramatically — e.g., from 10,000² to <1,000 candidate pairs.

    2. AABB INTERSECTION TEST (Python):
       For each candidate pair, load their BoundingBox3D from node
       properties and call `intersects()`. Eliminates false positives
       from the Z-range pre-filter.

    3. RULE EVALUATION (Python + Cypher):
       For confirmed intersections, evaluate all applicable ClashRules.
       For rules with `required_mitigation_labels`, query the graph for
       a mitigating element near the clash centroid.

    4. WRITE RESULTS (Cypher):
       Write confirmed violations as `CLASH_OCCURRED` relationships with
       full metadata (rule_id, severity, volume, detected_at).

Precision Guarantee:
    Every clash written to the graph has:
    - A GlobalId pair (element_a_guid, element_b_guid)
    - A rule_id tied to a specific regulation clause
    - An intersection_volume in m³
    These enable Precision/Recall computation against a gold standard.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from src.audit.geometry import BoundingBox3D
from src.audit.rules import ACTIVE_RULES, ClashRule, get_rules_for_labels
from src.config import settings
from src.graph.neo4j_repository import Neo4jRepository
from src.logger import get_logger

logger = get_logger(__name__)

# Cypher: fetch candidate pairs using spatial pre-filtering.
# Only pairs on the same storey with overlapping Z extents are returned.
# Labels of both elements are returned as lists for rule matching.
_CANDIDATE_PAIRS_CYPHER = """
MATCH (a:Element), (b:Element)
WHERE
    a.guid < b.guid
    AND a.storey_guid IS NOT NULL
    AND a.storey_guid = b.storey_guid
    AND a.bbox_min_z IS NOT NULL
    AND b.bbox_min_z IS NOT NULL
    AND a.bbox_min_z <= b.bbox_max_z + $tolerance
    AND a.bbox_max_z >= b.bbox_min_z - $tolerance
    AND a.ifc_type IN $source_types
    AND b.ifc_type IN $target_types
RETURN
    a.guid AS guid_a,
    a.ifc_type AS type_a,
    a.storey_guid AS storey_a,
    a.is_fire_rated AS fire_rated_a,
    a.bbox_min_x AS a_min_x, a.bbox_min_y AS a_min_y, a.bbox_min_z AS a_min_z,
    a.bbox_max_x AS a_max_x, a.bbox_max_y AS a_max_y, a.bbox_max_z AS a_max_z,
    b.guid AS guid_b,
    b.ifc_type AS type_b,
    b.storey_guid AS storey_b,
    b.is_fire_rated AS fire_rated_b,
    b.bbox_min_x AS b_min_x, b.bbox_min_y AS b_min_y, b.bbox_min_z AS b_min_z,
    b.bbox_max_x AS b_max_x, b.bbox_max_y AS b_max_y, b.bbox_max_z AS b_max_z,
    labels(a) AS labels_a,
    labels(b) AS labels_b
"""

# Cypher: check for a mitigating element (e.g., FireDamper) near a clash.
_MITIGATION_CHECK_CYPHER = """
MATCH (m:Element)
WHERE
    ANY(lbl IN $mitigation_labels WHERE lbl IN labels(m))
    AND m.bbox_centroid_x IS NOT NULL
    AND abs(m.bbox_centroid_x - $cx) < $radius
    AND abs(m.bbox_centroid_y - $cy) < $radius
    AND abs(m.bbox_centroid_z - $cz) < $radius
RETURN count(m) AS mitigation_count
"""

# Cypher: write a clash as a CLASH_OCCURRED relationship.
_WRITE_CLASH_CYPHER = """
MATCH (a:Element {guid: $guid_a}), (b:Element {guid: $guid_b})
MERGE (a)-[r:CLASH_OCCURRED {rule_id: $rule_id, guid_a: $guid_a, guid_b: $guid_b}]->(b)
SET
    r.clash_id = $clash_id,
    r.severity = $severity,
    r.intersection_volume_m3 = $volume,
    r.regulation_clause = $regulation_clause,
    r.description = $description,
    r.detected_at = $detected_at,
    r.centroid_x = $cx,
    r.centroid_y = $cy,
    r.centroid_z = $cz,
    r.mitigation_checked = $mitigation_checked,
    r.mitigation_found = $mitigation_found
RETURN r.clash_id AS clash_id
"""


class ClashDetectorService:
    """Deterministic fire-safety clash detector.

    Queries the Neo4j Knowledge Graph to find element pairs that violate
    BYKHY 2015 fire-safety rules, then writes results back as
    CLASH_OCCURRED relationships.

    Example:
        >>> repo = Neo4jRepository(...)
        >>> repo.connect()
        >>> detector = ClashDetectorService(repo)
        >>> result = detector.run()
        >>> print(f"Found {result['total_clashes']} violations")
    """

    def __init__(
        self,
        repo: Neo4jRepository,
        tolerance_m: float | None = None,
        min_volume_m3: float | None = None,
        mitigation_radius_m: float = 1.0,
    ) -> None:
        """Initialize the clash detector.

        Args:
            repo: Connected :class:`Neo4jRepository` instance.
            tolerance_m: AABB intersection tolerance in metres. Defaults
                to the value in application settings (0.01 m).
            min_volume_m3: Minimum intersection volume to report as a clash.
                Filters out surface contacts. Defaults to settings value.
            mitigation_radius_m: Search radius (metres) for locating
                mitigating elements (e.g., fire dampers) near a clash centroid.
        """
        self._repo = repo
        self._tolerance = tolerance_m if tolerance_m is not None else settings.clash_tolerance_m
        self._min_volume = (
            min_volume_m3 if min_volume_m3 is not None else settings.min_intersection_volume
        )
        self._mitigation_radius = mitigation_radius_m

    def run(self) -> dict[str, int]:
        """Execute clash detection and write results to Neo4j.

        Returns:
            A summary dict:
            - ``candidates_evaluated``: Total candidate pairs tested
            - ``intersections_found``: Pairs with confirmed AABB overlap
            - ``total_clashes``: Violations written to the graph
            - ``critical_count``: CRITICAL severity violations
            - ``major_count``: MAJOR severity violations
            - ``minor_count``: MINOR severity violations
        """
        logger.info("Clash detection started", extra={"tolerance_m": self._tolerance})

        total_candidates = 0
        total_intersections = 0
        clash_records: list[dict[str, Any]] = []

        # Collect all IFC types involved in any active rule
        source_ifc_types = self._get_source_ifc_types()
        target_ifc_types = self._get_target_ifc_types()

        logger.info(
            "Querying candidate pairs",
            extra={
                "source_types": source_ifc_types,
                "target_types": target_ifc_types,
            },
        )

        candidates = self._repo.execute_query(
            _CANDIDATE_PAIRS_CYPHER,
            {
                "tolerance": self._tolerance,
                "source_types": source_ifc_types,
                "target_types": target_ifc_types,
            },
        )

        total_candidates = len(candidates)
        logger.info("Candidate pairs retrieved", extra={"count": total_candidates})

        for record in candidates:
            # Build BoundingBox3D objects from the flat record
            bbox_a = BoundingBox3D(
                min_x=record["a_min_x"],
                min_y=record["a_min_y"],
                min_z=record["a_min_z"],
                max_x=record["a_max_x"],
                max_y=record["a_max_y"],
                max_z=record["a_max_z"],
                guid=record["guid_a"],
            )
            bbox_b = BoundingBox3D(
                min_x=record["b_min_x"],
                min_y=record["b_min_y"],
                min_z=record["b_min_z"],
                max_x=record["b_max_x"],
                max_y=record["b_max_y"],
                max_z=record["b_max_z"],
                guid=record["guid_b"],
            )

            # Full 3D AABB intersection test
            if not bbox_a.intersects(bbox_b, tolerance=self._tolerance):
                continue

            volume = bbox_a.intersection_volume(bbox_b)
            if volume < self._min_volume:
                continue  # Trivial surface contact — skip

            total_intersections += 1

            # Find applicable rules for this pair's labels
            labels_a: list[str] = list(record["labels_a"])
            labels_b: list[str] = list(record["labels_b"])

            applicable_rules = get_rules_for_labels(labels_a, labels_b)
            # Also check the reverse direction
            if not applicable_rules:
                applicable_rules = get_rules_for_labels(labels_b, labels_a)
                if applicable_rules:
                    # Swap so that 'a' is always the source (penetrating element)
                    record["guid_a"], record["guid_b"] = record["guid_b"], record["guid_a"]
                    labels_a, labels_b = labels_b, labels_a

            for rule in applicable_rules:
                clash = self._evaluate_rule(rule, record, bbox_a, bbox_b, volume)
                if clash is not None:
                    clash_records.append(clash)

        # Write all detected clashes to Neo4j in one batch
        if clash_records:
            self._write_clashes(clash_records)

        summary = self._build_summary(total_candidates, total_intersections, clash_records)
        logger.info("Clash detection complete", extra=summary)
        return summary

    # -------------------------------------------------------------------------
    # Rule Evaluation
    # -------------------------------------------------------------------------

    def _evaluate_rule(
        self,
        rule: ClashRule,
        record: Any,
        bbox_a: BoundingBox3D,
        bbox_b: BoundingBox3D,
        volume: float,
    ) -> dict[str, Any] | None:
        """Evaluate a single rule against a confirmed intersection.

        For rules with ``required_mitigation_labels``, queries Neo4j to check
        if a mitigating element exists near the clash centroid.

        For property-based rules (e.g., door not fire-rated), checks the
        ``is_fire_rated`` property on the relevant node.

        Args:
            rule: The rule being evaluated.
            record: The Neo4j record with element properties.
            bbox_a: Bounding box of element A (source).
            bbox_b: Bounding box of element B (target).
            volume: Intersection volume in m³.

        Returns:
            A clash record dict if a violation is confirmed, else ``None``.
        """
        cx_a, cy_a, cz_a = bbox_a.centroid()
        cx_b, cy_b, cz_b = bbox_b.centroid()
        # Clash centroid: midpoint of the two element centroids
        cx = (cx_a + cx_b) / 2.0
        cy = (cy_a + cy_b) / 2.0
        cz = (cz_a + cz_b) / 2.0

        mitigation_checked = False
        mitigation_found = False

        # --- Case 1: Mitigation element check (pipes/ducts through fire walls) ---
        if rule.required_mitigation_labels is not None:
            mitigation_checked = True
            result = self._repo.execute_query(
                _MITIGATION_CHECK_CYPHER,
                {
                    "mitigation_labels": rule.required_mitigation_labels,
                    "cx": cx,
                    "cy": cy,
                    "cz": cz,
                    "radius": self._mitigation_radius,
                },
            )
            mitigation_count = result[0]["mitigation_count"] if result else 0
            mitigation_found = mitigation_count > 0

            if mitigation_found:
                # Mitigating element found → not a violation
                logger.debug(
                    "Mitigation found, skipping clash",
                    extra={
                        "rule_id": rule.rule_id,
                        "guid_a": record["guid_a"],
                        "guid_b": record["guid_b"],
                    },
                )
                return None

        # --- Case 2: Property-based check (door/window fire rating) ---
        if rule.rule_id in ("BYKHY-2015-M52-R003", "BYKHY-2015-M52-R005"):
            # The source element (door/window) must NOT be fire-rated to be a violation
            source_is_fire_rated = bool(record.get("fire_rated_a", False))
            if source_is_fire_rated:
                return None  # Door/window is properly fire-rated — no violation

        # --- Confirmed violation ---
        clash_id = str(uuid.uuid4())
        return {
            "clash_id": clash_id,
            "guid_a": record["guid_a"],
            "guid_b": record["guid_b"],
            "rule_id": rule.rule_id,
            "severity": rule.severity,
            "volume": round(volume, 6),
            "regulation_clause": rule.regulation_clause,
            "description": rule.description,
            "detected_at": datetime.now(tz=timezone.utc).isoformat(),
            "cx": round(cx, 4),
            "cy": round(cy, 4),
            "cz": round(cz, 4),
            "mitigation_checked": mitigation_checked,
            "mitigation_found": mitigation_found,
        }

    # -------------------------------------------------------------------------
    # Result Writing
    # -------------------------------------------------------------------------

    def _write_clashes(self, clashes: list[dict[str, Any]]) -> None:
        """Write all detected clashes to Neo4j as CLASH_OCCURRED relationships.

        Args:
            clashes: List of clash record dicts from :meth:`_evaluate_rule`.
        """
        logger.info("Writing clash results to Neo4j", extra={"count": len(clashes)})
        for clash in clashes:
            try:
                self._repo.execute_query(
                    _WRITE_CLASH_CYPHER,
                    clash,
                    write=True,
                )
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "Failed to write clash",
                    extra={
                        "clash_id": clash.get("clash_id"),
                        "error": str(exc),
                    },
                )

    # -------------------------------------------------------------------------
    # Utility Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _get_source_ifc_types() -> list[str]:
        """Collect all source IFC types from active rules.

        Returns:
            Deduplicated list of IFC type strings.
        """
        # Map semantic labels back to IFC types
        label_to_types: dict[str, list[str]] = {
            "Pipe": ["IfcPipeSegment", "IfcPipeFitting"],
            "Duct": ["IfcDuctSegment", "IfcDuctFitting"],
            "Door": ["IfcDoor"],
            "Window": ["IfcWindow"],
            "CableCarrierSegment": ["IfcCableCarrierSegment"],
        }
        types: set[str] = set()
        for rule in ACTIVE_RULES:
            for label in rule.source_labels:
                types.update(label_to_types.get(label, []))
        return list(types)

    @staticmethod
    def _get_target_ifc_types() -> list[str]:
        """Collect all target IFC types from active rules.

        Returns:
            Deduplicated list of IFC type strings.
        """
        label_to_types: dict[str, list[str]] = {
            "FireWall": ["IfcWall", "IfcWallStandardCase"],
            "Wall": ["IfcWall", "IfcWallStandardCase"],
        }
        types: set[str] = set()
        for rule in ACTIVE_RULES:
            for label in rule.target_labels:
                types.update(label_to_types.get(label, []))
        return list(types)

    @staticmethod
    def _build_summary(
        candidates: int,
        intersections: int,
        clashes: list[dict[str, Any]],
    ) -> dict[str, int]:
        """Build a summary dict from detection results.

        Args:
            candidates: Total candidate pairs evaluated.
            intersections: Confirmed AABB intersections.
            clashes: All written clash records.

        Returns:
            Summary statistics dictionary.
        """
        return {
            "candidates_evaluated": candidates,
            "intersections_found": intersections,
            "total_clashes": len(clashes),
            "critical_count": sum(1 for c in clashes if c["severity"] == "CRITICAL"),
            "major_count": sum(1 for c in clashes if c["severity"] == "MAJOR"),
            "minor_count": sum(1 for c in clashes if c["severity"] == "MINOR"),
        }
