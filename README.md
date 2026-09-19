<div align="center">

# Clarity AI

**An agentic marking assistant for community facilitators. It marks a test, finds out *why* each student lost marks, and decides what the teacher should do next.**

Built for the **McKinsey x QuantumBlack AI Hackathon, Doha 2026**, Education theme.
Client: **Meridian Foundation**. Use case: **Marks and answer-sheet analysis**.

`LangGraph` · `FastAPI` · `React + TypeScript` · `Azure OpenAI via the QuantumBlack gateway` · `243 tests`

</div>

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/home.png" alt="Home: the analysed test at a glance" /></td>
    <td width="33%"><img src="docs/screenshots/students.png" alt="A student's findings with evidence highlighted" /></td>
    <td width="33%"><img src="docs/screenshots/email.png" alt="A drafted note to a student, ready to edit and send" /></td>
  </tr>
  <tr>
    <td align="center"><sub>The whole test at a glance: the whole-class problem, scores and four headline numbers</sub></td>
    <td align="center"><sub>Why a student lost marks, with evidence from their answer</sub></td>
    <td align="center"><sub>A note to the student, drafted and ready to send</sub></td>
  </tr>
</table>

## The problem

Meridian's 60,000 learners are taught mostly by community facilitators, not specialist teachers. Many learners study in a second language, and many leave and come back.

A marks sheet shows **who** scored what. It never shows:

- **why** each mark was lost,
- whether it is **the same mistake as last month**, or
- whether **half the class shares it**, which would make it a teaching gap rather than a problem with individual students.

Marking also uses up facilitator time, so feedback arrives too late to change anything.

## What Clarity AI does

A facilitator uploads a test. Six agents take it from there, and the facilitator keeps the final say.

| | What the agent decides | What the teacher sees |
|---|---|---|
| **Marks** | Awards draft marks against the marking scheme, each with a confidence | A draft total per student. Clarity AI never sets a final mark |
| **Diagnoses** | Names the mistake pattern behind each lost mark, out of 24 known ones | The student's own answer, with the words it relied on highlighted |
| **Remembers** | Tracks each student's mistakes across tests, including students with gaps in their record | "Keeps happening" or "Once", per mistake |
| **Separates** | Decides whether a mistake belongs to one student or to the whole class (40 percent or more) | On Home: the whole-class problem, the most common mistakes and a heatmap of who made which |
| **Plans** | Decides what to do next and ranks it, most marks lost first | One ordered action plan: re-teach, catch-ups, restart points, pairings |
| **Escalates** | Hands over anything it should not decide alone, with both readings and what it would have chosen | A "Needs your call" queue with one-click accept or correct. A decided item ticks and moves to "Already decided" |
| **Re-plans** | When the teacher corrects a finding, re-runs the class analysis and rebuilds the plan | A tick confirms the correction without leaving the page. The rebuilt plan marks each change |
| **Writes to students** | Drafts a personal note to each student from their own mistakes | An email the teacher edits and sends from the app |

## Features we are proudest of

**1. It emails students, safely.** From a student's page the facilitator presses *Write a note*. Clarity AI drafts a short, personal email: where the mistake was, what went wrong in plain words, and what to try next. The teacher can edit it, send themselves a test copy, and then send it for real over Gmail. A guard blocks any note that leaks an internal code such as `M01`, or mentions a mark, because marks are still drafts. Every note sent is logged on the student's page, and sending the same note twice asks for confirmation first. With no Gmail set up, the note is saved and labelled **not delivered**, never shown as sent.

**2. Language is never mistaken for maths.** A second-language learner who reaches the right answer but writes it awkwardly is **never** recorded as weak at maths. This is enforced in code, not asked for in a prompt: if the marking scheme's target value appears in the answer, a maths diagnosis is overruled whatever the model says. We added this rule after the model labelled a correct answer as a procedural mistake at 90 percent confidence.

**3. Evidence you can check.** Every diagnosis points to an exact piece of the student's own answer, highlighted in place. If the model quotes text that is not in the answer, the diagnosis is rejected.

**4. One correction changes the plan.** In the demo, "adds numerators and denominators separately" is made by 5 of 12 students (42 percent), so it counts as a whole-class problem and the plan includes a group re-teach. Overriding one diagnosis drops it to 4 of 12 (33 percent). The agent re-enters the graph at the cohort analyst, withdraws the group re-teach and moves the next items up the plan.

**5. It knows when to stop.** Low-confidence marks, two explanations that fit equally well, wording problems and thin records all go to the teacher with what the system would have done. It never just says "I am unsure".

**6. Ask your own files (RAG).** The pencil helper answers questions such as *"Which topic is the class weakest at?"* or *"What does the marking scheme say for question 1?"*. It is retrieval-augmented: every question runs a BM25 keyword search over the teacher's uploaded tests, marking schemes and answer sheets, plus summaries of the analysis. The model then writes an answer only from the passages it found, and lists them as sources, folded away until you open them. The search index is rebuilt on every request, so it never quotes a deleted test or an out-of-date mark. If the model is unavailable, the helper shows the most relevant passages and says plainly that the AI is not answering.

<p align="center"><img src="docs/screenshots/chat.png" alt="The pencil helper answering from the teacher's files, with its sources" width="260" /></p>

<table>
  <tr>
    <td width="33%"><img src="docs/screenshots/review.png" alt="Needs your call queue" /></td>
    <td width="33%"><img src="docs/screenshots/mistakes.png" alt="Who made which mistake, on Home" /></td>
    <td width="33%"><img src="docs/screenshots/plan.png" alt="Action plan" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Needs your call: what it was unsure about and why</sub></td>
    <td align="center"><sub>Who made which mistake: one student's problem, or the whole class's?</sub></td>
    <td align="center"><sub>The action plan, most important first</sub></td>
  </tr>
</table>

## Agent workflow

<!-- TODO: add the designed diagram as docs/agent-workflow.png and uncomment the line below. -->
<!-- <p align="center"><img src="docs/agent-workflow.png" alt="Agent workflow" width="90%" /></p> -->
> The designed workflow diagram will go here. Until then, this is the same flow in text:

```
  Test paper · marking scheme · answer sheets · earlier results (LMS)
                                  │
  ┌───────────── LangGraph: shared state and a visible trace ─────────────┐
  │                               ▼                                       │
  │                     Reading the class                                 │
  │                               ▼                                       │
  │                            Marking ◀─────────┐                        │
  │                               ▼              │                        │
  │                     Finding mistakes ◀───────┤  Safety check          │
  │                               ▼              │  low confidence,       │
  │   ┌──────────────────▶ Class picture         │  two close readings,   │
  │   │                           │              │  wording, thin record  │
  │   │             enough data ──┴── too little │                        │
  │   │                  ▼               ▼       │                        │
  │   │              Planning ◀──────────┼───────┘                        │
  │   │                  ▼               ▼                                │
  └───┼──── action plan · notes ─── insights only ────────────────────────┘
      │                  ▼
      │          Teacher decides: accept, correct, send notes
      │                  │
      └── a correction ──┘  re-plans from Class picture, marks are not re-run
```

| Agent (name in the app) | Node in the code | What it does | If the model fails |
|---|---|---|---|
| Reading the class | `intake` | Loads the test, marking scheme, answers and each student's earlier results from the LMS | No model used |
| Marking | `marker` | Draft marks with a confidence for each criterion | Rule-based marking from the scheme |
| Finding mistakes | `diagnostician` | Names the mistake pattern, quotes the evidence and gives a runner-up | Rule-based diagnosis from the scheme |
| Class picture | `cohort_analyst` | Separates one student's problem from a whole-class teaching problem | No model used |
| Planning | `planner` | Proposes and ranks the actions: re-teach, catch-ups, restart points, pairings, notes | Rule-based plan |
| Safety check | `reviewer` | Hands the teacher low confidence, two close readings, wording issues and thin records | No model used |

A dead model provider costs quality, never a run. After three failures a circuit breaker switches every agent to the deterministic rules. A run against a dead endpoint still completes in 1.5 seconds with full results. The full graph, the state contract and the frontend pages are in [`docs/architecture.md`](docs/architecture.md), and a test checks that its diagram matches the code.

## Measured, not claimed

Errors in the mock data are injected by **Python rules, never by a model**. If the same model had written the errors and then diagnosed them, the accuracy score would be self-graded. The backend is blocked from reading the answer key, and a check fails the evaluation if it ever does.

| Metric (Mid-term, 12 learners, 96 answers) | Result |
|---|---|
| Correct mistake pattern named | **92%** (23 of 25), 96% before the reviewer gate |
| Correct pattern in the top two | 96% |
| Evidence quoted from the student's own answer | **100%** (31 of 31) |
| Second-language learners wrongly called weak at maths | **0** |
| Returning learners given a restart point | **100%** (3 of 3) |
| Full class, end to end | about 25 seconds |

Reproduce with `.venv/bin/python eval/evaluate.py`. The full table is in [`eval/results.md`](eval/results.md).

## Run it

```bash
git clone https://github.com/syedahmedkhaderi/clarity-ai-mckinsey-hackathon.git && cd clarity-ai-mckinsey-hackathon
./setup.sh && ./start.sh        # then open http://localhost:5173
```

- **It opens clean.** Home greets the teacher and waits. Choose a test and press *Analyse this test*, and the agents run live. Earlier tests are seeded at startup, so a student's repeated mistakes are recognised on the first run.
- **No API key needed.** With no key it runs on deterministic rules. With `QB_CLIENT_ID` and `QB_CLIENT_SECRET` it uses the QuantumBlack gateway (`gpt-4.1-mini`). With `OPENAI_API_KEY` it calls OpenAI directly.
- **Email:** set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` to send for real. Without them, notes are saved and marked as not delivered.

<details>
<summary><b>Repository layout</b></summary>

```
backend/
  agents/        intake, marker, diagnostician, cohort_analyst, planner, reviewer, offline_rules
  graph.py       LangGraph wiring; GRAPH_EDGES is tested against docs/architecture.md
  config.py      every threshold the graph branches on, in one place
  llm.py         the only module that talks to a model; never raises
  mailbox/       drafting, guard and Gmail delivery for student notes
  lms/           mock LMS API shaped like Canvas and Moodle
  routers/       uploads, email, chat, insights
data/            taxonomy (24 mistake patterns), marking schemes, personas, rule-based generator
docs/            architecture, original build plan, hackathon brief, screenshots, design explorations
eval/            evaluate.py and results.md
frontend/        React, Vite, TypeScript, Tailwind, TanStack Query
qb_gateway/      QuantumBlack gateway client; its .env is read automatically
scripts/         build_fixture.py, rebuilds the frontend fixtures from a real run
tests/           pytest, always offline
```

</details>

<details>
<summary><b>Design rules that each have a test</b></summary>

- The agent never sets a mark that counts. Every mark it produces is a draft.
- The backend never reads the answer key.
- Evidence is quoted exactly from the student's answer, or the diagnosis is rejected.
- Language noise never changes the numbers in an answer, and never produces a maths diagnosis.
- The model may propose a plan, but it cannot drop a feedback note, a restart point or a required group re-teach.
- The plan's ranking is checked in code, and anything left out is recorded with a reason.
- The architecture diagram matches the compiled graph.
- No model call can crash a run.
- An override re-plans from the cohort analyst, not from the start.

The full list, with reasons, is in [`AGENTS.md`](AGENTS.md).

</details>

<details>
<summary><b>Divergences from the original plan</b></summary>

[`docs/build-plan.md`](docs/build-plan.md) is the original specification. Four deliberate divergences:

1. **Demo numbers.** The plan had a mistake held by 7 of 12 learners falling to 6 of 12 after an override and dropping below the 40 percent line. 6 of 12 is 50 percent, so that cannot happen. The personas are tuned so it lands on 5 of 12 (42 percent) and falls to 4 of 12 (33 percent).
2. **`backend/llm.py` and `backend/agents/offline_rules.py`** are not in the plan. The first is the single provider boundary, so the fallback is enforced in one place. The second is that fallback, and it is what lets the app run with no API key.
3. **No approval screen and no time budget in the app.** Facilitators asked for one ordered list of things to do and drafted notes to students, not a minutes budget or a confirm-marks table. Both were removed from the interface. Marks stay drafts, and the backend still keeps the approve endpoint and an internal time budget for ranking the plan.
4. **The accent is also the primary action colour.** The navy used for agent activity also marks the primary button. Rust still marks only what the agent handed to a human.

</details>
