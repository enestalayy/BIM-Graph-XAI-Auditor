# BIM-Graph-XAI-Auditor — Developer Makefile
# Provides convenient shortcuts for common development tasks.
# Run `make help` to see all available commands.

.PHONY: help install install-dev env neo4j-up neo4j-down neo4j-logs \
        lint format typecheck test test-unit test-integration \
        pipeline audit report ui clean

PYTHON := python3
PIP    := pip
SRC    := src

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Installation
# ---------------------------------------------------------------------------
install: ## Install core + AI + UI dependencies
	$(PIP) install -e ".[ai,ui]"

install-dev: ## Install all dependencies including dev tools
	$(PIP) install -e ".[ai,ui,dev]"
	pre-commit install

env: ## Copy .env.example to .env (only if .env does not exist)
	@test -f .env || (cp .env.example .env && echo "✅  .env created — fill in your secrets.")

# ---------------------------------------------------------------------------
# Neo4j
# ---------------------------------------------------------------------------
neo4j-up: ## Start Neo4j via Docker Compose
	docker compose up -d
	@echo "🚀 Neo4j starting at http://localhost:7474 (Bolt: bolt://localhost:7687)"

neo4j-down: ## Stop Neo4j
	docker compose down

neo4j-logs: ## Stream Neo4j logs
	docker compose logs -f neo4j

neo4j-reset: ## ⚠️  DANGER: Wipe all Neo4j data and restart
	docker compose down -v
	docker compose up -d

# ---------------------------------------------------------------------------
# Code Quality
# ---------------------------------------------------------------------------
lint: ## Run Ruff linter
	ruff check $(SRC) tests

format: ## Auto-format code with Ruff
	ruff format $(SRC) tests
	ruff check --fix $(SRC) tests

typecheck: ## Run Mypy static type checker
	mypy $(SRC)

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------
test: ## Run all tests with coverage
	pytest --cov=$(SRC) --cov-report=term-missing --cov-report=html

test-unit: ## Run unit tests only (no Neo4j required)
	pytest -m "not integration" --tb=short

test-integration: ## Run integration tests (requires running Neo4j)
	pytest -m integration --tb=short

# ---------------------------------------------------------------------------
# Pipeline Commands
# ---------------------------------------------------------------------------
pipeline: ## Run full IFC → Knowledge Graph pipeline
	@test -n "$(IFC)" || (echo "❌  Usage: make pipeline IFC=path/to/model.ifc" && exit 1)
	$(PYTHON) -m src.graph.kg_pipeline --ifc "$(IFC)"

audit: ## Run clash detection on the current graph
	$(PYTHON) -m src.audit.audit_pipeline --run

report: ## Generate XAI audit reports for all detected clashes
	$(PYTHON) -m src.xai.report_generator --run

# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
ui: ## Launch the Streamlit dashboard
	streamlit run src/ui/app.py

# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------
clean: ## Remove all generated artifacts and caches
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	@echo "✅  Cleaned up."
