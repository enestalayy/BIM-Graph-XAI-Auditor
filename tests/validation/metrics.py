"""
Validation Framework — Precision, Recall, F1, and Hallucination Rate.

Computes quantitative performance metrics by comparing the system's
detected clashes against a manually annotated gold standard dataset.

Metric Definitions:
    True Positive (TP):  Clash detected by system AND present in gold standard
    False Positive (FP): Clash detected by system but NOT in gold standard
    False Negative (FN): Clash in gold standard but NOT detected by system

    Precision = TP / (TP + FP)  → "Of what we found, how much is real?"
    Recall    = TP / (TP + FN)  → "Of what is real, how much did we find?"
    F1        = 2 × P × R / (P + R)  → Harmonic mean

    Hallucination Rate: Fraction of reports with hallucination_risk=True

Academic Note:
    The gold standard comparison uses (guid_a, guid_b, rule_id) as the
    unique key for a clash, ensuring that the same physical violation
    but for a different rule is counted separately.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from src.graph.neo4j_repository import Neo4jRepository
from src.logger import get_logger

logger = get_logger(__name__)

# Cypher: fetch all detected clashes from Neo4j as (guid_a, guid_b, rule_id) tuples.
_FETCH_DETECTED_CLASHES_CYPHER = """
MATCH (a:Element)-[r:CLASH_OCCURRED]->(b:Element)
RETURN
    a.guid AS guid_a,
    b.guid AS guid_b,
    r.rule_id AS rule_id,
    r.severity AS severity,
    r.clash_id AS clash_id
"""


@dataclass
class ValidationResult:
    """Results of a validation run.

    Attributes:
        true_positives: Number of clashes correctly detected.
        false_positives: Number of clashes incorrectly detected (not in gold standard).
        false_negatives: Number of clashes in gold standard missed by the system.
        precision: TP / (TP + FP).
        recall: TP / (TP + FN).
        f1_score: Harmonic mean of precision and recall.
        total_detected: Total clashes found by the system.
        total_gold: Total clashes in the gold standard.
        hallucination_rate: Fraction of XAI reports with hallucination_risk=True.
        hallucination_count: Number of flagged reports.
        total_reports: Total XAI reports evaluated.
    """

    true_positives: int
    false_positives: int
    false_negatives: int
    precision: float
    recall: float
    f1_score: float
    total_detected: int
    total_gold: int
    hallucination_rate: float = 0.0
    hallucination_count: int = 0
    total_reports: int = 0

    def to_markdown_table(self) -> str:
        """Format the validation results as a Markdown table.

        Returns:
            A formatted Markdown string suitable for academic reporting.
        """
        lines = [
            "# BIM-Graph-XAI-Auditor — Validation Metrics",
            "",
            "## Clash Detection Performance",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| True Positives (TP) | {self.true_positives} |",
            f"| False Positives (FP) | {self.false_positives} |",
            f"| False Negatives (FN) | {self.false_negatives} |",
            f"| **Precision** | **{self.precision:.4f}** |",
            f"| **Recall** | **{self.recall:.4f}** |",
            f"| **F1 Score** | **{self.f1_score:.4f}** |",
            f"| Total Detected | {self.total_detected} |",
            f"| Total in Gold Standard | {self.total_gold} |",
            "",
            "## XAI Report Quality",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| Total Reports Evaluated | {self.total_reports} |",
            f"| Hallucination Flagged | {self.hallucination_count} |",
            f"| **Hallucination Rate** | **{self.hallucination_rate:.4f}** |",
            f"| **Grounding Rate** | **{1.0 - self.hallucination_rate:.4f}** |",
        ]
        return "\n".join(lines)


def load_gold_standard(gold_standard_path: str | Path) -> list[dict[str, str]]:
    """Load the manually annotated gold standard dataset.

    The gold standard JSON file contains a list of true clash records.
    Each record must have: guid_a, guid_b, rule_id.

    Args:
        gold_standard_path: Path to the gold standard JSON file.

    Returns:
        List of gold standard clash records.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the file is malformed.
    """
    path = Path(gold_standard_path)
    if not path.exists():
        raise FileNotFoundError(f"Gold standard not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    if "clashes" not in data:
        raise ValueError("Gold standard must have a 'clashes' key.")

    return data["clashes"]  # type: ignore[return-value]


def compute_metrics(
    repo: Neo4jRepository,
    gold_standard_path: str | Path,
    report_file_path: str | Path | None = None,
) -> ValidationResult:
    """Compute Precision, Recall, F1, and Hallucination Rate.

    Args:
        repo: Connected Neo4j repository (for fetching detected clashes).
        gold_standard_path: Path to the gold standard JSON file.
        report_file_path: Optional path to a generated XAI report JSON file
            for hallucination rate computation.

    Returns:
        A :class:`ValidationResult` with all computed metrics.
    """
    logger.info("Loading gold standard", extra={"path": str(gold_standard_path)})
    gold_clashes = load_gold_standard(gold_standard_path)

    # Normalize gold standard keys to frozensets for order-independent comparison
    def clash_key(record: dict[str, Any]) -> tuple[str, str, str]:
        """Create a canonical key for a clash record."""
        guids = tuple(sorted([record["guid_a"], record["guid_b"]]))
        return (guids[0], guids[1], record["rule_id"])

    gold_keys = {clash_key(c) for c in gold_clashes}

    # Fetch detected clashes from Neo4j
    logger.info("Fetching detected clashes from Neo4j")
    detected_records = repo.execute_query(_FETCH_DETECTED_CLASHES_CYPHER)
    detected_clashes = [dict(r) for r in detected_records]
    detected_keys = {clash_key(c) for c in detected_clashes}

    # Compute confusion matrix components
    tp_keys = gold_keys & detected_keys
    fp_keys = detected_keys - gold_keys
    fn_keys = gold_keys - detected_keys

    tp = len(tp_keys)
    fp = len(fp_keys)
    fn = len(fn_keys)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    logger.info(
        "Clash detection metrics computed",
        extra={"precision": precision, "recall": recall, "f1": f1},
    )

    # Compute hallucination rate from report file if provided
    hallucination_count = 0
    total_reports = 0
    hallucination_rate = 0.0

    if report_file_path and Path(report_file_path).exists():
        report_data = json.loads(Path(report_file_path).read_text(encoding="utf-8"))
        reports = report_data.get("reports", [])
        total_reports = len(reports)
        hallucination_count = sum(1 for r in reports if r.get("hallucination_risk", False))
        hallucination_rate = (
            hallucination_count / total_reports if total_reports > 0 else 0.0
        )
        logger.info(
            "Hallucination metrics computed",
            extra={
                "total_reports": total_reports,
                "hallucination_count": hallucination_count,
                "rate": hallucination_rate,
            },
        )

    return ValidationResult(
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
        precision=round(precision, 6),
        recall=round(recall, 6),
        f1_score=round(f1, 6),
        total_detected=len(detected_clashes),
        total_gold=len(gold_clashes),
        hallucination_rate=round(hallucination_rate, 6),
        hallucination_count=hallucination_count,
        total_reports=total_reports,
    )


def save_metrics_report(
    result: ValidationResult, output_path: str | Path
) -> None:
    """Save validation metrics to both JSON and Markdown files.

    Args:
        result: The validation result to save.
        output_path: Base path (without extension) for output files.
    """
    base = Path(output_path)
    base.parent.mkdir(parents=True, exist_ok=True)

    # Save JSON
    json_path = base.with_suffix(".json")
    json_path.write_text(
        json.dumps(asdict(result), indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # Save Markdown
    md_path = base.with_suffix(".md")
    md_path.write_text(result.to_markdown_table(), encoding="utf-8")

    logger.info(
        "Metrics saved",
        extra={"json": str(json_path), "markdown": str(md_path)},
    )
