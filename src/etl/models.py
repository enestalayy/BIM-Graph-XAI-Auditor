"""
ETL Layer — Pydantic Data Models.

Defines the typed data structures used to transfer parsed IFC data
between the ETL, graph, and audit layers. These models act as the
contract between pipeline stages, preventing type mismatches.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class BoundingBox(BaseModel):
    """Axis-Aligned Bounding Box (AABB) for a building element in world coordinates (metres)."""

    min_x: float
    min_y: float
    min_z: float
    max_x: float
    max_y: float
    max_z: float

    @field_validator("max_x")
    @classmethod
    def max_x_gte_min_x(cls, v: float, info: Any) -> float:
        if "min_x" in info.data and v < info.data["min_x"]:
            raise ValueError(f"max_x ({v}) must be >= min_x ({info.data['min_x']})")
        return v

    @field_validator("max_y")
    @classmethod
    def max_y_gte_min_y(cls, v: float, info: Any) -> float:
        if "min_y" in info.data and v < info.data["min_y"]:
            raise ValueError(f"max_y ({v}) must be >= min_y ({info.data['min_y']})")
        return v

    @field_validator("max_z")
    @classmethod
    def max_z_gte_min_z(cls, v: float, info: Any) -> float:
        if "min_z" in info.data and v < info.data["min_z"]:
            raise ValueError(f"max_z ({v}) must be >= min_z ({info.data['min_z']})")
        return v

    @property
    def centroid_x(self) -> float:
        return (self.min_x + self.max_x) / 2.0

    @property
    def centroid_y(self) -> float:
        return (self.min_y + self.max_y) / 2.0

    @property
    def centroid_z(self) -> float:
        return (self.min_z + self.max_z) / 2.0

    @property
    def volume(self) -> float:
        return (self.max_x - self.min_x) * (self.max_y - self.min_y) * (self.max_z - self.min_z)

    def to_neo4j_properties(self) -> dict[str, float]:
        """Flatten the bounding box into Neo4j-compatible property key-value pairs."""
        return {
            "bbox_min_x": self.min_x,
            "bbox_min_y": self.min_y,
            "bbox_min_z": self.min_z,
            "bbox_max_x": self.max_x,
            "bbox_max_y": self.max_y,
            "bbox_max_z": self.max_z,
            "bbox_centroid_x": self.centroid_x,
            "bbox_centroid_y": self.centroid_y,
            "bbox_centroid_z": self.centroid_z,
            "bbox_volume": self.volume,
        }


class PropertySet(BaseModel):
    """A named collection of IFC properties (Pset_*)."""

    name: str
    properties: dict[str, str | float | bool | None] = Field(default_factory=dict)


class IFCElement(BaseModel):
    """A parsed IFC building element ready for Knowledge Graph ingestion.

    Attributes:
        guid: IFC GlobalId — 22-char base64 UUID, primary key in Neo4j.
        ifc_type: IFC entity type string (e.g., ``IfcWall``, ``IfcPipe``).
        name: Human-readable element name.
        bounding_box: World-coordinate AABB. None if geometry failed.
        storey_guid: GlobalId of the containing IfcBuildingStorey.
        is_fire_rated: Derived from Pset_WallCommon.FireRating.
    """

    guid: str = Field(..., min_length=22, max_length=22)
    ifc_type: str
    name: str = Field(default="")
    description: str | None = None
    object_type: str | None = None

    bounding_box: BoundingBox | None = None

    storey_guid: str | None = None
    space_guid: str | None = None
    building_guid: str | None = None

    is_fire_rated: bool = False
    fire_rating_value: str | None = None
    material: str | None = None
    load_bearing: bool = False

    psets: list[PropertySet] = Field(default_factory=list)

    def get_pset_value(
        self, pset_name: str, property_name: str
    ) -> str | float | bool | None:
        """Look up a specific property value by Pset name and property name."""
        for pset in self.psets:
            if pset.name == pset_name:
                return pset.properties.get(property_name)
        return None

    def to_neo4j_node_label(self) -> str:
        """Derive the Neo4j node label: IfcWall → Wall, IfcPipe → Pipe."""
        return self.ifc_type.removeprefix("Ifc")


class IFCRelationship(BaseModel):
    """A directed relationship between two IFC elements."""

    source_guid: str
    target_guid: str
    relationship_type: str
    properties: dict[str, Any] = Field(default_factory=dict)


class ParsedIFCModel(BaseModel):
    """Complete output of the IFC parsing stage — checkpoint object."""

    ifc_file_path: str
    schema_version: str
    element_count: int = 0
    elements: list[IFCElement] = Field(default_factory=list)
    relationships: list[IFCRelationship] = Field(default_factory=list)
