"""
Audit Layer — Fire Safety Rule Registry (BYKHY 2015).

Defines the complete set of fire-safety clash rules used by the
ClashDetectorService. Each rule is a typed dataclass that specifies:
- Which IFC element types are involved (source + target)
- What mitigating element (if any) must be present to avoid a violation
- The severity level and the specific regulation clause

Regulation References:
    BYKHY 2015: Binaların Yangından Korunması Hakkında Yönetmelik
    (Turkish Regulation on Protection of Buildings from Fire, 2015)
    Official source: Resmi Gazete, 19.12.2007 tarih ve 26735 sayılı
    (with amendments published in 2015)

    IBC 2021: International Building Code (used as cross-reference)

Adding new rules:
    1. Create a new ClashRule instance below with a unique rule_id.
    2. Add it to the ACTIVE_RULES list.
    3. Write a corresponding test in tests/test_audit.py.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Severity = Literal["CRITICAL", "MAJOR", "MINOR"]


@dataclass(frozen=True)
class ClashRule:
    """Definition of a single fire-safety clash rule.

    Attributes:
        rule_id: Unique identifier tied to the regulation clause.
            Format: ``BYKHY-YYYY-M{article}-R{number}``
        description: Human-readable description of the violation.
        regulation_clause: Full clause reference for audit reports.
        source_labels: Neo4j labels that the penetrating element must have.
            e.g., ``["Pipe"]`` or ``["Pipe", "Element"]``
        target_labels: Neo4j labels that the penetrated element must have.
            e.g., ``["FireWall"]``
        required_mitigation_labels: Labels of an element that, if present
            at the clash location, prevents this from being a violation.
            ``None`` means the clash is unconditionally a violation.
        severity: Impact level — ``CRITICAL`` triggers immediate remediation.
        active: Whether this rule is currently enforced. Set to ``False``
            to disable without deleting.
        notes: Optional technical notes for the auditor.
    """

    rule_id: str
    description: str
    regulation_clause: str
    source_labels: list[str]
    target_labels: list[str]
    required_mitigation_labels: list[str] | None
    severity: Severity
    active: bool = True
    notes: str = ""


# =============================================================================
# BYKHY 2015 Rule Definitions
# =============================================================================

# Rule R001 — Pipe penetrates fire wall without fire damper
# BYKHY 2015, Madde 51 (Article 51): Yangın bölmeleri
# "Yangın bölmelerinden geçen tesisat boruları, yangın damperi ile
# donatılmalıdır."
RULE_PIPE_THROUGH_FIREWALL = ClashRule(
    rule_id="BYKHY-2015-M51-R001",
    description=(
        "A pipe segment penetrates a fire-rated wall (fire compartment boundary) "
        "without a fire damper at the penetration point."
    ),
    regulation_clause=(
        "BYKHY 2015 Madde 51 — Yangın bölmelerinden geçen tesisat boruları, "
        "yangın damperi (fire damper) ile donatılmalıdır. "
        "(IBC 2021 §717 cross-reference)"
    ),
    source_labels=["Pipe"],
    target_labels=["FireWall"],
    required_mitigation_labels=["FireDamper"],
    severity="CRITICAL",
    notes=(
        "The mitigation check queries for a FireDamper node whose bounding box "
        "intersects the clash region (±0.5 m centroid tolerance)."
    ),
)

# Rule R002 — HVAC duct penetrates fire wall without fire damper
# BYKHY 2015, Madde 51: Hava kanalları için de aynı şart geçerlidir.
RULE_DUCT_THROUGH_FIREWALL = ClashRule(
    rule_id="BYKHY-2015-M51-R002",
    description=(
        "An HVAC duct segment penetrates a fire-rated wall without a fire damper."
    ),
    regulation_clause=(
        "BYKHY 2015 Madde 51 — Yangın bölmelerinden geçen havalandırma kanalları, "
        "yangın damperi ile donatılmalıdır. (IBC 2021 §717.4 cross-reference)"
    ),
    source_labels=["Duct"],
    target_labels=["FireWall"],
    required_mitigation_labels=["FireDamper"],
    severity="CRITICAL",
    notes="HVAC ducts are higher risk than pipes due to chimney effect potential.",
)

# Rule R003 — Door in fire wall not fire-rated
# BYKHY 2015, Madde 52: Yangın kapıları
# "Yangın bölmelerindeki kapılar, duvarın yangın dayanım sınıfına uygun
# yangın kapısı olmalıdır."
RULE_UNRATED_DOOR_IN_FIREWALL = ClashRule(
    rule_id="BYKHY-2015-M52-R003",
    description=(
        "A door intersecting a fire-rated wall does not have a fire rating "
        "property (Pset_DoorCommon.FireRating is missing or empty)."
    ),
    regulation_clause=(
        "BYKHY 2015 Madde 52 — Yangın bölmelerindeki kapılar, yangın kapısı "
        "olmalı ve duvarın yangın dayanım sınıfına uygun derecelendirilmiş "
        "olmalıdır. (EN 16034 cross-reference)"
    ),
    source_labels=["Door"],
    target_labels=["FireWall"],
    required_mitigation_labels=None,  # Violation is property-based, not element presence
    severity="MAJOR",
    notes=(
        "This rule is evaluated differently: instead of checking for a mitigating "
        "element, the clash detector checks e.is_fire_rated on the door node itself."
    ),
)

# Rule R004 — Electrical conduit penetrates fire wall without fire-stopping
# BYKHY 2015, Madde 53: Elektrik tesisatı
RULE_CONDUIT_THROUGH_FIREWALL = ClashRule(
    rule_id="BYKHY-2015-M53-R004",
    description=(
        "An electrical cable carrier or conduit penetrates a fire-rated wall. "
        "Intumescent fire-stopping must be installed but cannot be directly "
        "detected in the IFC model."
    ),
    regulation_clause=(
        "BYKHY 2015 Madde 53 — Yangın bölmelerinden geçen elektrik tesisatı "
        "boşlukları, yangına dayanıklı dolgu malzemeleri ile kapatılmalıdır."
    ),
    source_labels=["CableCarrierSegment"],
    target_labels=["FireWall"],
    required_mitigation_labels=None,
    severity="MINOR",
    notes=(
        "Fire-stopping material (intumescent) is typically not modeled in IFC. "
        "This rule flags ALL conduit-firewall intersections for manual verification."
    ),
)

# Rule R005 — Window in fire wall not fire-rated
# BYKHY 2015, Madde 52 (extended to windows)
RULE_UNRATED_WINDOW_IN_FIREWALL = ClashRule(
    rule_id="BYKHY-2015-M52-R005",
    description=(
        "A window intersecting a fire-rated wall does not have a fire rating "
        "property. Fixed fire-rated glazing is required."
    ),
    regulation_clause=(
        "BYKHY 2015 Madde 52 — Yangın bölmelerindeki cam yüzeyler, yangına "
        "dayanıklı cam (EW veya E sınıfı) olmalıdır."
    ),
    source_labels=["Window"],
    target_labels=["FireWall"],
    required_mitigation_labels=None,
    severity="MAJOR",
    notes="Check is_fire_rated property on the Window node.",
)


# =============================================================================
# Generic Hard Clash Rules (MEP vs Architecture)
# =============================================================================

RULE_GENERIC_HARD_CLASH_PIPE_WALL = ClashRule(
    rule_id="GENERIC-CLASH-R001",
    description="A pipe segment physically intersects a wall.",
    regulation_clause="General Hard Clash (MEP vs Architecture coordination).",
    source_labels=["Pipe"],
    target_labels=["Wall"],
    required_mitigation_labels=None,
    severity="MINOR",
    notes="Physical hard clash detected. Check if penetration was planned.",
)

RULE_GENERIC_HARD_CLASH_DUCT_WALL = ClashRule(
    rule_id="GENERIC-CLASH-R002",
    description="An HVAC duct physically intersects a wall.",
    regulation_clause="General Hard Clash (MEP vs Architecture coordination).",
    source_labels=["Duct"],
    target_labels=["Wall"],
    required_mitigation_labels=None,
    severity="MINOR",
    notes="Physical hard clash detected. Duct might require an opening.",
)


# =============================================================================
# Active Rule Registry
# =============================================================================

# All rules that the ClashDetectorService will evaluate.
# To disable a rule without deleting it, set active=False in the dataclass.
ACTIVE_RULES: list[ClashRule] = [
    r
    for r in [
        RULE_PIPE_THROUGH_FIREWALL,
        RULE_DUCT_THROUGH_FIREWALL,
        RULE_UNRATED_DOOR_IN_FIREWALL,
        RULE_CONDUIT_THROUGH_FIREWALL,
        RULE_UNRATED_WINDOW_IN_FIREWALL,
        RULE_GENERIC_HARD_CLASH_PIPE_WALL,
        RULE_GENERIC_HARD_CLASH_DUCT_WALL,
    ]
    if r.active
]


def get_rule_by_id(rule_id: str) -> ClashRule | None:
    """Look up a rule by its unique rule_id.

    Args:
        rule_id: The rule identifier (e.g., ``"BYKHY-2015-M51-R001"``).

    Returns:
        The matching :class:`ClashRule`, or ``None`` if not found.
    """
    return next((r for r in ACTIVE_RULES if r.rule_id == rule_id), None)


def get_rules_for_labels(
    source_labels: list[str], target_labels: list[str]
) -> list[ClashRule]:
    """Find all active rules that match a given source/target label combination.

    Args:
        source_labels: Labels of the source (penetrating) element.
        target_labels: Labels of the target (penetrated) element.

    Returns:
        List of applicable :class:`ClashRule` instances.
    """
    matching = []
    source_set = set(source_labels)
    target_set = set(target_labels)

    for rule in ACTIVE_RULES:
        if set(rule.source_labels) & source_set and set(rule.target_labels) & target_set:
            matching.append(rule)

    return matching
