"""
Graph Layer — Neo4j Schema Definition (DDL).

Defines and applies the Cypher constraints and indexes that form the
schema of the BIM Knowledge Graph. Running this module is idempotent —
it uses IF NOT EXISTS so it is safe to re-run on an existing database.

Schema Design Rationale:
- Uniqueness constraint on Element.guid enforces the IFC GlobalId
  as the primary key at the database level.
- Index on ifc_type enables fast label + type lookups (e.g., all pipes).
- Composite bounding-box indexes enable spatial pre-filtering queries
  that reduce the candidate set for O(n²) intersection tests.
"""

from __future__ import annotations

from src.graph.neo4j_repository import Neo4jRepository
from src.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constraint DDL
# Each tuple is (constraint_name, cypher_statement).
# Constraints are applied before indexes.
# ---------------------------------------------------------------------------
CONSTRAINTS: list[tuple[str, str]] = [
    (
        "element_guid_unique",
        """
        CREATE CONSTRAINT element_guid_unique IF NOT EXISTS
        FOR (e:Element)
        REQUIRE e.guid IS UNIQUE
        """,
    ),
    (
        "storey_guid_unique",
        """
        CREATE CONSTRAINT storey_guid_unique IF NOT EXISTS
        FOR (s:Storey)
        REQUIRE s.guid IS UNIQUE
        """,
    ),
    (
        "space_guid_unique",
        """
        CREATE CONSTRAINT space_guid_unique IF NOT EXISTS
        FOR (sp:Space)
        REQUIRE sp.guid IS UNIQUE
        """,
    ),
    (
        "building_guid_unique",
        """
        CREATE CONSTRAINT building_guid_unique IF NOT EXISTS
        FOR (b:Building)
        REQUIRE b.guid IS UNIQUE
        """,
    ),
    (
        "clash_report_id_unique",
        """
        CREATE CONSTRAINT clash_report_id_unique IF NOT EXISTS
        FOR (r:ClashReport)
        REQUIRE r.report_id IS UNIQUE
        """,
    ),
]

# ---------------------------------------------------------------------------
# Index DDL
# ---------------------------------------------------------------------------
INDEXES: list[tuple[str, str]] = [
    (
        "element_ifc_type",
        """
        CREATE INDEX element_ifc_type IF NOT EXISTS
        FOR (e:Element)
        ON (e.ifc_type)
        """,
    ),
    (
        "element_storey_guid",
        """
        CREATE INDEX element_storey_guid IF NOT EXISTS
        FOR (e:Element)
        ON (e.storey_guid)
        """,
    ),
    (
        "element_is_fire_rated",
        """
        CREATE INDEX element_is_fire_rated IF NOT EXISTS
        FOR (e:Element)
        ON (e.is_fire_rated)
        """,
    ),
    # Spatial pre-filter indexes: allows efficient Z-range queries
    # to reduce the candidate pair set before full AABB tests.
    (
        "element_bbox_z",
        """
        CREATE INDEX element_bbox_z IF NOT EXISTS
        FOR (e:Element)
        ON (e.bbox_min_z, e.bbox_max_z)
        """,
    ),
    (
        "element_bbox_x",
        """
        CREATE INDEX element_bbox_x IF NOT EXISTS
        FOR (e:Element)
        ON (e.bbox_min_x, e.bbox_max_x)
        """,
    ),
    (
        "element_bbox_y",
        """
        CREATE INDEX element_bbox_y IF NOT EXISTS
        FOR (e:Element)
        ON (e.bbox_min_y, e.bbox_max_y)
        """,
    ),
    (
        "clash_severity",
        """
        CREATE INDEX clash_severity IF NOT EXISTS
        FOR ()-[r:CLASH_OCCURRED]-()
        ON (r.severity)
        """,
    ),
    (
        "clash_rule_id",
        """
        CREATE INDEX clash_rule_id IF NOT EXISTS
        FOR ()-[r:CLASH_OCCURRED]-()
        ON (r.rule_id)
        """,
    ),
]


def apply_schema(repo: Neo4jRepository) -> None:
    """Apply all constraints and indexes to the Neo4j database.

    This function is idempotent — safe to call multiple times.
    Uses ``IF NOT EXISTS`` clauses so existing schema is not modified.

    Args:
        repo: A connected :class:`Neo4jRepository` instance.
    """
    logger.info("Applying Neo4j schema (constraints + indexes)")

    # Apply constraints first (they implicitly create indexes)
    for name, cypher in CONSTRAINTS:
        try:
            repo.execute_query(cypher.strip(), write=True)
            logger.debug("Constraint applied", extra={"constraint": name})
        except Exception as exc:  # noqa: BLE001
            # Log but don't abort — some versions use different DDL syntax
            logger.warning(
                "Failed to apply constraint",
                extra={"constraint": name, "error": str(exc)},
            )

    # Apply additional indexes
    for name, cypher in INDEXES:
        try:
            repo.execute_query(cypher.strip(), write=True)
            logger.debug("Index applied", extra={"index": name})
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to apply index",
                extra={"index": name, "error": str(exc)},
            )

    logger.info(
        "Schema application complete",
        extra={"constraints": len(CONSTRAINTS), "indexes": len(INDEXES)},
    )


def verify_schema(repo: Neo4jRepository) -> dict[str, list[str]]:
    """Query the database to verify which constraints and indexes exist.

    Args:
        repo: A connected :class:`Neo4jRepository` instance.

    Returns:
        A dictionary with keys ``"constraints"`` and ``"indexes"``, each
        containing a list of names found in the database.
    """
    constraints = repo.execute_query("SHOW CONSTRAINTS YIELD name RETURN name")
    indexes = repo.execute_query("SHOW INDEXES YIELD name RETURN name")

    result = {
        "constraints": [r["name"] for r in constraints],
        "indexes": [r["name"] for r in indexes],
    }

    logger.info(
        "Schema verification complete",
        extra={
            "constraint_count": len(result["constraints"]),
            "index_count": len(result["indexes"]),
        },
    )
    return result
