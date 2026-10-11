"""
Audit Layer — Audit Pipeline CLI.

Entry point for running the clash detection pass on the current state
of the Neo4j Knowledge Graph.

Usage:
    python -m src.audit.audit_pipeline --run
    python -m src.audit.audit_pipeline --run --tolerance 0.005
    python -m src.audit.audit_pipeline --run --min-volume 0.001
"""

from __future__ import annotations

import sys
import time

import click

from src.audit.clash_detector import ClashDetectorService
from src.config import settings
from src.graph.neo4j_repository import Neo4jRepository
from src.logger import get_logger, log_exception

logger = get_logger(__name__)


@click.command()
@click.option("--run", "do_run", is_flag=True, default=False, help="Execute clash detection.")
@click.option(
    "--tolerance",
    default=settings.clash_tolerance_m,
    show_default=True,
    type=float,
    help="AABB intersection tolerance in metres.",
)
@click.option(
    "--min-volume",
    default=settings.min_intersection_volume,
    show_default=True,
    type=float,
    help="Minimum intersection volume (m³) to report as a clash.",
)
@click.option(
    "--mitigation-radius",
    default=1.0,
    show_default=True,
    type=float,
    help="Search radius (m) for locating mitigating elements.",
)
def main(
    do_run: bool,
    tolerance: float,
    min_volume: float,
    mitigation_radius: float,
) -> None:
    """BIM Clash Detection Pipeline.

    Runs deterministic spatial reasoning on the Neo4j Knowledge Graph
    and writes detected BYKHY 2015 violations as CLASH_OCCURRED relationships.
    """
    if not do_run:
        click.echo("ℹ️  Use --run flag to execute clash detection.")
        return

    start_time = time.time()
    click.echo("🔍 Starting clash detection...")
    click.echo(f"   Tolerance:         {tolerance} m")
    click.echo(f"   Min volume:        {min_volume} m³")
    click.echo(f"   Mitigation radius: {mitigation_radius} m")

    try:
        repo = Neo4jRepository(
            uri=settings.neo4j_uri,
            user=settings.neo4j_user,
            password=settings.neo4j_password,
            database=settings.neo4j_database,
        )
        repo.connect()

        try:
            detector = ClashDetectorService(
                repo,
                tolerance_m=tolerance,
                min_volume_m3=min_volume,
                mitigation_radius_m=mitigation_radius,
            )
            summary = detector.run()
        finally:
            repo.close()

        elapsed = time.time() - start_time

        click.echo(f"\n✅ Clash detection complete in {elapsed:.1f}s\n")
        click.echo(f"   Candidate pairs evaluated: {summary['candidates_evaluated']}")
        click.echo(f"   AABB intersections found:  {summary['intersections_found']}")
        click.echo(f"   ─────────────────────────────────────")
        click.echo(f"   🔴 CRITICAL violations:    {summary['critical_count']}")
        click.echo(f"   🟠 MAJOR violations:       {summary['major_count']}")
        click.echo(f"   🟡 MINOR violations:       {summary['minor_count']}")
        click.echo(f"   Total clashes written:     {summary['total_clashes']}")

        if summary["total_clashes"] > 0:
            click.echo("\n   Run `make report` to generate XAI audit reports.")

    except Exception as exc:  # noqa: BLE001
        click.echo(f"❌  Audit failed: {exc}", err=True)
        log_exception(logger, exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
