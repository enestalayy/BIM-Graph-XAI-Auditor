"""
XAI Layer — Report Generator CLI.

Iterates over all CLASH_OCCURRED relationships in Neo4j, generates
a grounded XAI audit report for each using the RAG chain, and saves
results to a timestamped JSON file.

Usage:
    python -m src.xai.report_generator --run
    python -m src.xai.report_generator --run --clash-id <uuid>
    python -m src.xai.report_generator --run --severity CRITICAL
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import click

from src.config import settings
from src.graph.neo4j_repository import Neo4jRepository
from src.logger import get_logger, log_exception
from src.xai.graph_retriever import ClashContext, Neo4jClashContextRetriever
from src.xai.rag_chain import AuditRAGChain

logger = get_logger(__name__)


@click.command()
@click.option("--run", "do_run", is_flag=True, default=False, help="Execute report generation.")
@click.option(
    "--clash-id",
    default=None,
    help="Generate report for a single clash ID only.",
)
@click.option(
    "--severity",
    type=click.Choice(["CRITICAL", "MAJOR", "MINOR"], case_sensitive=True),
    default=None,
    help="Filter to only process clashes of this severity.",
)
@click.option(
    "--output-dir",
    type=click.Path(path_type=Path),
    default=settings.reports_dir,
    show_default=True,
    help="Directory to save generated reports.",
)
def main(
    do_run: bool,
    clash_id: str | None,
    severity: str | None,
    output_dir: Path,
) -> None:
    """BIM XAI Report Generator.

    Generates grounded natural-language audit reports for detected clashes
    using a RAG pipeline (Neo4j context + Gemini Flash LLM).
    """
    if not do_run:
        click.echo("ℹ️  Use --run flag to execute report generation.")
        return

    start_time = time.time()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    click.echo("📝 Starting XAI report generation...")

    try:
        repo = Neo4jRepository(
            uri=settings.neo4j_uri,
            user=settings.neo4j_user,
            password=settings.neo4j_password,
            database=settings.neo4j_database,
        )
        repo.connect()

        try:
            retriever = Neo4jClashContextRetriever(repo)
            chain = AuditRAGChain()

            # Fetch contexts
            if clash_id:
                ctx = retriever.get_clash_context_by_id(clash_id)
                contexts: list[ClashContext] = [ctx] if ctx else []
            else:
                contexts = retriever.get_all_clash_contexts()

            # Apply severity filter
            if severity:
                contexts = [c for c in contexts if c.severity == severity]

            if not contexts:
                click.echo("⚠️  No clashes found matching the criteria.")
                return

            click.echo(f"   Found {len(contexts)} clash(es) to process.")

            # Generate reports
            reports = chain.generate_batch(contexts)

        finally:
            repo.close()

        # Save report bundle
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_path = output_dir / f"audit_report_{timestamp}.json"

        report_data = {
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
            "total_clashes_processed": len(contexts),
            "total_reports_generated": len(reports),
            "hallucination_flagged": sum(1 for r in reports if r.hallucination_risk),
            "reports": [r.to_dict() for r in reports],
        }

        output_path.write_text(json.dumps(report_data, indent=2, ensure_ascii=False), encoding="utf-8")

        elapsed = time.time() - start_time
        flagged = sum(1 for r in reports if r.hallucination_risk)
        avg_score = (
            sum(r.grounding_score for r in reports) / len(reports) if reports else 0.0
        )

        click.echo(f"\n✅ Reports generated in {elapsed:.1f}s\n")
        click.echo(f"   Reports written:        {len(reports)}")
        click.echo(f"   Avg grounding score:    {avg_score:.3f}")
        click.echo(f"   Hallucination flagged:  {flagged}")
        click.echo(f"   Output file:            {output_path}")

    except Exception as exc:  # noqa: BLE001
        click.echo(f"❌  Report generation failed: {exc}", err=True)
        log_exception(logger, exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
