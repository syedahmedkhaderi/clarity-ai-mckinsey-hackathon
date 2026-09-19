"""The diagram must match the code.

The build plan makes this explicit: "a diagram that contradicts the code is a
scored failure". So the compiled LangGraph, the constants the API and the UI
draw from, and the mermaid block in docs/architecture.md are all asserted to describe
one and the same graph.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from backend.graph import (
    GRAPH_EDGES,
    GRAPH_NODES,
    REPLAN_ENTRY,
    REVIEWER_GATED_NODES,
    build_graph,
    build_replan_graph,
)

ROOT = Path(__file__).resolve().parent.parent
ARCHITECTURE = ROOT / "docs" / "architecture.md"

START = "__start__"
END = "__end__"

MERMAID_BLOCK = re.compile(r"```mermaid\s*(.*?)```", re.DOTALL)
MERMAID_EDGE = re.compile(r"^\s*([A-Za-z_][\w]*)\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*"
                          r"-->\s*(?:\|[^|]*\|\s*)?"
                          r"([A-Za-z_][\w]*)\s*(?:\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*$")


def _normalise(name: str) -> str:
    """langgraph's terminal sentinel is __end__; the declared shape calls it END."""
    return "END" if name == END else name


def _compiled_shape(graph: object) -> tuple[set[str], set[tuple[str, str]], str | None]:
    drawn = graph.get_graph()  # type: ignore[attr-defined]
    nodes = {n for n in drawn.nodes if n not in (START, END)}
    edges = {(_normalise(e.source), _normalise(e.target))
             for e in drawn.edges if e.source != START}
    entry = next((e.target for e in drawn.edges if e.source == START), None)
    return nodes, edges, entry


def test_compiled_graph_matches_declared_shape() -> None:
    nodes, edges, entry = _compiled_shape(build_graph())
    assert nodes == set(GRAPH_NODES), (
        f"compiled nodes {sorted(nodes)} do not match GRAPH_NODES {sorted(GRAPH_NODES)}")
    assert edges == set(GRAPH_EDGES), (
        f"compiled edges {sorted(edges)} do not match GRAPH_EDGES {sorted(GRAPH_EDGES)}")
    assert entry == "intake"


def test_declared_shape_has_no_duplicates() -> None:
    assert len(GRAPH_NODES) == len(set(GRAPH_NODES))
    assert len(GRAPH_EDGES) == len(set(GRAPH_EDGES))


def test_replan_graph_is_cohort_analyst_and_planner_only() -> None:
    nodes, edges, entry = _compiled_shape(build_replan_graph())
    assert nodes == {"cohort_analyst", "planner"}, (
        "the re-plan graph must re-enter below the marker and the diagnostician, so the "
        f"marks under an override are never re-derived. Found {sorted(nodes)}")
    assert entry == REPLAN_ENTRY
    assert edges == {("cohort_analyst", "planner"), ("cohort_analyst", "END"),
                     ("planner", "END")}
    assert set(edges) <= set(GRAPH_EDGES), (
        "the re-plan graph must be a subgraph of the declared shape")


def test_reviewer_is_a_gate_not_a_node() -> None:
    nodes, _, _ = _compiled_shape(build_graph())
    assert "reviewer" not in nodes, (
        "the reviewer is a gate function called inside marker, diagnostician and planner. "
        "Drawing it as a graph node would be a diagram that contradicts the code.")
    assert REVIEWER_GATED_NODES, "the gated node list must not be empty"
    for name in REVIEWER_GATED_NODES:
        assert name in nodes, f"{name} is listed as reviewer-gated but is not a graph node"


def _mermaid_edges(text: str) -> set[tuple[str, str]]:
    block = MERMAID_BLOCK.search(text)
    assert block, "docs/architecture.md contains no ```mermaid block to compare against the graph"
    edges: set[tuple[str, str]] = set()
    for line in block.group(1).splitlines():
        match = MERMAID_EDGE.match(line)
        if match:
            edges.add((_normalise(match.group(1)), _normalise(match.group(2))))
    return edges


def test_architecture_diagram_matches_the_graph() -> None:
    if not ARCHITECTURE.exists():
        pytest.fail(
            f"{ARCHITECTURE} does not exist. Section 9 of the build plan requires an "
            f"docs/architecture.md whose diagram matches the actual graph, and this test is the "
            f"check on it. Expected a ```mermaid block containing exactly these edges: "
            f"{sorted(GRAPH_EDGES)}")
    edges = _mermaid_edges(ARCHITECTURE.read_text())
    missing = set(GRAPH_EDGES) - edges
    extra = edges - set(GRAPH_EDGES)
    assert not missing, f"docs/architecture.md is missing these real edges: {sorted(missing)}"
    assert not extra, f"docs/architecture.md draws edges the code does not have: {sorted(extra)}"
    assert edges == set(GRAPH_EDGES)


def test_architecture_mentions_every_node() -> None:
    if not ARCHITECTURE.exists():
        pytest.fail(f"{ARCHITECTURE} does not exist; see "
                    f"test_architecture_diagram_matches_the_graph for what it must contain.")
    text = ARCHITECTURE.read_text()
    for node in GRAPH_NODES:
        assert node in text, f"docs/architecture.md never mentions the {node} node"
