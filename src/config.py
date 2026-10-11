"""
BIM-Graph-XAI-Auditor — Application Configuration.

This module provides a single, typed configuration object loaded from
environment variables (via .env file). It is the single source of truth
for all settings across the application.

Usage:
    from src.config import settings

    uri = settings.neo4j_uri
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings loaded from environment variables.

    All fields are type-checked and validated at startup. If a required
    environment variable is missing, the application will fail fast with
    a descriptive error rather than failing silently at runtime.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -------------------------------------------------------------------------
    # Neo4j
    # -------------------------------------------------------------------------
    neo4j_uri: str = Field(
        default="bolt://localhost:7687",
        description="Bolt URI for the Neo4j instance.",
    )
    neo4j_user: str = Field(default="neo4j", description="Neo4j username.")
    neo4j_password: str = Field(..., description="Neo4j password (required).")
    neo4j_database: str = Field(default="neo4j", description="Target database name.")

    # -------------------------------------------------------------------------
    # Google Gemini (LLM)
    # -------------------------------------------------------------------------
    google_api_key: str = Field(..., description="Google Gemini API key (required).")
    gemini_model: str = Field(
        default="gemini-1.5-flash",
        description="Gemini model identifier.",
    )

    # -------------------------------------------------------------------------
    # Logging
    # -------------------------------------------------------------------------
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Application log level.",
    )
    log_format: Literal["json", "text"] = Field(
        default="json",
        description="Log output format. Use 'text' for local development.",
    )

    # -------------------------------------------------------------------------
    # IFC Processing
    # -------------------------------------------------------------------------
    ifc_batch_size: int = Field(
        default=500,
        ge=1,
        description="Number of IFC elements to process per batch.",
    )
    ifc_use_world_coords: bool = Field(
        default=True,
        description="Whether to transform geometry to world coordinate system.",
    )

    # -------------------------------------------------------------------------
    # Clash Detection
    # -------------------------------------------------------------------------
    clash_tolerance_m: float = Field(
        default=0.01,
        ge=0.0,
        description="Floating-point tolerance in metres for AABB intersection tests.",
    )
    min_intersection_volume: float = Field(
        default=0.0001,
        ge=0.0,
        description="Minimum intersection volume (m³) to report as a clash.",
    )

    # -------------------------------------------------------------------------
    # XAI / RAG
    # -------------------------------------------------------------------------
    rag_max_context_tokens: int = Field(
        default=4096,
        ge=256,
        description="Maximum token budget for retrieved context fed to the LLM.",
    )
    rag_temperature: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="LLM temperature. Keep low for factual, deterministic output.",
    )
    hallucination_threshold: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="Grounding score threshold below which a report is flagged.",
    )

    # -------------------------------------------------------------------------
    # Paths
    # -------------------------------------------------------------------------
    data_dir: Path = Field(default=Path("data"), description="Root data directory.")
    processed_dir: Path = Field(
        default=Path("data/processed"),
        description="Directory for intermediate ETL output.",
    )
    reports_dir: Path = Field(
        default=Path("data/reports"),
        description="Directory for generated audit reports.",
    )
    sample_ifc_path: Path = Field(
        default=Path("data/sample/duplex_apartment.ifc"),
        description="Default path to the sample IFC file.",
    )

    @field_validator("processed_dir", "reports_dir", "data_dir", mode="before")
    @classmethod
    def ensure_directory_exists(cls, v: str | Path) -> Path:
        """Create the directory if it does not already exist."""
        path = Path(v)
        path.mkdir(parents=True, exist_ok=True)
        return path


# ---------------------------------------------------------------------------
# Module-level singleton — import this everywhere instead of instantiating.
# ---------------------------------------------------------------------------
settings = Settings()  # type: ignore[call-arg]
