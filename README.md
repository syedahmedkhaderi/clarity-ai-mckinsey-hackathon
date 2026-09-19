# LOOP

Agentic marking, diagnosis and intervention planning for Meridian Foundation
learning centres.

A facilitator marks a batch of assessments. Today that produces scores. Scores
say who got what wrong. They never say why, never say whether the same learner
made the same mistake last month, and never say whether half the room shares one
misconception.

LOOP takes the same batch and decides what the facilitator should do next, inside
the time they actually have.

## Run it in three commands

```bash
git clone https://github.com/syedahmedkhaderi/lms-marks.git
cd lms-marks
./setup.sh && ./start.sh
```

Then open http://localhost:5173. **It opens on a finished analysis already**, so
there is something to look at before you press anything. That example is seeded
at startup from the deterministic rules, takes about a second, and is labelled on
screen as an example. Pressing Analyse runs it for real against the model.

`setup.sh` creates the virtualenv, installs both dependency sets, generates the
data, seeds the learner history, rebuilds the frontend fixtures and runs the
tests. It refuses to finish if the tests fail.

### Which model it uses

LOOP picks its provider automatically, and `/api/health` reports which one is
live:

| Credentials present | Provider | Models |
|---|---|---|
| `QB_CLIENT_ID` + `QB_CLIENT_SECRET` | QuantumBlack Azure AI gateway | `gpt-4.1-mini` |
| `OPENAI_API_KEY` | OpenAI directly | `gpt-4o-mini` and `gpt-4o` |
| neither | Offline deterministic rules | none |

A `qb_gateway/.env` sitting next to this project is read automatically, so
gateway credentials never need copying into the repo. `qb_gateway/` is
gitignored.

**No API key is needed to run it.** Offline mode is a deterministic rule engine
producing the same shapes as the model path, so the whole system is demoable
with no key and no network.

It is also the crash floor, and that floor is tested rather than asserted. Point
the app at a dead endpoint and a full run still completes **in 1.5 seconds**,
with all 96 marks, 28 named misconceptions, the cohort pattern and a plan inside
the budget. A circuit breaker opens after three consecutive failures so the run
stops paying a timeout per call, and the trace tells the facilitator plainly that
the provider stopped answering and the rules took over.

Set `LOOP_OFFLINE=1` to force the rules even when credentials are present. The
test suite does this, so tests stay fast, free and repeatable.

## What it does

1. Marks each response provisionally against a scheme, with a confidence.
2. Names the misconception behind each error, citing the exact span of the
   learner's own answer as evidence.
3. Accumulates a per-learner error profile across assessments, handling learners
   whose records have gaps.
4. Separates an individual problem from a teaching problem at cohort level.
5. Decides how to spend a fixed facilitator time budget, and says what it had to
   leave out.
6. Escalates what it should not decide alone, with both readings it was weighing
   and what it would have chosen if forced.
7. Re-plans when a facilitator overrides it.

**The agent never sets a mark that counts.** Every mark is provisional until a
human approves it. That is a product requirement, not a disclaimer.

## The demo, step by step

This sequence is reproducible from a clean `./setup.sh` and is guarded by
`tests/test_override_replan.py`.

1. **Run and trace.** Choose "Test 3" from the test list and press Analyse this
   test. The planner runs against a fixed 120 minute budget in code; the
   facilitator does not set it and the UI never mentions it. The pipeline animates through intake, marker, diagnostician, cohort
   analyst and planner. The reviewer gate appears as a dashed branch off the
   line, because that is what it is in the code.

2. **Learners, Amira K. (L07).** M01, adding numerators and denominators
   separately, in both A1 and A3. The evidence span is highlighted inside her own
   answer: `1/3 + 1/4 = 2/7.` She is a returner missing A2, so her history bar
   shows 3 of 4 assessments.

3. **Learners, Liu Y. (L11).** Her answer to the same question is
   `Answer is 7/12 km. and then add top ones together I make bottom number same
   12.` The total is correct. The word order is not. LOOP marks it full marks and
   records no misconception against her at all. If the marker does withhold a
   presentation criterion, the diagnosis is escalated as `LANGUAGE_BARRIER`
   instead. Either way the guarantee is the same and it holds on every run: a
   learner whose mathematics is right is never recorded as conceptually weak.

   This is enforced in code, not asked for in a prompt.
   `offline_rules.mathematics_is_correct` reads the marking scheme, and if the
   learner reached the value it asks for, a conceptual, procedural or
   computational node cannot be the explanation whatever the model returned.
   That guard exists because without it the model diagnosed exactly this answer
   as a procedural misconception at 0.9 confidence.
   `tests/test_language_rule.py` holds the line.

4. **Cohort.** M01 is held by 5 of 12 learners, 42 percent, at or above the 40
   percent threshold. It is labelled a teaching problem, not five individual
   problems.

5. **Action plan.** One ordered list, most important first: a group re-teach on
   M01, restart points for the three learners who returned after a gap, peer
   pairings and feedback reviews. Actions the planner ranked below its budget
   follow in the same list rather than in a separate "did not fit" section; the
   API response still carries them under `plan.dropped` with severity and the
   reason "budget exhausted".

   The model proposes and scores the actions, but three things follow from rules
   and it cannot override them: every learner gets a drafted feedback note, every
   returner gets a restart point, and a group re-teach exists for a node **if and
   only if** the cohort analyst put that node above the threshold. Otherwise the
   plan could contradict the cohort view sitting next to it.

6. **Review queue.** The language case and the ambiguous diagnoses where two
   readings were too close to separate. `BUDGET_OVERFLOW` escalations are still
   raised by the reviewer and returned by the API, but the frontend drops them
   because the time box is not shown.

7. **The override.** Open Kwame A. (L06) on A3Q4, press Override, choose "Not a
   misconception at all", give a reason. LOOP re-enters the graph at the cohort
   analyst. M01 falls to 4 of 12, 33 percent, below the threshold. It is no
   longer a teaching problem, so the group re-teach is **withdrawn**, and the
   work it had ranked above moves up the list. The plan view highlights every
   change.

   Verified on three consecutive live runs: 5 of 12 and a group session before
   the override, 4 of 12 and none after it, budget refilled each time.

Step 7 is the point. The agent did not just accept a correction; it recomputed
what the correction implied and rebuilt its decision.

## Measured, not asserted

```bash
.venv/bin/python eval/evaluate.py
```

Writes `eval/results.md`: misconception recovery rate, top-2 recovery,
escalation precision, returner handling, and **language separation**, the
recovery rate on second-language learners against everyone else. A large gap
there is the failure mode the whole design is built to avoid, so it is reported
whether it flatters the system or not.

`eval/results.md` states which mode produced the numbers. In offline mode the
rules encode the same mathematics the generator used to inject the errors, so
the recovery rate is a wiring check, not a measurement of model quality.

Measured on the QuantumBlack gateway with `gpt-4.1-mini`, assessment A3:

| Metric | Result |
|---|---|
| Misconception recovery | 96% (24 of 25) |
| Recovery before the reviewer gate | 100% (25 of 25) |
| Recovery on second-language learners, before the gate | 100% (6 of 6) |
| Recovery on everyone else, before the gate | 100% (19 of 19) |
| Evidence span validity | 100% (32 of 32) |
| Returner handling | 100% (3 of 3) restart points proposed |
| Run time, full cohort | 21 to 26 seconds |

The one case not recovered is L11, whose mathematics was correct and whose
diagnosis the reviewer deliberately held back as a language barrier. The
diagnostician named it correctly first. Zero second-language learners were
misdiagnosed as conceptually weak, which is the behaviour the whole fixture
exists to protect.

`gpt-5.4` is also available on the gateway and is one environment variable away
(`LOOP_MODEL_SMART=gpt-5.4-2026-03-05`), but it measured slightly worse here
(92% recovery) and took three times as long, so it is not the default. That
comparison is the reason the eval harness exists.

## The independence rule

`data/generator.py` produces every error from an explicit Python function keyed
to a taxonomy node. No language model authors the errors. If a model wrote the
errors and the same model diagnosed them, the accuracy number would be
self-graded and worthless.

**The backend never reads `data/ground_truth.json`.** Only `eval/evaluate.py`
does, and it greps the `backend/` package for the string and fails loudly if it
ever appears there.

The generator also asserts that language noise leaves the mathematics untouched:
the multiset of numeric tokens in a written answer is identical before and after
noise is applied. A second-language learner's answer differs from a fluent one
only in its grammar.

## The taxonomy

`data/taxonomy.json` is a versioned artifact: 24 misconception nodes across 7
topics, 5 error classes, every node carrying a description, typical evidence and
a plain-language remediation hint written for a facilitator who is not a subject
specialist. Four nodes are in the `language` class, because second-language
handling is a client requirement and not an afterthought.

It is readable and auditable by a subject expert without touching code. The
diagnostician is given only the nodes for the question's topic, which keeps the
choice tractable and the accuracy up.

## Layout

```
backend/
  config.py        every threshold the graph branches on
  state.py         LoopState, the wire contract
  models.py        pydantic models, mirrored in frontend/src/types.ts
  graph.py         LangGraph wiring, GRAPH_EDGES asserted against architecture.md
  service.py       batch runs, overrides, plan diffing
  api.py           FastAPI surface
  llm.py           the only module that imports langchain_openai
  agents/          intake, marker, diagnostician, cohort_analyst, planner, reviewer
  agents/offline_rules.py   deterministic marking and diagnosis
  prompts/         marking, diagnosis, planning, feedback
  lms/mock_api.py  shaped like Canvas and Moodle REST endpoints
data/              taxonomy, marking schemes, personas, rule-based generator
eval/              evaluate.py, results.md
frontend/          React, Vite, TypeScript, Tailwind
tests/             pytest
```

`architecture.md` has the graph, the gate table and the state table, and its
diagram is asserted equal to the compiled graph by a test.

## Integration story

`backend/lms/mock_api.py` is shaped like a real LMS REST API and names the
Canvas and Moodle endpoint each of its four routes maps to. Swapping the
connector is the integration work. It is not a rewrite.

## Divergences from the plan

`CODEX_BUILD_PLAN.md` is the original spec. Four deliberate divergences:

1. **The demo numbers.** The plan's section 8 describes M01 held by 7 of 12
   learners, dropping to 6 of 12 after an override and thereby falling below the
   40 percent threshold. 6 of 12 is 50 percent, which is above 40 percent, so
   that sequence cannot happen. The personas are tuned instead so M01 lands on 5
   of 12 (42 percent, above the threshold) and one override drops it to 4 of 12
   (33 percent, below it). The threshold itself is unchanged at 40 percent and
   lives in `backend/config.py`.

2. **`backend/llm.py` and `backend/agents/offline_rules.py`** are not in the
   plan's file layout. The first is the single provider boundary that makes the
   try/except-with-fallback requirement enforceable in one place rather than
   five. The second is that fallback, and is what lets the system run with no API
   key.

3. **The facilitator time budget is not a UI control.** The planner still fits a
   fixed budget in code and records what it dropped (invariant 8), and the
   approve endpoint still exists (invariant 1), but the frontend shows neither a
   time box nor a confirm-marks table. Facilitators asked for one ordered list
   of things to do and the drafted notes to students, nothing about minutes.

4. **The accent is also the primary action colour.** `AGENTS.md` section 5
   reserves the `agent` colour for agent activity and agent decisions. After a
   design review the LOOP pages moved to a work-surface layout with a summary
   rail and tabs, in navy on cool grey, and the same navy is now the primary
   button and the rail's shortcut to the plan. `flag` still marks only what the
   agent handed to a human. The LMS shell around the pages is unchanged.

## Working on it

`AGENTS.md` is the contributor guide, shared by every coding agent and symlinked
to `CLAUDE.md` and `.cursorrules`. It lists eleven invariants that each have a test
behind them. Read it before changing anything.
