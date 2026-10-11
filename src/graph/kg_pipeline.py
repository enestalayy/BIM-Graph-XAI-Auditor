"""
Graph Layer — KG Pipeline CLI.

Orchestrates the full IFC → Knowledge Graph pipeline in a single command.
This is the primary entry point for data ingestion.

Usage:
    python -m src.graph.kg_pipeline --ifc data/sample/model.ifc
    python -m src.graph.kg_pipeline --ifc data/sample/model.ifc --clear
    python -m src.graph.kg_pipeline --from-checkpoint data/processed/elements.json
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import click

from src.config import settings
from src.etl.data_exporter import DataExporter
from src.etl.ifc_parser import IFCParserService
from src.etl.models import ParsedIFCModel
from src.graph.graph_builder import GraphBuilderService
from src.graph.neo4j_repository import Neo4jRepository
from src.graph.schema import apply_schema, verify_schema
from src.logger import get_logger, log_exception

logger = get_logger(__name__)


@click.command()
@click.option(
    "--ifc",
    "ifc_path",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Path to the IFC file to parse and import.",
)
@click.option(
    "--from-checkpoint",
    "checkpoint_path",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Skip IFC parsing and load from an existing JSON checkpoint.",
)
@click.option(
    "--clear",
    is_flag=True,
    default=False,
    help="Clear the database before import. WARNING: destroys all existing data.",
)
@click.option(
    "--no-apoc",
    is_flag=True,
    default=False,
    help="Disable APOC procedures (slower, for environments without APOC).",
)
@click.option(
    "--batch-size",
    default=settings.ifc_batch_size,
    show_default=True,
    help="Number of elements per batch.",
)
def main(
    ifc_path: Path | None,
    checkpoint_path: Path | None,
    clear: bool,
    no_apoc: bool,
    batch_size: int,
) -> None:
    """BIM Knowledge Graph Pipeline.

    Parses an IFC file and builds a Neo4j Knowledge Graph.

    Example:
        $ python -m src.graph.kg_pipeline --ifc data/sample/model.ifc
    """
    if ifc_path is None and checkpoint_path is None:
        click.echo("❌  Provide either --ifc or --from-checkpoint.", err=True)
        sys.exit(1)

    start_time = time.time()
    logger.info("KG Pipeline started", extra={"ifc_path": str(ifc_path), "clear": clear})

    try:
        # ------------------------------------------------------------------
        # Step 1: Parse IFC or load checkpoint
        # ------------------------------------------------------------------
        parsed_model: ParsedIFCModel

        if checkpoint_path:
            click.echo(f"📂 Loading from checkpoint: {checkpoint_path}")
            exporter = DataExporter(settings.processed_dir)
            parsed_model = DataExporter.load_from_json(checkpoint_path)
        else:
            assert ifc_path is not None
            click.echo(f"🔍 Parsing IFC file: {ifc_path}")
            parser = IFCParserService(ifc_path, batch_size=batch_size)
            parsed_model = parser.parse()

            # Save checkpoint for future runs
            exporter = DataExporter(settings.processed_dir)
            paths = exporter.export_full_model(parsed_model)
            click.echo(f"✅ Checkpoint saved: {paths['json']}")

        click.echo(
            f"📊 Parsed {parsed_model.element_count} elements, "
            f"{len(parsed_model.relationships)} relationships"
        )

        # ------------------------------------------------------------------
        # Step 2: Connect to Neo4j
        # ------------------------------------------------------------------
        click.echo("🔗 Connecting to Neo4j...")
        repo = Neo4jRepository(
            uri=settings.neo4j_uri,
            user=settings.neo4j_user,
            password=settings.neo4j_password,
            database=settings.neo4j_database,
        )
        repo.connect()

        try:
            # ------------------------------------------------------------------
            # Step 3: Apply schema
            # ------------------------------------------------------------------
            click.echo("📐 Applying schema (constraints + indexes)...")
            apply_schema(repo)

            schema_info = verify_schema(repo)
            click.echo(
                f"   ✓ {len(schema_info['constraints'])} constraints, "
                f"{len(schema_info['indexes'])} indexes active"
            )

            # ------------------------------------------------------------------
            # Step 4: Build graph
            # ------------------------------------------------------------------
            click.echo("🏗️  Building Knowledge Graph...")
            builder = GraphBuilderService(
                repo,
                batch_size=batch_size,
                use_apoc=not no_apoc,
            )
            summary = builder.build(parsed_model, clear_first=clear)

            elapsed = time.time() - start_time
            click.echo(
                f"\n✅ Knowledge Graph built in {elapsed:.1f}s\n"
                f"   Nodes created:         {summary['nodes']}\n"
                f"   Relationships created: {summary['relationships']}\n"
                f"   Neo4j Browser:         http://localhost:7474"
            )

        finally:
            repo.close()

    except FileNotFoundError as exc:
        click.echo(f"❌  File not found: {exc}", err=True)
        log_exception(logger, exc)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001
        click.echo(f"❌  Pipeline failed: {exc}", err=True)
        log_exception(logger, exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
