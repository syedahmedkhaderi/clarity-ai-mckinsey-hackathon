"""LangGraph orchestration.

Main graph:

    intake -> marker -> diagnostician -> cohort_analyst -> [has_signal?] -> planner -> END
                                                            |
                                                            +-> END (insufficient signal)

Re-plan graph, entered when a facilitator overrides the agent:

    cohort_analyst -> [has_signal?] -> planner -> END
                        |
                        +-> END

Reviewer is not a node. It is a gate function called at the end of marker,
diagnostician and planner. It appends to state["escalations"] and strips
escalated items out of what flows downstream. Drawing it as a node would be a
diagram that contradicts the code.

The re-plan graph starts at cohort_analyst on purpose. The marks and diagnoses
underneath an override are unchanged, so re-running them would burn latency and
could return a different answer, which would read as non-determinism on stage.
"""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from backend import config
from backend.agents import cohort_analyst, diagnostician, intake, marker, planner
from backend.state import LoopState, trace

PLANNER_GATE = "has_enough_signal"


def has_enough_signal(state: LoopState) -> str:
    """Conditional edge after cohort_analyst.

    Fewer than MIN_DIAGNOSES_TO_PLAN surviving diagnoses means there is nothing
    a plan could honestly be built on, so the graph ends and says so rather than
    producing a confident-looking plan from two data points."""
    surviving = len(state.get("diagnoses", []))
    if surviving < config.MIN_DIAGNOSES_TO_PLAN:
        trace(state, "graph", "skip_planner",
              f"Only {surviving} diagnoses survived the reviewer gate, below the minimum of "
              f"{config.MIN_DIAGNOSES_TO_PLAN} needed to plan. Ending without an intervention "
              f"plan rather than planning on insufficient signal.", level="decision")
        state["status"] = "insufficient_signal"
        return "end"
    return "plan"


def build_graph() -> Any:
    """Full pipeline, entered at intake."""
    g = StateGraph(LoopState)
    g.add_node("intake", intake.run)
    g.add_node("marker", marker.run)
    g.add_node("diagnostician", diagnostician.run)
    g.add_node("cohort_analyst", cohort_analyst.run)
    g.add_node("planner", planner.run)

    g.set_entry_point("intake")
    g.add_edge("intake", "marker")
    g.add_edge("marker", "diagnostician")
    g.add_edge("diagnostician", "cohort_analyst")
    g.add_conditional_edges("cohort_analyst", has_enough_signal,
                            {"plan": "planner", "end": END})
    g.add_edge("planner", END)
    return g.compile()


def build_replan_graph() -> Any:
    """Override re-entry, entered at cohort_analyst with marks and diagnoses
    already loaded from SQLite and the override applied."""
    g = StateGraph(LoopState)
    g.add_node("cohort_analyst", cohort_analyst.run)
    g.add_node("planner", planner.run)

    g.set_entry_point("cohort_analyst")
    g.add_conditional_edges("cohort_analyst", has_enough_signal,
                            {"plan": "planner", "end": END})
    g.add_edge("planner", END)
    return g.compile()


# Shape data used by architecture.md and by the UI's pipeline panel, so the
# diagram and the code cannot drift apart. tests/test_graph_matches_docs.py
# asserts that architecture.md contains exactly these edges.
GRAPH_NODES: list[str] = ["intake", "marker", "diagnostician", "cohort_analyst", "planner"]
GRAPH_EDGES: list[tuple[str, str]] = [
    ("intake", "marker"),
    ("marker", "diagnostician"),
    ("diagnostician", "cohort_analyst"),
    ("cohort_analyst", "planner"),
    ("cohort_analyst", "END"),
    ("planner", "END"),
]
REVIEWER_GATED_NODES: list[str] = ["marker", "diagnostician", "planner"]
REPLAN_ENTRY: str = "cohort_analyst"
