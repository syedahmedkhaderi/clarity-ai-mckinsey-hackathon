"""What happens when the model provider is down.

The product claim is that LOOP degrades rather than breaks: a dead endpoint
costs quality, never a crash, a hang, or a blank screen. These tests break the
provider deliberately and assert the run still produces a complete, usable
result.
"""

from __future__ import annotations

from typing import Any

import pytest

from backend import config, llm


@pytest.fixture(autouse=True)
def _reset_breaker():
    llm.breaker.reset()
    yield
    llm.breaker.reset()


def test_breaker_opens_after_consecutive_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    """A dead endpoint must stop being retried, or every remaining call in the
    run pays a full timeout before reaching the answer rules already had."""
    monkeypatch.setattr(config, "OFFLINE", False)
    monkeypatch.setattr(llm.config, "PROVIDER", "azure")

    def explode(*_args: Any, **_kwargs: Any) -> Any:
        raise ConnectionError("gateway unreachable")

    monkeypatch.setattr(llm, "_client", explode)

    tripped: list[str] = []
    for _ in range(config.LLM_FAILURE_THRESHOLD):
        assert llm.call("sys", "user", _Dummy, on_trip=tripped.append) is None

    assert llm.breaker.is_open, "breaker did not open after repeated failures"
    assert llm.degraded() is True
    assert llm.available() is False
    assert len(tripped) == 1, "the trip should be reported exactly once, not per call"


def test_calls_short_circuit_once_open(monkeypatch: pytest.MonkeyPatch) -> None:
    """Once open, later calls return immediately without touching the network."""
    monkeypatch.setattr(config, "OFFLINE", False)
    calls = {"n": 0}

    def explode(*_args: Any, **_kwargs: Any) -> Any:
        calls["n"] += 1
        raise ConnectionError("down")

    monkeypatch.setattr(llm, "_client", explode)
    for _ in range(config.LLM_FAILURE_THRESHOLD):
        llm.call("sys", "user", _Dummy)
    attempts_before = calls["n"]

    for _ in range(10):
        assert llm.call("sys", "user", _Dummy) is None
    assert calls["n"] == attempts_before, "calls were still attempted while the breaker was open"

    assert llm.call_many("sys", ["a", "b", "c"], _Dummy) == [None, None, None]
    assert calls["n"] == attempts_before, "call_many bypassed the breaker"


def test_a_success_closes_the_breaker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "OFFLINE", False)
    llm.breaker.record_failure("x")
    llm.breaker.record_success()
    assert not llm.breaker.is_open


def test_pipeline_completes_with_the_provider_dead(monkeypatch: pytest.MonkeyPatch,
                                                   tmp_path: Any) -> None:
    """The whole point. With every model call failing, a run still produces
    marks, diagnoses, a cohort view and a plan inside the budget."""
    from backend import db, service

    monkeypatch.setattr(config, "OFFLINE", False)
    monkeypatch.setattr(llm.config, "PROVIDER", "azure")

    def explode(*_args: Any, **_kwargs: Any) -> Any:
        raise ConnectionError("gateway unreachable")

    monkeypatch.setattr(llm, "_client", explode)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "broken.db")
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "broken.db")
    db.init_db(tmp_path / "broken.db")

    result = service.run_sync("A3")

    assert result["status"] == "complete", "a dead provider stopped the run completing"
    assert result["marks"], "no marks were produced"
    assert all(m["provisional"] for m in result["marks"]), "a mark escaped the provisional rule"
    assert result["diagnoses"], "no misconceptions were named"
    assert result["patterns"] is not None, "no cohort analysis"
    assert result["plan"] is not None, "no plan was built"
    assert result["plan"]["minutes_used"] <= result["plan"]["budget_minutes"]
    assert every_diagnosis_is_rule_based(result)
    assert any(e["action"] == "provider_down" for e in result["trace"]), (
        "the trace never told the facilitator the provider was down")


def every_diagnosis_is_rule_based(result: dict[str, Any]) -> bool:
    return all(d["source"] in ("fallback", "distractor_map") for d in result["diagnoses"])


class _Dummy(__import__("pydantic").BaseModel):
    value: str = ""
