# AGENTS.md

Working agreement for any coding agent on this repository: Claude Code, Codex,
GLM, Cursor, or a human reading it as a contributor guide. It is the single
source of truth. `CLAUDE.md` and `.cursorrules` are symlinks to this file.

Read this before changing anything.

## 1. What this project is

LOOP is an agentic system for Meridian Foundation, a non-profit running
community learning centres. A facilitator marks a batch of assessments. LOOP
marks provisionally, names the misconception behind each error with evidence,
tracks it per learner across assessments, separates individual problems from
teaching problems, decides how to spend a fixed facilitator time budget, and
escalates what it should not decide alone.

`CODEX_BUILD_PLAN.md` is the original specification. `architecture.md` is the
system as built. Where they disagree, `architecture.md` is right and the
divergence should be noted in the README's "Divergences from the plan" section.

## 2. Non-negotiable invariants

Breaking any of these is a defect, not a trade-off. Each has a test.

1. **The agent never sets a mark that counts.** Every `Mark` carries
   `provisional=True` until a human calls the approve endpoint. This is a product
   requirement, not a disclaimer. Do not add a code path that sets
   `provisional=False` outside `service.approve`.

2. **`backend/` never reads `data/ground_truth.json`.** Only `eval/evaluate.py`
   may. `eval/evaluate.py` greps the backend package for the string and fails if
   it finds it. If a diagnosis needs to know the right answer, it must derive it
   from `data/marking_schemes.json` like a subject expert would.

3. **Evidence spans are verbatim.** `Diagnosis.evidence_span` must be a
   contiguous substring of that learner's answer. If a model returns text not
   present in the answer, reject the diagnosis and fall back. Fabricated evidence
   is the worst possible failure in a demo where a judge can read the answer on
   screen.

4. **Errors in the generator are produced by rules, never by a model.**
   `data/generator.py` has one explicit Python function per taxonomy node. If a
   model authored the errors and the same model diagnosed them, the accuracy
   number would be self-graded and meaningless.

5. **Language noise never changes the mathematics.** `data/generator.py`
   asserts the multiset of numeric tokens is identical before and after noise is
   applied. A second-language learner's answer must differ from a fluent one only
   in its grammar.

6. **A learner who understands the mathematics but writes it badly is never
   diagnosed as conceptually weak.** This is the single most important behaviour
   in the system. It lives in the language rule in
   `backend/prompts/diagnosis.py` and in the `language_flag` gate in
   `backend/agents/reviewer.py`. If you weaken either, `eval/results.md` will
   show a language separation gap and you have regressed the product.

7. **The planner does not fit its own plan to the budget.** A model proposes and
   scores; `planner._fit_budget` fills the budget in code and records every
   dropped item with its severity and reason. An agent that silently trims to fit
   hides the trade-off, and the trade-off is the thing worth showing.

8. **The diagram matches the graph.** `architecture.md` contains a mermaid block
   whose edges are asserted equal to `backend.graph.GRAPH_EDGES` by
   `tests/test_graph_matches_docs.py`. If you change the graph, update
   `GRAPH_EDGES` and the diagram in the same commit. A diagram that contradicts
   the code is a scored failure and it is the first thing a technical judge
   checks.

9. **No model call can crash the graph.** `backend/llm.py::call` catches
   everything and returns `None`. Every caller has a deterministic fallback that
   escalates rather than inventing an answer. The demo must never show a stack
   trace.

10. **The override re-plan works.** Overriding a diagnosis re-enters the graph at
    `cohort_analyst`, not at `intake`. Marks below the override are not re-run.
    `tests/test_override_replan.py` guards this end to end.

## 3. How to run things

```
./setup.sh              one-time: venv, deps, data, fixtures, tests
./start.sh              backend on :8000 and frontend on :5173
./start.sh api          backend only
.venv/bin/python -m pytest -q
.venv/bin/python eval/evaluate.py
cd frontend && npm run typecheck
```

Always use `.venv/bin/python`, never a bare `python3`. The venv is Python 3.11.

Regenerating data:

```
.venv/bin/python data/build_marking_schemes.py   # rebuild the 32 questions
.venv/bin/python data/generator.py               # rebuild submissions + ground truth
.venv/bin/python scripts/build_fixture.py        # rebuild frontend fixtures from a real run
```

`scripts/build_fixture.py` deletes and rebuilds `loop.db`. Run it whenever the
state shape changes, so the committed fixture cannot drift from the real schema.

## 4. Code standards

**Python**

- Type hints on every function signature. `from __future__ import annotations`
  at the top of every module.
- One agent per file under `backend/agents/`.
- No function over 60 lines. If it grows past that, the extraction is usually
  obvious.
- Structured output only for model calls. Never regex a model response.
- Every threshold the graph branches on lives in `backend/config.py`, so a
  reviewer can audit the decision rules without reading agent code. Do not
  inline a magic number in an agent.
- `sqlite3` stdlib, no ORM. Schema lives in `backend/db.py`.

**TypeScript**

- `src/types.ts` mirrors `backend/models.py`. Change both in the same commit.
- TanStack Query for server state, `useState` locally. No Redux.
- `npm run typecheck` must pass. `noUnusedLocals` is on.

**Both**

- No emoji anywhere: code, comments, UI, commit messages, generated output.
- No decorative separator lines in generated files.
- Comments explain why, not what. Do not narrate the code.
- British spelling in user-facing copy, matching the client.

## 5. UI direction

The judges score visual quality. The brief is: simple, clean, professional, and
it must not look generated.

- **One accent colour**, `agent` in `tailwind.config.js`. It is used only for
  agent activity and agent decisions. A second accent, `flag`, marks things the
  agent handed to a human. Everything else is neutral.
- **Confidence is always a number.** Never a bare colour. A judge will ask what
  amber means and there is no good answer.
- **Evidence is highlighted inline** inside the learner's own answer, never
  quoted separately.
- **Dense tables for data, cards only for plan actions.** Do not turn a table of
  numbers into a grid of cards.
- **The LMS shell stays plain and institutional.** It is the portal a facilitator
  already uses. LOOP's own panels carry the visual weight. Do not make the shell
  pretty; the contrast is the point.
- No gradients, no glassmorphism, no drop shadows beyond the one on the modal, no
  rounded-3xl, no icon libraries. Restraint reads as professional.
- Full sentences in UI copy. No sentence fragments as labels where a sentence
  fits.

## 6. Where to be careful

- `backend/state.py::LoopState` is the wire contract. Changing it means changing
  `frontend/src/types.ts`, rebuilding the fixture, and updating the state table
  in `architecture.md`.
- `backend/agents/offline_rules.py` mirrors the mathematics of the marking
  scheme. It must not import from `data/generator.py`. Coupling them would make
  the offline recovery rate circular in a way that is invisible from the outside.
- `data/personas.json` and the seed in `data/generator.py` are tuned so the demo
  scenario is reproducible. Changing either will move the numbers in the README's
  demo script. Re-verify the scenario after any change:
  M01 must land on exactly 5 of 12 learners on A3, which is above the 40 percent
  shared-misconception threshold, so that one override drops it to 4 of 12 and
  withdraws the group re-teach.
- Adding a dependency is a version-clash risk. The stack is fixed in
  `requirements.txt` and `frontend/package.json`, both pinned exactly. Justify
  any addition.

## 7. Git

- Commit after each meaningful unit of work. Do not batch a session into one
  commit.
- Conventional-commit prefixes: `feat`, `fix`, `chore`, `docs`, `test`.
- The subject line says what changed. The body says why, and names the invariant
  it protects if it touches one.
- Never commit `.env`, `loop.db`, `node_modules/`, or `data/generated/`.

## 8. Definition of done

Before you say a change is finished:

1. `.venv/bin/python -m pytest -q` passes.
2. `cd frontend && npm run typecheck` passes.
3. If you touched the graph, `architecture.md` and `GRAPH_EDGES` agree, and the
   diagram test proves it.
4. If you touched the diagnostician or its prompt,
   `.venv/bin/python eval/evaluate.py` was re-run and the language separation gap
   did not widen.
5. If you touched the state shape, the fixture was rebuilt.
6. `./start.sh` comes up and the demo scenario in the README still runs.

State plainly what you did not do. Do not report a partial change as complete.
