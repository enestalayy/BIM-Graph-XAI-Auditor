"""
Graph Layer — Neo4j Repository.

Implements the Repository pattern for all Neo4j interactions.
This is the single point through which every Cypher query passes,
providing connection management, retry logic, and test mockability.

Why Repository pattern?
- Decouples business logic (graph builder, clash detector) from the
  database driver, making unit tests possible without a live Neo4j.
- Centralizes error handling and connection lifecycle management.
- Makes swapping Neo4j versions or moving to Aura DB effortless.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any, Generator

import neo4j
from neo4j import GraphDatabase, ManagedTransaction, Record, Result
from neo4j.exceptions import ServiceUnavailable, TransientError

from src.logger import get_logger

logger = get_logger(__name__)

# Maximum number of retries for transient Neo4j errors.
_MAX_RETRIES = 3
# Base backoff in seconds (doubles on each retry).
_RETRY_BACKOFF_S = 1.0


class Neo4jRepository:
    """Thread-safe repository for all Neo4j graph operations.

    Manages a connection pool via the official Neo4j Python driver.
    All Cypher execution is routed through this class.

    Example:
        >>> repo = Neo4jRepository("bolt://localhost:7687", "neo4j", "password")
        >>> repo.connect()
        >>> results = repo.execute_query("MATCH (n) RETURN count(n) AS cnt")
        >>> repo.close()

    Or as a context manager:
        >>> with Neo4jRepository(...) as repo:
        ...     repo.execute_query("RETURN 1")
    """

    def __init__(
        self,
        uri: str,
        user: str,
        password: str,
        database: str = "neo4j",
    ) -> None:
        """Initialize the repository with connection parameters.

        Args:
            uri: Neo4j Bolt URI (e.g., ``bolt://localhost:7687``).
            user: Neo4j username.
            password: Neo4j password.
            database: Target database name. Defaults to ``neo4j``.
        """
        self._uri = uri
        self._user = user
        self._password = password
        self._database = database
        self._driver = None

    # -------------------------------------------------------------------------
    # Connection Lifecycle
    # -------------------------------------------------------------------------

    def connect(self) -> None:
        """Open the Neo4j driver connection pool.

        The driver maintains a pool of Bolt connections. This method
        should be called once at application startup.

        Raises:
            ServiceUnavailable: If Neo4j cannot be reached.
        """
        logger.info("Connecting to Neo4j", extra={"uri": self._uri, "database": self._database})
        self._driver = GraphDatabase.driver(
            self._uri,
            auth=(self._user, self._password),
            max_connection_pool_size=20,
        )
        # Verify connectivity
        self._driver.verify_connectivity()
        logger.info("Neo4j connection established")

    def close(self) -> None:
        """Close the Neo4j driver and release all connections."""
        if self._driver:
            self._driver.close()
            self._driver = None
            logger.info("Neo4j connection closed")

    def __enter__(self) -> "Neo4jRepository":
        """Support usage as a context manager."""
        self.connect()
        return self

    def __exit__(self, *args: Any) -> None:
        """Ensure the driver is closed on context manager exit."""
        self.close()

    # -------------------------------------------------------------------------
    # Query Execution
    # -------------------------------------------------------------------------

    def execute_query(
        self,
        cypher: str,
        parameters: dict[str, Any] | None = None,
        *,
        write: bool = False,
    ) -> list[Record]:
        """Execute a single Cypher query and return all result records.

        Retries on transient errors (e.g., deadlocks) using exponential
        backoff up to ``_MAX_RETRIES`` times.

        Args:
            cypher: The Cypher query string.
            parameters: Optional parameter map for the query.
            write: Set to ``True`` for write transactions. Read transactions
                are routed to replica nodes in clustered setups.

        Returns:
            A list of :class:`neo4j.Record` objects.

        Raises:
            RuntimeError: If the driver is not connected.
            ServiceUnavailable: If Neo4j is unreachable after all retries.
        """
        if self._driver is None:
            raise RuntimeError("Neo4j driver is not connected. Call connect() first.")

        params = parameters or {}
        attempt = 0

        while attempt <= _MAX_RETRIES:
            try:
                if write:
                    records, _, _ = self._driver.execute_query(
                        cypher,
                        params,
                        database_=self._database,
                        routing_=neo4j.RoutingControl.WRITE,
                    )
                else:
                    records, _, _ = self._driver.execute_query(
                        cypher,
                        params,
                        database_=self._database,
                        routing_=neo4j.RoutingControl.READ,
                    )
                return records  # type: ignore[return-value]

            except TransientError as exc:
                attempt += 1
                if attempt > _MAX_RETRIES:
                    raise
                wait = _RETRY_BACKOFF_S * (2 ** (attempt - 1))
                logger.warning(
                    "Transient Neo4j error, retrying",
                    extra={"attempt": attempt, "wait_s": wait, "error": str(exc)},
                )
                time.sleep(wait)

    def execute_batch(
        self,
        cypher: str,
        records: list[dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        """Execute a write query in bulk using Cypher UNWIND.

        This is significantly faster than individual writes for large
        datasets because it reduces round-trips to the database.

        The query must use ``$batch`` as the parameter name and iterate
        over it with UNWIND, e.g.::

            UNWIND $batch AS row
            MERGE (e:Element {guid: row.guid})
            SET e += row

        Args:
            cypher: Cypher query using ``UNWIND $batch AS row``.
            records: List of parameter dicts (one per record).
            batch_size: Number of records per transaction.

        Returns:
            Total number of records processed.
        """
        if not records:
            return 0

        total_written = 0
        for i in range(0, len(records), batch_size):
            chunk = records[i : i + batch_size]
            self.execute_query(cypher, {"batch": chunk}, write=True)
            total_written += len(chunk)
            logger.debug(
                "Batch chunk written",
                extra={"chunk_start": i, "chunk_size": len(chunk), "total": total_written},
            )

        return total_written

    def clear_database(self) -> None:
        """Delete ALL nodes and relationships from the database.

        Warning:
            This is a destructive operation. Use only during development
            or when re-importing a fresh IFC model.
        """
        logger.warning("Clearing all data from Neo4j database", extra={"database": self._database})
        self.execute_query("MATCH (n) DETACH DELETE n", write=True)
        logger.info("Database cleared successfully")
