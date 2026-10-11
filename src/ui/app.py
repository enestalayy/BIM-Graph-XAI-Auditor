"""
Streamlit UI — BIM-Graph-XAI-Auditor Dashboard.

Multi-page dashboard for fire-safety BIM compliance auditing.
Pages:
  1. Upload & Parse  — Upload IFC file and build Knowledge Graph
  2. Graph Explorer  — Visualize the LPG topology
  3. Clash Audit     — Run and view clash detection results
  4. XAI Reports     — View LLM-generated grounded audit reports
  5. Validation      — Precision/Recall/F1 metrics dashboard

Launch:
    streamlit run src/ui/app.py
"""

from __future__ import annotations

import json
from pathlib import Path

import plotly.graph_objects as go
import streamlit as st

# ---------------------------------------------------------------------------
# Page Config — Must be the very first Streamlit call
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="BIM-Graph-XAI-Auditor",
    page_icon="🔥",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Custom CSS — Premium design with dark mode and glassmorphism
# ---------------------------------------------------------------------------
st.markdown(
    """
<style>
    /* Import Google Fonts */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }

    /* Dark sidebar */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #0f1117 0%, #1a1d2e 100%);
        border-right: 1px solid #2d3748;
    }

    /* Main background */
    .stApp {
        background: linear-gradient(135deg, #0f1117 0%, #1a1d2e 50%, #0f1117 100%);
    }

    /* Cards / metric blocks */
    .metric-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
        backdrop-filter: blur(10px);
        transition: border-color 0.2s;
    }
    .metric-card:hover { border-color: rgba(99, 179, 237, 0.4); }

    /* Severity badges */
    .badge-critical {
        background: rgba(229, 62, 62, 0.15);
        border: 1px solid #e53e3e;
        color: #fc8181;
        padding: 2px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    }
    .badge-major {
        background: rgba(237, 137, 54, 0.15);
        border: 1px solid #ed8936;
        color: #fbd38d;
        padding: 2px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    }
    .badge-minor {
        background: rgba(236, 201, 75, 0.15);
        border: 1px solid #ecc94b;
        color: #faf089;
        padding: 2px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
    }

    /* Grounding score bar */
    .grounding-bar {
        height: 8px;
        border-radius: 4px;
        background: linear-gradient(90deg, #48bb78, #38a169);
    }

    /* Section headers */
    h1, h2, h3 { color: #e2e8f0 !important; }

    /* Buttons */
    .stButton > button {
        background: linear-gradient(135deg, #4299e1, #3182ce);
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        transition: all 0.2s;
    }
    .stButton > button:hover {
        background: linear-gradient(135deg, #63b3ed, #4299e1);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(66, 153, 225, 0.4);
    }
</style>
""",
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# Sidebar Navigation
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown(
        """
        <div style='text-align:center; padding: 20px 0;'>
            <div style='font-size: 48px;'>🔥</div>
            <h2 style='margin:0; color:#e2e8f0; font-size:16px; font-weight:700;'>
                BIM-Graph-XAI-Auditor
            </h2>
            <p style='color:#718096; font-size:11px; margin:4px 0 0;'>
                Fire Safety Compliance System
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.divider()

    page = st.radio(
        "Navigation",
        options=[
            "🏠 Overview",
            "📂 Upload & Parse",
            "🕸️ Graph Explorer",
            "🔍 Clash Audit",
            "📋 XAI Reports",
            "📊 Validation",
        ],
        label_visibility="collapsed",
    )

    st.divider()
    st.markdown(
        "<p style='color:#4a5568; font-size:10px; text-align:center;'>"
        "BYKHY 2015 · Neo4j · Gemini Flash<br>Master's Thesis Project"
        "</p>",
        unsafe_allow_html=True,
    )


# ===========================================================================
# Helper: Connection status
# ===========================================================================
def get_neo4j_status() -> bool:
    """Check if Neo4j is reachable with current settings."""
    try:
        from src.config import settings
        from src.graph.neo4j_repository import Neo4jRepository

        repo = Neo4jRepository(
            uri=settings.neo4j_uri,
            user=settings.neo4j_user,
            password=settings.neo4j_password,
        )
        repo.connect()
        repo.close()
        return True
    except Exception:
        return False


# ===========================================================================
# Page: Overview
# ===========================================================================
if page == "🏠 Overview":
    st.title("🔥 BIM-Graph-XAI-Auditor")
    st.markdown(
        "**Automated fire safety compliance auditing for IFC models "
        "using Neo4j Knowledge Graphs and Explainable AI.**"
    )

    st.divider()

    col1, col2, col3 = st.columns(3)

    with col1:
        neo4j_ok = get_neo4j_status()
        status_icon = "🟢" if neo4j_ok else "🔴"
        status_text = "Connected" if neo4j_ok else "Disconnected"
        st.metric("Neo4j Status", f"{status_icon} {status_text}")

    with col2:
        from src.config import settings
        st.metric("LLM Model", settings.gemini_model)

    with col3:
        reports_dir = Path(settings.reports_dir)
        report_count = len(list(reports_dir.glob("audit_report_*.json")))
        st.metric("Generated Reports", report_count)

    st.divider()

    st.subheader("Pipeline Overview")
    st.markdown(
        """
```
IFC File → ETL Parser → Neo4j Knowledge Graph → Clash Detector → XAI Report
   │            │              │                      │                │
IfcOpenShell  Pydantic    Cypher LPG            AABB + BYKHY     Gemini Flash
```
"""
    )

    st.subheader("BYKHY 2015 Active Rules")
    from src.audit.rules import ACTIVE_RULES

    rules_data = [
        {
            "Rule ID": r.rule_id,
            "Severity": r.severity,
            "Source": ", ".join(r.source_labels),
            "Target": ", ".join(r.target_labels),
            "Description": r.description[:80] + "...",
        }
        for r in ACTIVE_RULES
    ]
    st.dataframe(rules_data, use_container_width=True)


# ===========================================================================
# Page: Upload & Parse
# ===========================================================================
elif page == "📂 Upload & Parse":
    st.title("📂 Upload & Parse IFC Model")
    st.markdown("Upload an IFC file to parse it and build the Knowledge Graph.")

    uploaded = st.file_uploader(
        "Drop your IFC file here",
        type=["ifc"],
        help="Supports IFC 2x3 and IFC4",
    )

    col1, col2 = st.columns(2)
    with col1:
        batch_size = st.number_input("Batch Size", value=500, min_value=50, max_value=2000)
        clear_db = st.checkbox("Clear existing graph before import", value=False)
    with col2:
        use_apoc = st.checkbox("Use APOC procedures", value=True)
        st.info("💡 APOC enables dynamic labels. Disable if Neo4j has no APOC.")

    if uploaded and st.button("🚀 Parse & Build Graph", use_container_width=True):
        from src.config import settings
        from src.etl.data_exporter import DataExporter
        from src.etl.ifc_parser import IFCParserService
        from src.graph.graph_builder import GraphBuilderService
        from src.graph.neo4j_repository import Neo4jRepository
        from src.graph.schema import apply_schema

        # Save uploaded file temporarily
        tmp_path = Path("data/sample") / uploaded.name
        tmp_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path.write_bytes(uploaded.read())

        with st.spinner("Parsing IFC file..."):
            try:
                parser = IFCParserService(tmp_path, batch_size=batch_size)
                parsed = parser.parse()
                exporter = DataExporter(settings.processed_dir)
                exporter.export_full_model(parsed)
                st.success(
                    f"✅ Parsed {parsed.element_count} elements, "
                    f"{len(parsed.relationships)} relationships"
                )
            except Exception as e:
                st.error(f"❌ Parse failed: {e}")
                st.stop()

        with st.spinner("Building Knowledge Graph..."):
            try:
                repo = Neo4jRepository(
                    uri=settings.neo4j_uri,
                    user=settings.neo4j_user,
                    password=settings.neo4j_password,
                    database=settings.neo4j_database,
                )
                repo.connect()
                apply_schema(repo)
                builder = GraphBuilderService(repo, batch_size=batch_size, use_apoc=use_apoc)
                summary = builder.build(parsed, clear_first=clear_db)
                repo.close()
                st.success(
                    f"✅ Graph built: {summary['nodes']} nodes, "
                    f"{summary['relationships']} relationships"
                )
                st.balloons()
            except Exception as e:
                st.error(f"❌ Graph build failed: {e}")


# ===========================================================================
# Page: Clash Audit
# ===========================================================================
elif page == "🔍 Clash Audit":
    st.title("🔍 Fire Safety Clash Audit")
    st.markdown("Detect BYKHY 2015 violations using deterministic spatial reasoning.")

    col1, col2, col3 = st.columns(3)
    with col1:
        tolerance = st.number_input("Tolerance (m)", value=0.01, min_value=0.001, format="%.3f")
    with col2:
        min_volume = st.number_input("Min Volume (m³)", value=0.0001, min_value=0.0, format="%.4f")
    with col3:
        radius = st.number_input("Mitigation Radius (m)", value=1.0, min_value=0.1)

    if st.button("🔍 Run Clash Detection", use_container_width=True):
        from src.audit.clash_detector import ClashDetectorService
        from src.config import settings
        from src.graph.neo4j_repository import Neo4jRepository

        with st.spinner("Running spatial reasoning..."):
            try:
                repo = Neo4jRepository(
                    uri=settings.neo4j_uri,
                    user=settings.neo4j_user,
                    password=settings.neo4j_password,
                    database=settings.neo4j_database,
                )
                repo.connect()
                detector = ClashDetectorService(
                    repo,
                    tolerance_m=tolerance,
                    min_volume_m3=min_volume,
                    mitigation_radius_m=radius,
                )
                summary = detector.run()
                repo.close()

                # Results
                st.success(f"✅ Detection complete — {summary['total_clashes']} violation(s) found")

                col_c, col_ma, col_mi = st.columns(3)
                col_c.metric("🔴 CRITICAL", summary["critical_count"])
                col_ma.metric("🟠 MAJOR", summary["major_count"])
                col_mi.metric("🟡 MINOR", summary["minor_count"])

                # Pie chart
                if summary["total_clashes"] > 0:
                    fig = go.Figure(
                        go.Pie(
                            labels=["CRITICAL", "MAJOR", "MINOR"],
                            values=[
                                summary["critical_count"],
                                summary["major_count"],
                                summary["minor_count"],
                            ],
                            hole=0.4,
                            marker_colors=["#e53e3e", "#ed8936", "#ecc94b"],
                        )
                    )
                    fig.update_layout(
                        title="Clash Distribution by Severity",
                        paper_bgcolor="rgba(0,0,0,0)",
                        plot_bgcolor="rgba(0,0,0,0)",
                        font_color="#e2e8f0",
                    )
                    st.plotly_chart(fig, use_container_width=True)

            except Exception as e:
                st.error(f"❌ Detection failed: {e}")

    st.divider()
    st.subheader("Detected Clashes")

    # Load and display existing clashes from Neo4j
    try:
        from src.config import settings
        from src.graph.neo4j_repository import Neo4jRepository

        repo = Neo4jRepository(
            uri=settings.neo4j_uri,
            user=settings.neo4j_user,
            password=settings.neo4j_password,
            database=settings.neo4j_database,
        )
        repo.connect()
        records = repo.execute_query(
            """
            MATCH (a:Element)-[r:CLASH_OCCURRED]->(b:Element)
            RETURN
                r.clash_id AS clash_id,
                r.rule_id AS rule_id,
                r.severity AS severity,
                r.intersection_volume_m3 AS volume,
                a.guid AS guid_a,
                a.ifc_type AS type_a,
                b.guid AS guid_b,
                b.ifc_type AS type_b,
                r.detected_at AS detected_at
            ORDER BY CASE r.severity WHEN 'CRITICAL' THEN 1 WHEN 'MAJOR' THEN 2 ELSE 3 END
            LIMIT 100
            """
        )
        repo.close()

        if records:
            st.dataframe(
                [dict(r) for r in records],
                use_container_width=True,
                column_config={
                    "severity": st.column_config.TextColumn("Severity"),
                    "volume": st.column_config.NumberColumn("Volume (m³)", format="%.4f"),
                },
            )
        else:
            st.info("No clashes detected yet. Run the audit above.")

    except Exception as e:
        st.warning(f"Could not load clashes: {e}")


# ===========================================================================
# Page: XAI Reports
# ===========================================================================
elif page == "📋 XAI Reports":
    st.title("📋 XAI Audit Reports")
    st.markdown(
        "Generate and view grounded AI audit reports for each detected violation."
    )

    reports_dir = Path("data/reports")
    report_files = sorted(reports_dir.glob("audit_report_*.json"), reverse=True)

    if report_files:
        selected_file = st.selectbox(
            "Select Report File",
            options=report_files,
            format_func=lambda p: p.name,
        )

        if selected_file:
            data = json.loads(selected_file.read_text(encoding="utf-8"))
            reports = data.get("reports", [])

            # Summary bar
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("Total Reports", data.get("total_reports_generated", 0))
            col2.metric(
                "Hallucination Flagged", data.get("hallucination_flagged", 0)
            )
            avg = (
                sum(r.get("grounding_score", 0) for r in reports) / len(reports)
                if reports else 0
            )
            col3.metric("Avg Grounding Score", f"{avg:.3f}")
            col4.metric("Generated At", data.get("generated_at", "")[:10])

            st.divider()

            # Report cards
            for report in reports:
                severity = report.get("severity", "MINOR")
                color = {"CRITICAL": "#e53e3e", "MAJOR": "#ed8936", "MINOR": "#ecc94b"}.get(
                    severity, "#718096"
                )
                grounding = report.get("grounding_score", 0)
                halluc = report.get("hallucination_risk", False)

                with st.expander(
                    f"[{severity}] {report.get('rule_id', 'N/A')} — "
                    f"Clash {report.get('clash_id', 'N/A')[:8]}..."
                ):
                    col_a, col_b = st.columns(2)
                    with col_a:
                        st.markdown("**Element A (Penetrating)**")
                        ea = report.get("element_a", {})
                        st.code(
                            f"GlobalId: {ea.get('guid', 'N/A')}\n"
                            f"Type:     {ea.get('ifc_type', 'N/A')}\n"
                            f"Name:     {ea.get('name', 'N/A')}"
                        )
                    with col_b:
                        st.markdown("**Element B (Penetrated)**")
                        eb = report.get("element_b", {})
                        st.code(
                            f"GlobalId: {eb.get('guid', 'N/A')}\n"
                            f"Type:     {eb.get('ifc_type', 'N/A')}\n"
                            f"Name:     {eb.get('name', 'N/A')}"
                        )

                    st.markdown(
                        f"**Violation:** {report.get('violation_summary', 'N/A')}"
                    )
                    st.markdown(
                        f"**Regulation:** `{report.get('regulation_clause', 'N/A')}`"
                    )
                    st.markdown("**Technical Justification:**")
                    st.markdown(report.get("technical_justification", "N/A"))
                    st.markdown(
                        f"**Recommended Action:** {report.get('recommended_action', 'N/A')}"
                    )

                    col_g, col_h = st.columns(2)
                    col_g.metric("Grounding Score", f"{grounding:.3f}")
                    col_h.metric(
                        "Hallucination Risk",
                        "⚠️ YES" if halluc else "✅ NO",
                    )

                    if report.get("grounding_evidence"):
                        with st.expander("Grounding Evidence"):
                            for ev in report["grounding_evidence"]:
                                st.markdown(f"- `{ev}`")

    else:
        st.info(
            "No reports found. Run `make report` or use the XAI report generator."
        )

    if st.button("🤖 Generate Reports Now", use_container_width=True):
        from src.config import settings
        from src.graph.neo4j_repository import Neo4jRepository
        from src.xai.graph_retriever import Neo4jClashContextRetriever
        from src.xai.rag_chain import AuditRAGChain
        from src.xai.report_generator import main as run_report

        with st.spinner("Generating XAI reports (this may take a moment)..."):
            try:
                repo = Neo4jRepository(
                    uri=settings.neo4j_uri,
                    user=settings.neo4j_user,
                    password=settings.neo4j_password,
                    database=settings.neo4j_database,
                )
                repo.connect()
                retriever = Neo4jClashContextRetriever(repo)
                contexts = retriever.get_all_clash_contexts()
                chain = AuditRAGChain()
                reports_list = chain.generate_batch(contexts)
                repo.close()

                if reports_list:
                    from datetime import datetime, timezone
                    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
                    out = Path("data/reports") / f"audit_report_{timestamp}.json"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_text(
                        json.dumps(
                            {
                                "generated_at": datetime.now(tz=timezone.utc).isoformat(),
                                "total_clashes_processed": len(contexts),
                                "total_reports_generated": len(reports_list),
                                "hallucination_flagged": sum(
                                    1 for r in reports_list if r.hallucination_risk
                                ),
                                "reports": [r.to_dict() for r in reports_list],
                            },
                            indent=2,
                            ensure_ascii=False,
                        ),
                        encoding="utf-8",
                    )
                    st.success(f"✅ {len(reports_list)} reports saved to {out}")
                    st.rerun()

            except Exception as e:
                st.error(f"❌ Report generation failed: {e}")


# ===========================================================================
# Page: Validation
# ===========================================================================
elif page == "📊 Validation":
    st.title("📊 Validation Dashboard")
    st.markdown(
        "Compare system output against the gold standard dataset to compute "
        "Precision, Recall, F1, and Hallucination Rate."
    )

    gold_path = Path("tests/validation/gold_standard.json")
    if not gold_path.exists():
        st.warning("Gold standard not found at `tests/validation/gold_standard.json`.")
        st.stop()

    reports_dir = Path("data/reports")
    report_files = sorted(reports_dir.glob("audit_report_*.json"), reverse=True)
    report_file = report_files[0] if report_files else None

    if st.button("▶️ Compute Metrics", use_container_width=True):
        from src.config import settings
        from src.graph.neo4j_repository import Neo4jRepository
        from tests.validation.metrics import compute_metrics, save_metrics_report

        with st.spinner("Computing metrics..."):
            try:
                repo = Neo4jRepository(
                    uri=settings.neo4j_uri,
                    user=settings.neo4j_user,
                    password=settings.neo4j_password,
                    database=settings.neo4j_database,
                )
                repo.connect()
                result = compute_metrics(repo, gold_path, report_file)
                repo.close()

                save_metrics_report(result, "data/reports/validation_metrics")

                col1, col2, col3 = st.columns(3)
                col1.metric("Precision", f"{result.precision:.4f}")
                col2.metric("Recall", f"{result.recall:.4f}")
                col3.metric("F1 Score", f"{result.f1_score:.4f}")

                col4, col5, col6 = st.columns(3)
                col4.metric("True Positives", result.true_positives)
                col5.metric("False Positives", result.false_positives)
                col6.metric("False Negatives", result.false_negatives)

                st.divider()
                col7, col8 = st.columns(2)
                col7.metric("Hallucination Rate", f"{result.hallucination_rate:.4f}")
                col8.metric("Reports Evaluated", result.total_reports)

                # Precision-Recall bar chart
                fig = go.Figure(
                    go.Bar(
                        x=["Precision", "Recall", "F1 Score"],
                        y=[result.precision, result.recall, result.f1_score],
                        marker_color=["#4299e1", "#48bb78", "#9f7aea"],
                        text=[
                            f"{result.precision:.4f}",
                            f"{result.recall:.4f}",
                            f"{result.f1_score:.4f}",
                        ],
                        textposition="outside",
                    )
                )
                fig.update_layout(
                    title="Clash Detection Performance Metrics",
                    yaxis=dict(range=[0, 1.1]),
                    paper_bgcolor="rgba(0,0,0,0)",
                    plot_bgcolor="rgba(0,0,0,0)",
                    font_color="#e2e8f0",
                )
                st.plotly_chart(fig, use_container_width=True)

            except Exception as e:
                st.error(f"❌ Metrics computation failed: {e}")

    # Show existing metrics if available
    metrics_path = Path("data/reports/validation_metrics.md")
    if metrics_path.exists():
        st.divider()
        st.markdown("### Last Computed Metrics")
        st.markdown(metrics_path.read_text(encoding="utf-8"))


# ===========================================================================
# Page: Graph Explorer
# ===========================================================================
elif page == "🕸️ Graph Explorer":
    st.title("🕸️ Knowledge Graph Explorer")
    st.markdown(
        "Explore the Neo4j Knowledge Graph topology. "
        "Use Neo4j Browser at http://localhost:7474 for full graph visualization."
    )

    try:
        from src.config import settings
        from src.graph.neo4j_repository import Neo4jRepository

        repo = Neo4jRepository(
            uri=settings.neo4j_uri,
            user=settings.neo4j_user,
            password=settings.neo4j_password,
            database=settings.neo4j_database,
        )
        repo.connect()

        # Node counts by type
        counts = repo.execute_query(
            """
            MATCH (e:Element)
            RETURN e.ifc_type AS ifc_type, count(e) AS count
            ORDER BY count DESC
            LIMIT 20
            """
        )
        rel_counts = repo.execute_query(
            """
            MATCH ()-[r]->()
            RETURN type(r) AS rel_type, count(r) AS count
            ORDER BY count DESC
            """
        )
        repo.close()

        col1, col2 = st.columns(2)

        with col1:
            st.subheader("Node Distribution")
            if counts:
                fig = go.Figure(
                    go.Bar(
                        x=[r["count"] for r in counts],
                        y=[r["ifc_type"] for r in counts],
                        orientation="h",
                        marker_color="#4299e1",
                    )
                )
                fig.update_layout(
                    paper_bgcolor="rgba(0,0,0,0)",
                    plot_bgcolor="rgba(0,0,0,0)",
                    font_color="#e2e8f0",
                    height=400,
                )
                st.plotly_chart(fig, use_container_width=True)

        with col2:
            st.subheader("Relationship Distribution")
            if rel_counts:
                fig2 = go.Figure(
                    go.Pie(
                        labels=[r["rel_type"] for r in rel_counts],
                        values=[r["count"] for r in rel_counts],
                        hole=0.3,
                    )
                )
                fig2.update_layout(
                    paper_bgcolor="rgba(0,0,0,0)",
                    font_color="#e2e8f0",
                    height=400,
                )
                st.plotly_chart(fig2, use_container_width=True)

        st.info(
            "💡 For full interactive graph visualization, open Neo4j Browser at "
            "http://localhost:7474 and run: `MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 100`"
        )

    except Exception as e:
        st.warning(f"Could not connect to Neo4j: {e}")
        st.markdown(
            "Start Neo4j with `make neo4j-up` and ensure your `.env` credentials are correct."
        )
