# BIM-Graph-XAI-Auditor

> **Automated building code compliance and clash auditing for IFC models using Neo4j Knowledge Graphs and Explainable AI (XAI) reporting.**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Neo4j 5](https://img.shields.io/badge/neo4j-5.x-green.svg)](https://neo4j.com/)
[![LangChain](https://img.shields.io/badge/langchain-0.2-orange.svg)](https://langchain.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

BIM-Graph-XAI-Auditor is a **Neuro-Symbolic hybrid system** that bridges Building Information Modeling (BIM) and Explainable Artificial Intelligence (XAI). The system:

1. **Parses** IFC files (architectural + MEP) using IfcOpenShell
2. **Constructs** a Labeled Property Graph (LPG) in Neo4j capturing spatial topology
3. **Detects** fire-safety code violations via deterministic Axis-Aligned Bounding Box (AABB) intersection tests
4. **Explains** each violation in natural language using a grounded RAG pipeline (LangChain + Gemini Flash)
5. **Validates** system performance against a gold-standard dataset (Precision, Recall, F1)

The key innovation is the **grounding guarantee**: the LLM only narrates facts retrieved from the graph — it cannot hallucinate building elements or regulation clauses that don't exist.

---

## Architecture

```
IFC File
    │
    ▼
┌─────────────────────┐
│  ETL Layer          │  IfcOpenShell → IFCElement dataclasses → JSON/CSV
│  src/etl/           │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Knowledge Graph    │  Neo4j LPG: Nodes (elements) + Edges (topology)
│  src/graph/         │  Relationships: CONTAINS, PART_OF, INTERSECTS
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Audit Engine       │  AABB spatial reasoning + BYKHY 2015 rule registry
│  src/audit/         │  Output: CLASH_OCCURRED relationships in graph
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  XAI / RAG Layer    │  Neo4j retriever → LangChain → Gemini Flash
│  src/xai/           │  Output: Grounded JSON audit reports
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Streamlit UI       │  Upload, explore, audit, report, validate
│  src/ui/            │
└─────────────────────┘
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Docker & Docker Compose
- Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### 1. Clone and set up environment

```bash
git clone https://github.com/enestalayy/BIM-Graph-XAI-Auditor.git
cd BIM-Graph-XAI-Auditor

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install all dependencies
make install-dev

# Configure environment
make env
# → Edit .env and fill in NEO4J_PASSWORD and GOOGLE_API_KEY
```

### 2. Start Neo4j

```bash
make neo4j-up
# Neo4j Browser: http://localhost:7474
# Bolt:          bolt://localhost:7687
```

### 3. Run the full pipeline

```bash
# Parse IFC → build Knowledge Graph
make pipeline IFC=data/sample/duplex_apartment.ifc

# Detect clashes
make audit

# Generate XAI reports
make report

# Launch dashboard
make ui
```

---

## Project Structure

```
BIM-Graph-XAI-Auditor/
├── data/
│   ├── sample/          # Input IFC files
│   ├── processed/       # ETL intermediate output (JSON/CSV)
│   └── reports/         # Generated audit reports
├── src/
│   ├── config.py        # Pydantic settings (single source of truth)
│   ├── logger.py        # Structured JSON logging
│   ├── etl/             # IFC parsing & data export
│   ├── graph/           # Neo4j repository & graph construction
│   ├── audit/           # Spatial reasoning & clash detection
│   ├── xai/             # RAG chain & report generation
│   └── ui/              # Streamlit dashboard
├── tests/
│   └── validation/      # Gold standard & metric computation
├── docs/                # Thesis documentation
├── notebooks/           # Exploratory Jupyter notebooks
├── docker-compose.yml   # Neo4j 5 + APOC
├── pyproject.toml       # Dependencies & tool config
├── Makefile             # Developer shortcuts
└── .env.example         # Environment variable template
```

---

## Fire Safety Rules (BYKHY 2015)

The audit engine implements the following Turkish Fire Safety Regulation clauses:

| Rule ID | Severity | Description |
|---|---|---|
| `BYKHY-2015-M51-R001` | CRITICAL | Pipe penetrates fire wall without fire damper |
| `BYKHY-2015-M51-R002` | CRITICAL | HVAC duct penetrates fire wall without fire damper |
| `BYKHY-2015-M52-R003` | MAJOR | Door in fire wall is not fire-rated |
| `BYKHY-2015-M53-R004` | MINOR | Electrical conduit penetrates fire wall |

---

## Validation

```bash
# Run all unit tests
make test-unit

# Run integration tests (Neo4j must be running)
make test-integration

# Compute Precision / Recall / F1
python -m tests.validation.metrics
```

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| IFC Parsing | `IfcOpenShell 0.7` | Full IFC schema access, open-source |
| Knowledge Graph | `Neo4j 5 + APOC` | Superior for topology queries vs relational DBs |
| LLM | `Gemini 1.5 Flash` | Cost-effective, high context window |
| Orchestration | `LangChain 0.2` | Industry standard for LLM pipelines |
| UI | `Streamlit 1.35` | Rapid prototyping for engineering dashboards |
| Geometry | `NumPy + Shapely` | Numerical precision for AABB computations |

---

## Citation

If you use this system in your research, please cite:

```bibtex
@mastersthesis{talay2024bim,
  title     = {Automated BIM Compliance Auditing Using Knowledge Graphs and Explainable AI},
  author    = {Talay, Enes},
  year      = {2024},
  school    = {[Your University]},
  type      = {Master's Thesis}
}
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.
