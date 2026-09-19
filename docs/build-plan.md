# LOOP - Implementation Plan for Codex

This document is the complete build specification for a hackathon project. Build it as specified. Where a decision is left open it is marked OPEN and a default is given; take the default unless instructed otherwise.

Read this whole document before writing code.

## 0. What You Are Building

**LOOP** is an agentic AI system for Meridian Foundation, a non-profit running community learning centres for ~60,000 learners a year, taught by community facilitators who are not subject specialists, with many learners studying in a second language and many leaving and returning so their records are incomplete.

A facilitator marks a batch of assessments. Today that produces scores. Scores say who got what wrong, never why, never whether the same learner made the same mistake last month, never whether half the room shares one misconception.

LOOP takes a batch of submitted assessments and autonomously:
1. Marks each response provisionally against a scheme, with confidence.
2. Names the underlying misconception for each error, citing the exact span of the learner's own answer as evidence.
3. Accumulates a per-learner error profile across assessments, handling learners with gaps.
4. Separates individual problems from teaching problems at cohort level.
5. **Decides how to spend a fixed facilitator time budget**: group re-teach, peer pairings, individual follow-ups, and drafts the feedback text.
6. Escalates anything it should not decide alone to a human review queue with its reasoning.
7. **Re-plans when a facilitator overrides it.**

Point 5 is the reason this is an agent and not a dashboard. Point 7 is the single most important behaviour to get working. Protect both.

Hard rule throughout: **the agent never sets a mark that counts.** Every mark is provisional until a human approves it. This is a product requirement, not a disclaimer.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | Python 3.11 | Backend |
| Orchestration | LangGraph | State machine with conditional edges |
| LLM plumbing | langchain-core only | Prompt templates and structured output parsing. Do not build orchestration on LangChain |
| Model provider | OpenAI via langchain-openai | Default model `gpt-4o-mini` for marking, `gpt-4o` for diagnosis and planning. Configurable via env |
| API | FastAPI + uvicorn | |
| Storage | SQLite via sqlite3 stdlib | No ORM. Schema in `backend/db.py` |
| Frontend | React 18 + Vite + TypeScript | |
| Styling | Tailwind + shadcn/ui | |
| Frontend state | TanStack Query for server state, plain useState locally | No Redux |

Do not add dependencies beyond this list without need. Every added package is a version-clash risk under time pressure.

Pin exact versions in `requirements.txt` and `package.json`. Verify the environment imports cleanly before writing feature code.

## 2. Repository Layout

```
loop/
  README.md
  architecture.md
  .env.example
  requirements.txt
  data/
    generator.py
    personas.json
    taxonomy.json
    marking_schemes.json
    ground_truth.json
    generated/
  backend/
    __init__.py
    config.py
    db.py
    state.py
    models.py
    graph.py
    agents/
      __init__.py
      intake.py
      marker.py
      diagnostician.py
      cohort_analyst.py
      planner.py
      reviewer.py
    prompts/
      marking.py
      diagnosis.py
      planning.py
      feedback.py
    lms/
      mock_api.py
    api.py
  frontend/
    index.html
    package.json
    vite.config.ts
    tailwind.config.js
    src/
      main.tsx
      App.tsx
      api/client.ts
      types.ts
      fixtures/
        batch_result.json
        lms_courses.json
      components/
        LmsShell.tsx
        AgentTrace.tsx
        BatchRunner.tsx
        LearnerCard.tsx
        DiagnosisDetail.tsx
        CohortHeatmap.tsx
        InterventionPlan.tsx
        EscalationQueue.tsx
        ConfidenceBadge.tsx
        EvidenceSpan.tsx
      views/
        Dashboard.tsx
        LearnerView.tsx
        CohortView.tsx
        PlanView.tsx
        QueueView.tsx
  eval/
    evaluate.py
    results.md
```

## 3. Build Order (non-negotiable)

Build so that something is demoable at every step. Never leave a half-built system that only works if all parts land.

| Step | Deliverable | Demoable claim |
|---|---|---|
| 1 | Data generator produces submissions + ground truth | "We have realistic data with known answers" |
| 2 | Marker + Diagnostician on one learner, printed JSON | "We name the misconception, not just the mark" |
| 3 | SQLite profile store + Dashboard + LearnerView | "We track it across time" |
| 4 | Cohort Analyst + CohortView heatmap | "We separate an individual problem from a teaching problem" |
| 5 | Planner + PlanView | "We decide what the facilitator should do next" |
| 6 | Reviewer + EscalationQueue + override re-plan | "A human stays accountable and the agent re-plans" |
| 7 | LMS shell wrapper + AgentTrace panel | "It lives inside the LMS and shows its reasoning" |

Steps 5 and 6 are the scoring core. If time is short, make steps 2 to 4 ugly and correct, and spend the saved time on 5 and 6.

## 4. Data Layer

### 4.1 Subject scope

One subject, foundational mathematics, one unit set of 7 topics:

```
T1 Fractions - equivalence and simplification
T2 Fractions - addition and subtraction with unlike denominators
T3 Decimals - place value
T4 Percentages - conversion to and from fractions
T5 Ratio and proportion
T6 Negative numbers - arithmetic
T7 Order of operations
```

### 4.2 Misconception taxonomy (`data/taxonomy.json`)

An explicit versioned artifact. It must be readable and auditable by a subject expert without touching code. This is a stated differentiator in the pitch.

Structure:

```json
{
  "version": "1.0",
  "error_classes": [
    {"id": "conceptual", "label": "Conceptual", "description": "The underlying idea is wrong"},
    {"id": "procedural", "label": "Procedural", "description": "The method is misapplied or steps are out of order"},
    {"id": "computational", "label": "Computational", "description": "The method is right, the arithmetic slipped"},
    {"id": "notational", "label": "Notational", "description": "Expression or symbol use is wrong, understanding may be intact"},
    {"id": "language", "label": "Language comprehension", "description": "The learner may not have understood the question wording, or cannot express a correct idea in the assessment language"}
  ],
  "nodes": [
    {
      "id": "M01",
      "topic": "T2",
      "error_class": "conceptual",
      "label": "Adds numerators and denominators separately",
      "description": "Treats a/b + c/d as (a+c)/(b+d), not recognising the need for a common denominator",
      "typical_evidence": "Answer shows numerator sum over denominator sum",
      "remediation_hint": "Use area models to show why denominators must match before adding"
    }
  ]
}
```

Author 18 to 24 nodes across the 7 topics. Every topic needs at least two. The `language` class must have at least three nodes, because second-language handling is a core client requirement and must appear in the demo.

`remediation_hint` exists so the Planner can draft feedback a non-specialist facilitator can actually deliver. Write these in plain language, no jargon.

### 4.3 Marking schemes (`data/marking_schemes.json`)

Per assessment, per question:

```json
{
  "assessment_id": "A3",
  "questions": [
    {
      "question_id": "A3Q4",
      "topic": "T2",
      "type": "written",
      "max_marks": 3,
      "prompt": "Ravi walks 1/3 km then 1/4 km. How far did he walk in total? Show your working.",
      "model_answer": "Common denominator 12. 4/12 + 3/12 = 7/12 km.",
      "scheme": [
        {"marks": 1, "criterion": "Identifies a common denominator"},
        {"marks": 1, "criterion": "Converts both fractions correctly"},
        {"marks": 1, "criterion": "Correct final answer 7/12 with unit"}
      ]
    },
    {
      "question_id": "A3Q5",
      "topic": "T4",
      "type": "mcq",
      "max_marks": 1,
      "prompt": "What is 3/5 as a percentage?",
      "options": {
        "a": "35%",
        "b": "60%",
        "c": "53%",
        "d": "0.6%"
      },
      "correct": "b",
      "distractor_map": {
        "a": "M14",
        "c": "M14",
        "d": "M09"
      }
    }
  ]
}
```

`distractor_map` is what makes MCQ marking deterministic and instant: each wrong option maps to a taxonomy node. No LLM call needed for MCQ diagnosis at all.

### 4.4 Personas (`data/personas.json`)

12 learners. Each has:

```json
{
  "learner_id": "L07",
  "name": "Amira K.",
  "assigned_misconceptions": ["M01", "M14"],
  "traits": {
    "returner": true,
    "missing_assessments": ["A1", "A2"],
    "second_language": false,
    "language_noise_level": 0.0,
    "careless_rate": 0.1
  }
}
```

Composition requirements:
- 3 learners with `returner: true` and 1 to 2 missing assessments. This exercises the incomplete-records path.
- 3 learners with `second_language: true` and `language_noise_level` between 0.3 and 0.6. Their written answers carry grammatical noise **independent of whether the mathematics is right**. This is the critical fixture: it tests whether the Diagnostician misdiagnoses language as conceptual weakness.
- At least 6 learners sharing misconception `M01`, so the cohort threshold fires visibly in the demo.
- Each learner has 2 to 3 assigned misconceptions that persist across assessments.

### 4.5 Generator (`data/generator.py`)

Generates 4 assessments (A1 to A4) x 12 learners, MCQ and written.

**Critical independence rule: errors are generated by a deterministic rule table, never by an LLM.** If a model authors the errors and the same model diagnoses them, the accuracy number is self-graded and meaningless. A judge will ask about this.

Generation logic per question:
1. If the question's topic matches one of the learner's assigned misconceptions, apply that misconception's error transformation with probability 0.75.
2. Otherwise apply a careless slip with probability `careless_rate`.
3. Otherwise produce a correct answer.
4. If `second_language`, apply language noise to the written text at `language_noise_level`, **after** the mathematical content is decided. Noise means dropped articles, tense errors, word-order inversion. It must never change the mathematical correctness.
5. Skip assessments listed in `missing_assessments`.

Write error transformations as explicit Python functions per taxonomy node, for example:

```python
def m01_add_numerators_and_denominators(a, b, c, d):
    """M01: treats a/b + c/d as (a+c)/(b+d)"""
    return (a + c, b + d)
```

Write correct and incorrect written answers from templates with the numbers substituted. Do not over-engineer the prose; three or four template variants per question is enough.

Output:
- `data/generated/submissions.json` - everything the pipeline sees.
- `data/ground_truth.json` - the learner-to-misconception assignment and the per-response injected node. **Never loaded by the backend.** Only `eval/evaluate.py` reads it.

Add a guard: `backend/` must not import from `ground_truth.json`. State this in the README.

## 5. Backend

### 5.1 State object (`backend/state.py`)

Freeze this first. The frontend contract depends on it. Use a TypedDict for LangGraph.

```python
class LoopState(TypedDict):
    batch_id: str
    assessment_id: str
    cohort_id: str
    facilitator_minutes: int          # the time budget the planner must respect
    submissions: list[Submission]      # populated by Intake
    marks: list[Mark]                  # populated by Marker
    diagnoses: list[Diagnosis]         # populated by Diagnostician
    patterns: CohortPatterns           # populated by Cohort Analyst
    plan: InterventionPlan             # populated by Planner
    escalations: list[Escalation]      # appended by any node via Reviewer
    trace: list[TraceEvent]            # appended by every node, drives the UI
    overrides: list[Override]          # facilitator corrections, triggers re-plan
```

Pydantic models for each type go in `backend/models.py`. Key ones:

```python
class Mark(BaseModel):
    question_id: str
    learner_id: str
    awarded: float
    max_marks: float
    confidence: float          # 0.0 to 1.0
    criteria_met: list[str]
    provisional: bool = True   # always True until human approval

class Diagnosis(BaseModel):
    question_id: str
    learner_id: str
    taxonomy_node: str | None      # None if escalated without a call
    alternative_node: str | None   # the runner-up, shown in the escalation queue
    error_class: str
    confidence: float
    evidence_span: str             # verbatim text from the learner's answer
    reasoning: str                 # one or two sentences, shown in the UI
    language_flag: bool            # suspected language barrier, not a concept failure

class TraceEvent(BaseModel):
    agent: str
    action: str
    detail: str
    timestamp: str
    duration_ms: int
```

`evidence_span` must be a verbatim substring of the learner's answer. Validate this in code; if the model returns text not present in the answer, drop to escalation. Fabricated evidence is the worst possible failure in a demo where a judge can read the answer on screen.

### 5.2 Graph (`backend/graph.py`)

```
intake -> marker -> diagnostician -> cohort_analyst -> planner -> END
```

Reviewer is not a sequential node. It is a gate function invoked at the end of `marker`, `diagnostician`, and `planner`. It inspects the outputs of that node, appends to `state["escalations"]`, and strips escalated items from what flows downstream.

Conditional edge after `cohort_analyst`: if fewer than 2 unescalated diagnoses survive, skip `planner` and go to END with a trace event explaining there is not enough signal to plan. This is a required edge-case behaviour.

**Override re-entry.** Expose a second entry point that starts at `cohort_analyst` with existing marks and diagnoses loaded from SQLite and the override applied. Marks below the override are unchanged, so re-running them would be waste and would also risk a different answer, which would look non-deterministic on stage.

```python
def build_graph() -> StateGraph: ...
def build_replan_graph() -> StateGraph:  # entry at cohort_analyst
```

Emit a `TraceEvent` at the start and end of every node. The trace panel is how the UI satisfies "how well the UI articulates the interactions of the agents."

### 5.3 Agents

#### Intake (`agents/intake.py`) - deterministic
- Load submissions for the batch from the mock LMS API.
- Load each learner's prior error profile from SQLite.
- Flag learners with missing prior assessments as `returner` with a `history_completeness` score (assessments present / assessments expected).
- If `history_completeness < 0.5`, attach a note that downstream recurrence claims for this learner are low-confidence. The Cohort Analyst must respect this.
- Never drop a learner for missing history.

#### Marker (`agents/marker.py`)
- MCQ: deterministic comparison against `correct`. Confidence 1.0.
- Written: one LLM call per response. Structured output against the `scheme` array. Return marks per criterion, a confidence, and which criteria were met.
- Batch written responses per question across learners in a single call where possible to cut latency. Live demo latency matters.
- Reviewer gate: any mark with `confidence < 0.6` is escalated and removed from the downstream flow.

#### Diagnostician (`agents/diagnostician.py`) - the core
- Only runs on responses that lost marks.
- MCQ path: look up `distractor_map`. No LLM call. Confidence 0.95.
- Written path: one LLM call. Input is the question, model answer, scheme, the learner's answer, and the **full taxonomy node list for that question's topic**. Do not send the whole taxonomy; scope it to the topic to keep the choice tractable and accuracy high.
- Required outputs: chosen node, runner-up node, confidence, verbatim evidence span, one-to-two sentence reasoning, and `language_flag`.
- **Language rule, state it explicitly in the prompt:** if the mathematical reasoning appears correct but the expression is grammatically broken, this is a `language` class node or a `language_flag`, never a conceptual node. A learner who understands the mathematics but writes it poorly must not be diagnosed as conceptually weak. This is the most important single instruction in the whole system.
- Validate the evidence span is a real substring. If not, escalate.
- Reviewer gate: escalate if confidence < 0.65, or if confidence gap between chosen and runner-up node is < 0.15, or if `language_flag` is true.

#### Cohort Analyst (`agents/cohort_analyst.py`) - deterministic
- Aggregate surviving diagnoses by taxonomy node.
- **Shared misconception:** a node held by >= 40 percent of the cohort. Flag as a teaching problem, not a set of individual problems.
- **Recurrence:** a node appearing for the same learner in >= 2 assessments. Downweight if `history_completeness < 0.5` and say so in the trace.
- **Emerging:** a node appearing in this assessment but not in prior ones.
- Refuse to call a pattern if fewer than 4 learners have data for that topic. Emit a trace event saying the sample is too small. This is a scored edge-case behaviour, do not skip it.
- Output `CohortPatterns` with per-node counts, learner lists, and classification.

#### Planner (`agents/planner.py`) - the agentic core
Receives a goal and a hard constraint, and decomposes it itself:

> Goal: maximise misconceptions resolved in the next week. Constraint: `facilitator_minutes` total. Default 120.

Action types and assumed costs, defined in `config.py`:

| Action | Cost | When |
|---|---|---|
| Group re-teach | 30 min | A shared misconception above threshold |
| Peer pairing | 15 min setup | One learner has resolved node X, another has it active |
| Individual follow-up | 20 min | High recurrence, or a returner needing a restart point |
| Drafted written feedback | 5 min review | Every learner |

Procedure:
1. LLM call: given the patterns, propose candidate actions with a severity score and a justification each.
2. **Deterministic in code:** sort by severity, greedily fill the budget, and record what was dropped.
3. LLM call: draft learner-facing feedback for each learner, using `remediation_hint` from the taxonomy, written for delivery by a non-specialist.

The plan must include a `dropped` list with the reason "budget exhausted" and the severity of each dropped item. **Do not let the model silently fit everything into the budget.** An agent that says "I could not do everything, here is what I left and why" is demonstrating the trade-off handling that is explicitly scored. Force this by making the budget tight enough that at least one item always drops in the demo scenario.

Peer pairing constraint to put in the prompt: the explainer must be given a prompt to explain the method, not to give the answer. Meridian's brief is explicit about not handing over answers.

Reviewer gate: escalate any action whose severity exceeds a threshold but which did not fit the budget, so the human sees the high-severity thing the agent could not schedule.

#### Reviewer (`agents/reviewer.py`) - deterministic gate
Six escalation triggers, each with a distinct `reason_code` shown in the UI:

| Code | Trigger |
|---|---|
| `LOW_MARK_CONFIDENCE` | Mark confidence < 0.6 |
| `AMBIGUOUS_DIAGNOSIS` | Top two taxonomy nodes within 0.15 confidence |
| `LANGUAGE_BARRIER` | `language_flag` true |
| `SPARSE_HISTORY` | `history_completeness` < 0.5 and a recurrence claim depends on it |
| `BUDGET_OVERFLOW` | High-severity action did not fit the facilitator budget |
| `COUNTS_TOWARD_RECORD` | Any mark flagged as summative |

Each escalation carries: the reason code, the agent that raised it, the agent's reasoning, both candidate interpretations where applicable, and **what the agent would have decided if forced**. That last field is what makes the escalation useful rather than a shrug.

### 5.4 Mock LMS (`backend/lms/mock_api.py`)

Shape it like a real LMS API so the integration story is credible:

```
GET  /lms/courses
GET  /lms/courses/{id}/assignments
GET  /lms/assignments/{id}/submissions
POST /lms/assignments/{id}/feedback
```

Back it with the generated JSON. Keep the interface in one file with a comment naming which real endpoints each maps to in a Canvas or Moodle style API. In the pitch this supports the claim that swapping the connector is the integration work, not a rewrite.

### 5.5 API (`backend/api.py`)

```
GET  /api/lms/courses                        proxy to mock LMS
GET  /api/lms/assignments/{id}/submissions
POST /api/batch/run                          {assessment_id, cohort_id, facilitator_minutes} -> batch_id
GET  /api/batch/{batch_id}                   full LoopState result
GET  /api/batch/{batch_id}/trace             trace events, pollable
GET  /api/learner/{learner_id}/profile       error profile across assessments
GET  /api/cohort/{cohort_id}/patterns
GET  /api/batch/{batch_id}/plan
GET  /api/batch/{batch_id}/escalations
POST /api/batch/{batch_id}/override          {type, target_id, new_value, reason} -> triggers replan
POST /api/batch/{batch_id}/approve           {item_ids} -> marks provisional=False
```

`/api/batch/run` should stream or be pollable via the trace endpoint so the UI can animate the agents running. A visible pipeline running is worth real points under "UI articulates agent interactions."

Override types: `mark`, `diagnosis`, `learner_unavailable`. All three re-enter at `cohort_analyst`.

The override response must include a `changes` object naming what differs from the previous plan, so the UI can highlight it. Compute this by diffing the old and new plan.

## 6. Frontend

### 6.1 LMS shell

Everything renders inside `LmsShell.tsx`: a left sidebar with Courses, Assignments, Gradebook, People, and a highlighted "LOOP" module entry. Top bar with the Meridian Foundation name and a facilitator avatar. LOOP's views render in the content area.

This is what makes "integrated into the learning portal" visible rather than asserted. Keep the shell deliberately plain and slightly institutional; LOOP's own panels carry the visual quality.

### 6.2 Views

**Dashboard.tsx** - assignment list from the mock LMS, a "Run LOOP analysis" button with a facilitator-minutes input, and the live `AgentTrace` panel once running.

**AgentTrace.tsx** - the six agents as a vertical pipeline, each lighting up as its trace events arrive, with duration and a one-line detail. Escalations appear as a branch off the main line. This component earns the agentic-legibility criterion; give it real attention.

**LearnerView.tsx** - one learner. Their assessments over time, each error with its named misconception, the `EvidenceSpan` highlighted inside their actual answer text, a `ConfidenceBadge`, and the agent's reasoning. Returners show a history-completeness indicator.

**CohortView.tsx** - heatmap, learners on one axis, taxonomy nodes on the other. Shared misconceptions above threshold highlighted with a "teaching problem" label. Clicking a cell opens the underlying diagnoses.

**PlanView.tsx** - the intervention plan. Scheduled actions with cost and justification, a budget bar showing minutes used against available, and a clearly visible **dropped items** section with severity and the reason. Drafted feedback per learner, each with Approve and Edit.

**QueueView.tsx** - escalations grouped by reason code. Each shows the agent's reasoning, both candidate interpretations, what it would have decided if forced, and Resolve / Override controls.

### 6.3 Contract discipline

The frontend builds entirely against `src/fixtures/batch_result.json` until integration. That fixture must be generated from a real backend run and committed, so it cannot drift from the actual schema. Generate it as soon as step 2 of the build order produces output, even if only partially populated.

### 6.4 Visual direction

Judges score visual quality explicitly. Practical guidance:
- One accent colour used only for agent activity and decisions. Everything else neutral.
- Confidence shown as a badge with a number, never a bare colour. Judges will ask what the colour means.
- Evidence spans highlighted inline in the learner's own text, not quoted separately.
- No emoji anywhere in the UI.
- Dense tables over cards where the content is data. Cards only for the plan actions.

## 7. Evaluation (`eval/evaluate.py`)

Loads `ground_truth.json` and a completed batch result. Reports:

| Metric | Definition |
|---|---|
| Misconception recovery rate | Diagnosed node equals injected node, over all injected errors |
| Top-2 recovery rate | Injected node is either the chosen or the runner-up |
| Escalation precision | Of escalated items, the share where the diagnosis would have been wrong |
| Language separation | Recovery rate on `second_language` learners vs the rest. **A large gap is the failure mode to catch** |
| Returner handling | Share of returners for whom a restart point was produced |

Write results to `eval/results.md` as a markdown table. This produces a measured number for the pitch, which almost no competing team will have.

If language separation shows a large gap, the fix is in the Diagnostician prompt, not in the taxonomy. Tighten the instruction that grammatical noise is never evidence of conceptual weakness.

## 8. Demo Scenario (build the data to make this work)

Tune personas so this exact sequence happens. Verify it end to end before the pitch.

1. Run a batch of 12 learners on assessment A3 with a 120-minute budget.
2. The agent trace runs visibly through all six agents.
3. Open learner L07: recurring M01 across A1 and A3, evidence highlighted in her own answer.
4. Open learner L11, second-language: mathematically correct, grammatically broken. The agent flagged `LANGUAGE_BARRIER` and refused to diagnose a conceptual node. It escalated instead.
5. Cohort view: 7 of 12 share M01. Labelled a teaching problem.
6. Plan view: group re-teach on M01 (30 min), two pairings (30 min), two individual follow-ups (40 min), feedback review (20 min) equals 120. One individual follow-up dropped, severity shown, reason "budget exhausted".
7. Facilitator overrides one M01 diagnosis as incorrect. The count falls to 6 of 12, below the 40 percent threshold. The plan re-runs, the group re-teach is withdrawn, the freed 30 minutes are reallocated, and the previously dropped follow-up is now scheduled. The UI highlights the change.
8. Escalation queue shows the language case and the budget overflow.

Step 7 is the money shot. Everything else can be rough if step 7 is clean.

## 9. Constraints and Standards

- Python: type hints everywhere, one agent per file, no function over 60 lines.
- No secrets committed. `.env.example` with `OPENAI_API_KEY`, `LOOP_MODEL_FAST`, `LOOP_MODEL_SMART`.
- Every LLM call wrapped in try/except with a deterministic fallback that escalates rather than crashes. **The demo must never show a stack trace.**
- Every LLM call uses structured output parsing. Never regex a model response.
- Seed all randomness in the generator so data is reproducible.
- No emoji in code, comments, UI, or output.
- No decorative separator lines in generated files.
- README must state how to run in three commands, and must state that backend never reads `ground_truth.json`.
- `architecture.md` must contain a diagram matching the actual graph. Update it if the graph changes; a diagram that contradicts the code is a scored failure.

## 10. Where to Spend Remaining Time

If ahead: improve the Diagnostician prompt and re-measure. Diagnosis quality is the foundation everything else stands on.

If behind, cut in this order:
1. Peer pairing action type
2. CohortView heatmap becomes a sorted table
3. LearnerView history timeline becomes a flat list
4. LMS shell becomes a static sidebar with no navigation

Never cut: the Planner budget trade-off with visible dropped items, the override re-plan, the escalation queue, the agent trace.
