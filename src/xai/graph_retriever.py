"""
XAI Layer — Neo4j Context Retriever.

Retrieves structured, grounded context from the Neo4j Knowledge Graph
for each detected clash. This context is passed to the LLM instead of
allowing the model to generate facts from its training data.

Why this approach prevents hallucinations:
    The LLM receives ONLY structured facts from the graph:
    - Element GlobalIds, types, names, storeys
    - Intersection volume, centroid coordinates
    - Regulation clause text (from the rule registry)
    - Whether a mitigation was checked/found

    The prompt explicitly instructs the model that every statement in
    the audit report MUST be traceable to a specific item in this context.
    A post-generation GroundingValidator checks this programmatically.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.audit.rules import get_rule_by_id
from src.graph.neo4j_repository import Neo4jRepository
from src.logger import get_logger

logger = get_logger(__name__)

# Cypher: fetch all CLASH_OCCURRED relationships with full element context.
_FETCH_CLASHES_CYPHER = """
MATCH (a:Element)-[r:CLASH_OCCURRED]->(b:Element)
RETURN
    r.clash_id AS clash_id,
    r.rule_id AS rule_id,
    r.severity AS severity,
    r.intersection_volume_m3 AS volume,
    r.regulation_clause AS regulation_clause,
    r.description AS description,
    r.detected_at AS detected_at,
    r.centroid_x AS cx,
    r.centroid_y AS cy,
    r.centroid_z AS cz,
    r.mitigation_checked AS mitigation_checked,
    r.mitigation_found AS mitigation_found,
    a.guid AS guid_a,
    a.ifc_type AS type_a,
    a.name AS name_a,
    a.storey_guid AS storey_a,
    a.is_fire_rated AS fire_rated_a,
    a.fire_rating_value AS fire_rating_a,
    a.material AS material_a,
    a.load_bearing AS load_bearing_a,
    b.guid AS guid_b,
    b.ifc_type AS type_b,
    b.name AS name_b,
    b.storey_guid AS storey_b,
    b.is_fire_rated AS fire_rated_b,
    b.fire_rating_value AS fire_rating_b,
    b.material AS material_b,
    b.load_bearing AS load_bearing_b
ORDER BY
    CASE r.severity WHEN 'CRITICAL' THEN 1 WHEN 'MAJOR' THEN 2 ELSE 3 END,
    r.intersection_volume_m3 DESC
"""

# Cypher: fetch a single clash by clash_id.
_FETCH_CLASH_BY_ID_CYPHER = _FETCH_CLASHES_CYPHER.replace(
    "MATCH (a:Element)-[r:CLASH_OCCURRED]->(b:Element)",
    "MATCH (a:Element)-[r:CLASH_OCCURRED {clash_id: $clash_id}]->(b:Element)",
).replace("ORDER BY", "LIMIT 1\nORDER BY")

# Cypher: fetch storey name by guid.
_FETCH_STOREY_NAME_CYPHER = """
MATCH (s:Element {guid: $guid})
RETURN s.name AS name
"""


@dataclass
class ElementContext:
    """Structured context for a single building element involved in a clash.

    Attributes:
        guid: IFC GlobalId (primary key).
        ifc_type: IFC entity type string.
        name: Human-readable element name.
        storey_name: Name of the containing floor/storey.
        is_fire_rated: Whether this element has a fire rating.
        fire_rating_value: The fire rating string (e.g., ``"EI 90"``).
        material: Primary material name.
        load_bearing: Whether this is a structural element.
    """

    guid: str
    ifc_type: str
    name: str
    storey_name: str | None
    is_fire_rated: bool
    fire_rating_value: str | None
    material: str | None
    load_bearing: bool


@dataclass
class ClashContext:
    """Complete structured context for one detected clash.

    This is the single object passed to the LLM prompt. It contains
    every fact that the LLM is permitted to reference.

    Attributes:
        clash_id: Unique identifier for this violation.
        rule_id: Reference to the BYKHY 2015 rule.
        severity: CRITICAL / MAJOR / MINOR.
        element_a: The penetrating (source) element.
        element_b: The penetrated (target) element.
        intersection_volume_m3: Overlap volume in cubic metres.
        centroid: (x, y, z) coordinates of the clash point in metres.
        regulation_clause: Full text of the violated regulation clause.
        rule_description: Plain English description of the violation type.
        mitigation_checked: Whether a mitigating element was searched for.
        mitigation_found: Whether a mitigating element was found.
        detected_at: ISO-8601 timestamp of detection.
        grounding_facts: Auto-generated list of atomic fact strings.
            Used by the GroundingValidator.
    """

    clash_id: str
    rule_id: str
    severity: str
    element_a: ElementContext
    element_b: ElementContext
    intersection_volume_m3: float
    centroid: tuple[float, float, float]
    regulation_clause: str
    rule_description: str
    mitigation_checked: bool
    mitigation_found: bool
    detected_at: str
    grounding_facts: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        """Auto-generate grounding facts after initialization.

        These facts are used by the GroundingValidator to verify that
        the LLM's output references real, retrieved data.
        """
        self.grounding_facts = self._build_grounding_facts()

    def _build_grounding_facts(self) -> list[str]:
        """Construct a list of atomic, verifiable fact strings.

        Returns:
            List of fact strings, one per checkable claim.
        """
        facts = [
            f"clash_id: {self.clash_id}",
            f"rule_id: {self.rule_id}",
            f"severity: {self.severity}",
            f"element_a.guid: {self.element_a.guid}",
            f"element_a.ifc_type: {self.element_a.ifc_type}",
            f"element_b.guid: {self.element_b.guid}",
            f"element_b.ifc_type: {self.element_b.ifc_type}",
            f"element_b.is_fire_rated: {self.element_b.is_fire_rated}",
            f"intersection_volume_m3: {self.intersection_volume_m3}",
            f"regulation_clause: {self.rule_id}",
        ]
        if self.element_a.storey_name:
            facts.append(f"storey: {self.element_a.storey_name}")
        if self.element_b.fire_rating_value:
            facts.append(f"element_b.fire_rating: {self.element_b.fire_rating_value}")
        if self.mitigation_checked:
            facts.append(f"mitigation_checked: True")
            facts.append(f"mitigation_found: {self.mitigation_found}")
        return facts

    def to_llm_context_string(self) -> str:
        """Render the context as a structured string for the LLM prompt.

        Returns:
            A formatted context block that will be injected into the
            system prompt as the sole source of truth for the LLM.
        """
        lines = [
            "=== CLASH DETECTION REPORT CONTEXT ===",
            f"Clash ID:           {self.clash_id}",
            f"Rule ID:            {self.rule_id}",
            f"Severity:           {self.severity}",
            f"Detected At:        {self.detected_at}",
            "",
            "--- Penetrating Element (A) ---",
            f"GlobalId:           {self.element_a.guid}",
            f"IFC Type:           {self.element_a.ifc_type}",
            f"Name:               {self.element_a.name or 'N/A'}",
            f"Storey:             {self.element_a.storey_name or 'Unknown'}",
            f"Is Fire Rated:      {self.element_a.is_fire_rated}",
            f"Fire Rating Value:  {self.element_a.fire_rating_value or 'None'}",
            f"Material:           {self.element_a.material or 'Unknown'}",
            "",
            "--- Penetrated Element (B) ---",
            f"GlobalId:           {self.element_b.guid}",
            f"IFC Type:           {self.element_b.ifc_type}",
            f"Name:               {self.element_b.name or 'N/A'}",
            f"Storey:             {self.element_b.storey_name or 'Unknown'}",
            f"Is Fire Rated:      {self.element_b.is_fire_rated}",
            f"Fire Rating Value:  {self.element_b.fire_rating_value or 'None'}",
            f"Material:           {self.element_b.material or 'Unknown'}",
            f"Load Bearing:       {self.element_b.load_bearing}",
            "",
            "--- Spatial Data ---",
            f"Intersection Volume: {self.intersection_volume_m3:.6f} m³",
            f"Clash Centroid (m):  X={self.centroid[0]:.3f}, Y={self.centroid[1]:.3f}, Z={self.centroid[2]:.3f}",
            "",
            "--- Regulation Reference ---",
            f"Rule Description:   {self.rule_description}",
            f"Clause:             {self.regulation_clause}",
            "",
            "--- Mitigation Status ---",
            f"Mitigation Checked: {self.mitigation_checked}",
            f"Mitigation Found:   {self.mitigation_found}",
            "=== END CONTEXT ===",
        ]
        return "\n".join(lines)


class Neo4jClashContextRetriever:
    """Retrieves structured clash contexts from the Neo4j Knowledge Graph.

    This class is the gatekeeper between the raw graph data and the LLM.
    It ensures that only structured, validated facts reach the prompt.

    Example:
        >>> retriever = Neo4jClashContextRetriever(repo)
        >>> contexts = retriever.get_all_clash_contexts()
        >>> for ctx in contexts:
        ...     print(ctx.clash_id, ctx.severity)
    """

    def __init__(self, repo: Neo4jRepository) -> None:
        """Initialize the retriever.

        Args:
            repo: Connected :class:`Neo4jRepository` instance.
        """
        self._repo = repo

    def get_all_clash_contexts(self) -> list[ClashContext]:
        """Retrieve contexts for all CLASH_OCCURRED relationships.

        Returns:
            List of :class:`ClashContext` instances, ordered by severity
            and intersection volume (most severe first).
        """
        records = self._repo.execute_query(_FETCH_CLASHES_CYPHER)
        contexts = []
        for record in records:
            ctx = self._record_to_context(dict(record))
            if ctx is not None:
                contexts.append(ctx)

        logger.info("Clash contexts retrieved", extra={"count": len(contexts)})
        return contexts

    def get_clash_context_by_id(self, clash_id: str) -> ClashContext | None:
        """Retrieve context for a specific clash by ID.

        Args:
            clash_id: UUID of the clash (from CLASH_OCCURRED.clash_id).

        Returns:
            A :class:`ClashContext`, or ``None`` if not found.
        """
        records = self._repo.execute_query(
            _FETCH_CLASH_BY_ID_CYPHER.replace("LIMIT 1\n", ""),
            {"clash_id": clash_id},
        )
        if not records:
            logger.warning("Clash not found", extra={"clash_id": clash_id})
            return None
        return self._record_to_context(dict(records[0]))

    def _record_to_context(self, record: dict[str, Any]) -> ClashContext | None:
        """Convert a raw Neo4j record to a ClashContext.

        Args:
            record: Raw dictionary from the Cypher query result.

        Returns:
            A :class:`ClashContext`, or ``None`` if the record is invalid.
        """
        try:
            # Resolve storey names
            storey_a = self._resolve_storey_name(record.get("storey_a"))
            storey_b = self._resolve_storey_name(record.get("storey_b"))

            rule = get_rule_by_id(record.get("rule_id", ""))
            rule_description = rule.description if rule else record.get("description", "")

            element_a = ElementContext(
                guid=record["guid_a"],
                ifc_type=record["type_a"],
                name=record.get("name_a") or "",
                storey_name=storey_a,
                is_fire_rated=bool(record.get("fire_rated_a", False)),
                fire_rating_value=record.get("fire_rating_a"),
                material=record.get("material_a"),
                load_bearing=bool(record.get("load_bearing_a", False)),
            )

            element_b = ElementContext(
                guid=record["guid_b"],
                ifc_type=record["type_b"],
                name=record.get("name_b") or "",
                storey_name=storey_b,
                is_fire_rated=bool(record.get("fire_rated_b", False)),
                fire_rating_value=record.get("fire_rating_b"),
                material=record.get("material_b"),
                load_bearing=bool(record.get("load_bearing_b", False)),
            )

            return ClashContext(
                clash_id=record["clash_id"],
                rule_id=record["rule_id"],
                severity=record["severity"],
                element_a=element_a,
                element_b=element_b,
                intersection_volume_m3=float(record.get("volume") or 0.0),
                centroid=(
                    float(record.get("cx") or 0.0),
                    float(record.get("cy") or 0.0),
                    float(record.get("cz") or 0.0),
                ),
                regulation_clause=record.get("regulation_clause", ""),
                rule_description=rule_description,
                mitigation_checked=bool(record.get("mitigation_checked", False)),
                mitigation_found=bool(record.get("mitigation_found", False)),
                detected_at=str(record.get("detected_at", "")),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Failed to parse clash record",
                extra={"clash_id": record.get("clash_id"), "error": str(exc)},
            )
            return None

    def _resolve_storey_name(self, storey_guid: str | None) -> str | None:
        """Look up the human-readable name of a storey from its GUID.

        Args:
            storey_guid: The storey element's GlobalId.

        Returns:
            The storey's name string, or ``None`` if not found.
        """
        if not storey_guid:
            return None
        try:
            records = self._repo.execute_query(
                _FETCH_STOREY_NAME_CYPHER, {"guid": storey_guid}
            )
            if records:
                return records[0]["name"]
        except Exception:  # noqa: BLE001
            pass
        return None
