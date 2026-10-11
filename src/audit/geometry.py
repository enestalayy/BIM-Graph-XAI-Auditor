"""
Audit Layer — Bounding Box Geometry Engine.

Implements 3D Axis-Aligned Bounding Box (AABB) operations used for
spatial pre-filtering and intersection testing in the clash detector.

Why AABB instead of exact geometry?
- Exact IFC geometry intersection is computationally expensive (O(n²) at scale).
- AABB is a conservative approximation: if two AABBs don't intersect,
  the actual geometry CANNOT intersect (zero false negatives).
- If AABBs DO intersect, there is likely (not guaranteed) a real clash.
- For engineering audits at building scale, AABB precision is sufficient
  to detect pipe/wall penetrations with a configurable tolerance.

Coordinate System:
    World coordinates, right-handed, Z-up, units in metres.
    All values sourced from Neo4j node properties (bbox_min_*, bbox_max_*).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from src.logger import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class BoundingBox3D:
    """Immutable 3D Axis-Aligned Bounding Box.

    Designed for high-throughput spatial tests — uses frozen dataclass
    (no dict overhead) and ``__slots__`` for memory efficiency.

    Attributes:
        min_x: Minimum X coordinate (metres).
        min_y: Minimum Y coordinate (metres).
        min_z: Minimum Z coordinate (metres).
        max_x: Maximum X coordinate (metres).
        max_y: Maximum Y coordinate (metres).
        max_z: Maximum Z coordinate (metres).
        guid: GlobalId of the owning IFC element (for traceability).
    """

    min_x: float
    min_y: float
    min_z: float
    max_x: float
    max_y: float
    max_z: float
    guid: str = ""

    @classmethod
    def from_neo4j_node(cls, node_props: dict[str, Any]) -> "BoundingBox3D":
        """Construct a BoundingBox3D from a Neo4j node property map.

        Expects the flat bounding box properties written by
        :meth:`BoundingBox.to_neo4j_properties` in the ETL layer.

        Args:
            node_props: Dictionary of Neo4j node properties.

        Returns:
            A :class:`BoundingBox3D` instance.

        Raises:
            KeyError: If required bounding box properties are missing.
            ValueError: If any coordinate is not a valid number.
        """
        return cls(
            min_x=float(node_props["bbox_min_x"]),
            min_y=float(node_props["bbox_min_y"]),
            min_z=float(node_props["bbox_min_z"]),
            max_x=float(node_props["bbox_max_x"]),
            max_y=float(node_props["bbox_max_y"]),
            max_z=float(node_props["bbox_max_z"]),
            guid=str(node_props.get("guid", "")),
        )

    def intersects(self, other: "BoundingBox3D", tolerance: float = 0.0) -> bool:
        """Test whether this AABB intersects another AABB.

        Uses the Separating Axis Theorem (SAT) for AABBs: two boxes
        overlap if and only if they overlap on ALL three axes simultaneously.

        The ``tolerance`` parameter (in metres) allows a small gap to still
        be reported as an intersection — useful for accounting for
        floating-point imprecision in IFC coordinate data.

        Args:
            other: The other bounding box to test against.
            tolerance: Minimum overlap threshold in metres. Positive values
                grow both boxes slightly; use the project default of 0.01 m.

        Returns:
            ``True`` if the boxes overlap (with tolerance applied).
        """
        return (
            self.min_x - tolerance <= other.max_x
            and self.max_x + tolerance >= other.min_x
            and self.min_y - tolerance <= other.max_y
            and self.max_y + tolerance >= other.min_y
            and self.min_z - tolerance <= other.max_z
            and self.max_z + tolerance >= other.min_z
        )

    def intersection_volume(self, other: "BoundingBox3D") -> float:
        """Compute the volume of the intersection region in cubic metres.

        Returns 0.0 if the boxes do not intersect.

        The intersection volume serves as a severity proxy:
        - Near-zero volume → surface contact (likely false positive)
        - Significant volume → genuine penetration (reportable clash)

        Args:
            other: The other bounding box.

        Returns:
            Intersection volume in m³, or 0.0 if no intersection.
        """
        overlap_x = max(0.0, min(self.max_x, other.max_x) - max(self.min_x, other.min_x))
        overlap_y = max(0.0, min(self.max_y, other.max_y) - max(self.min_y, other.min_y))
        overlap_z = max(0.0, min(self.max_z, other.max_z) - max(self.min_z, other.min_z))
        return overlap_x * overlap_y * overlap_z

    def centroid(self) -> tuple[float, float, float]:
        """Compute the centroid (centre point) of the bounding box.

        Returns:
            A (x, y, z) tuple of the centre coordinates in metres.
        """
        return (
            (self.min_x + self.max_x) / 2.0,
            (self.min_y + self.max_y) / 2.0,
            (self.min_z + self.max_z) / 2.0,
        )

    def volume(self) -> float:
        """Compute the total volume of this bounding box in m³.

        Returns:
            Volume in cubic metres.
        """
        return (
            (self.max_x - self.min_x)
            * (self.max_y - self.min_y)
            * (self.max_z - self.min_z)
        )

    def distance_to_centroid(self, other: "BoundingBox3D") -> float:
        """Euclidean distance between the centroids of two bounding boxes.

        Args:
            other: The other bounding box.

        Returns:
            Distance in metres.
        """
        cx1, cy1, cz1 = self.centroid()
        cx2, cy2, cz2 = other.centroid()
        return math.sqrt((cx1 - cx2) ** 2 + (cy1 - cy2) ** 2 + (cz1 - cz2) ** 2)

    def same_storey(self, own_storey: str | None, other_storey: str | None) -> bool:
        """Check whether two elements are on the same building storey.

        Used as a spatial pre-filter to skip inter-storey comparisons.

        Args:
            own_storey: Storey GUID of this element.
            other_storey: Storey GUID of the other element.

        Returns:
            ``True`` if both storeys are the same (or both are None).
        """
        if own_storey is None or other_storey is None:
            # Cannot determine storey — allow comparison to be safe.
            return True
        return own_storey == other_storey

    def z_ranges_overlap(self, other: "BoundingBox3D", tolerance: float = 0.0) -> bool:
        """Fast Z-axis overlap check.

        Used as the first step of the spatial pre-filter. Elements on
        completely different floor levels cannot intersect.

        Args:
            other: The other bounding box.
            tolerance: Tolerance in metres.

        Returns:
            ``True`` if the Z extents overlap.
        """
        return (
            self.min_z - tolerance <= other.max_z
            and self.max_z + tolerance >= other.min_z
        )
