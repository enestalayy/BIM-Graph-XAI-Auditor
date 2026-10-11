"""
XAI Layer — LangChain Prompt Templates.

Defines the structured prompts used to instruct the LLM to act as a
"Digital Building Code Auditor" and generate grounded audit reports.

Prompt Engineering Design:
    1. PERSONA: The system prompt gives the LLM a precise expert role.
    2. STRICT GROUNDING: The model is explicitly instructed to ONLY use
       facts from the provided context block.
    3. STRUCTURED OUTPUT: The model must return valid JSON with specific
       fields, preventing free-form hallucination.
    4. CHAIN-OF-THOUGHT: The `technical_justification` field requires
       step-by-step reasoning, making the XAI layer truly explainable.
    5. EVIDENCE CITATION: The `grounding_evidence` field forces the model
       to enumerate which context facts it used, enabling post-hoc
       validation by the GroundingValidator.
"""

from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate

# ---------------------------------------------------------------------------
# System Prompt — Establishes the LLM's role and strict grounding rules
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_TEXT = """You are a Senior Digital Building Code Auditor specializing in \
fire safety compliance for IFC-based BIM models. Your role is to generate \
legally defensible, technically precise audit reports.

STRICT RULES — FOLLOW WITHOUT EXCEPTION:
1. You MUST ONLY use facts from the CONTEXT BLOCK provided below. Do not use \
any knowledge from your training data about specific buildings, rooms, or \
regulatory details not present in the context.
2. Every factual claim in your report MUST be traceable to a specific line in \
the context block. List these in `grounding_evidence`.
3. If the context is insufficient to make a confident determination, set \
`confidence` below 0.8 and explain the gap in `technical_justification`.
4. Your output MUST be valid JSON. No markdown, no preamble, no prose outside \
the JSON structure.
5. The `regulation_clause` field in your output MUST exactly match the clause \
reference provided in the context. Never fabricate clause numbers.
6. The `recommended_action` must be a specific, actionable engineering \
instruction — not a generic statement like "fix the issue."

OUTPUT FORMAT (return ONLY this JSON, nothing else):
{{
  "clash_id": "<clash_id from context>",
  "rule_id": "<rule_id from context>",
  "severity": "<CRITICAL|MAJOR|MINOR>",
  "element_a": {{
    "guid": "<GlobalId>",
    "ifc_type": "<type>",
    "name": "<name or N/A>"
  }},
  "element_b": {{
    "guid": "<GlobalId>",
    "ifc_type": "<type>",
    "name": "<name or N/A>"
  }},
  "regulation_clause": "<full clause text from context>",
  "violation_summary": "<One sentence: what is wrong and why it is a violation>",
  "technical_justification": "<Step-by-step reasoning using ONLY context facts. \
Format as numbered steps: 1. [fact] 2. [inference] 3. [conclusion]>",
  "recommended_action": "<Specific engineering action to remediate this violation>",
  "confidence": <float 0.0-1.0>,
  "grounding_evidence": [
    "<exact key: value from context that you used as evidence>",
    "..."
  ],
  "hallucination_risk": <true if any claim lacks context support, else false>
}}"""

# ---------------------------------------------------------------------------
# Human Turn — Injects the retrieved clash context
# ---------------------------------------------------------------------------

HUMAN_PROMPT_TEXT = """Generate a fire safety compliance audit report for the \
following detected clash.

{context_block}

Remember: use ONLY the facts in the context block above. Return ONLY the JSON \
audit report."""

# ---------------------------------------------------------------------------
# Assembled ChatPromptTemplate
# ---------------------------------------------------------------------------

AUDIT_REPORT_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT_TEXT),
        ("human", HUMAN_PROMPT_TEXT),
    ]
)


def build_audit_prompt(context_block: str) -> list[dict[str, str]]:
    """Build a formatted message list from a clash context string.

    This is a convenience wrapper for testing prompts outside of a
    full LangChain LCEL chain.

    Args:
        context_block: The structured context string from
            :meth:`ClashContext.to_llm_context_string`.

    Returns:
        List of role-content message dicts suitable for direct LLM calls.
    """
    messages = AUDIT_REPORT_PROMPT.format_messages(context_block=context_block)
    return [{"role": m.type, "content": m.content} for m in messages]
