"""
BIM-Graph-XAI-Auditor — Structured Logging Module.

Provides a factory function `get_logger` that returns a Python logger
configured for structured JSON output (production) or human-readable
console output (development).

All application modules should use this instead of `print()` or
manually instantiating loggers.

Usage:
    from src.logger import get_logger

    logger = get_logger(__name__)
    logger.info("Processing IFC file", extra={"ifc_path": str(path)})
"""

from __future__ import annotations

import logging
import sys
from typing import Any

# pythonjsonlogger is only available after installation.
# We import lazily so that the module can be imported without the dep installed
# (useful for unit tests that mock the logger).
try:
    from pythonjsonlogger import jsonlogger  # type: ignore[import-untyped]

    _JSON_LOGGER_AVAILABLE = True
except ImportError:  # pragma: no cover
    _JSON_LOGGER_AVAILABLE = False

# Cache of already-created loggers to avoid duplicate handlers.
_LOGGER_CACHE: dict[str, logging.Logger] = {}


def get_logger(name: str, level: str | None = None) -> logging.Logger:
    """Return a named logger with the application's standard handler attached.

    If a logger with the given name has already been created, the cached
    instance is returned to prevent duplicate log entries.

    Args:
        name: The logger name, typically ``__name__`` of the calling module.
        level: Optional override for the log level (e.g., ``"DEBUG"``).
            Defaults to the value from ``src.config.settings.log_level``.

    Returns:
        A configured :class:`logging.Logger` instance.
    """
    if name in _LOGGER_CACHE:
        return _LOGGER_CACHE[name]

    # Lazy-import settings to avoid circular imports at module load time.
    try:
        from src.config import settings  # noqa: PLC0415

        effective_level = level or settings.log_level
        use_json = settings.log_format == "json"
    except Exception:  # pragma: no cover
        # Fallback when settings cannot be loaded (e.g., during testing).
        effective_level = level or "INFO"
        use_json = False

    logger = logging.getLogger(name)
    logger.setLevel(effective_level)

    # Avoid adding duplicate handlers if basicConfig was already called.
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(effective_level)

        if use_json and _JSON_LOGGER_AVAILABLE:
            formatter = _build_json_formatter()
        else:
            formatter = _build_text_formatter()

        handler.setFormatter(formatter)
        logger.addHandler(handler)

    # Prevent log messages from propagating to the root logger to avoid
    # duplicate output when other libraries configure the root logger.
    logger.propagate = False

    _LOGGER_CACHE[name] = logger
    return logger


def _build_json_formatter() -> logging.Formatter:
    """Build a JSON formatter that emits structured log records.

    The JSON output includes the standard fields:
    - ``timestamp``: ISO-8601 UTC timestamp
    - ``level``: Log level name
    - ``name``: Logger name (module path)
    - ``message``: The log message
    - All ``extra`` kwargs passed to the log call

    Returns:
        A :class:`pythonjsonlogger.jsonlogger.JsonFormatter` instance.
    """
    fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
    return jsonlogger.JsonFormatter(  # type: ignore[attr-defined]
        fmt,
        rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )


def _build_text_formatter() -> logging.Formatter:
    """Build a human-readable formatter for local development.

    Returns:
        A :class:`logging.Formatter` with coloured level names.
    """
    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    return logging.Formatter(fmt, datefmt="%Y-%m-%d %H:%M:%S")


def log_exception(logger: logging.Logger, exc: Exception, **context: Any) -> None:
    """Log an exception with additional structured context.

    This helper ensures that exceptions are always logged with their full
    traceback AND any relevant operational context (e.g., file paths, IDs).

    Args:
        logger: The logger instance to use.
        exc: The exception to log.
        **context: Additional key-value pairs to attach to the log record.
    """
    logger.error(
        "Unhandled exception: %s",
        str(exc),
        exc_info=True,
        extra={"exception_type": type(exc).__name__, **context},
    )
