# McKinsey x QuantumBlack Qatar AI Hackathon - Full Brief (Extracted from Official Deck)

Source: QuantumBlack (AI by McKinsey) participant deck, slides 1-11, photographed 18 Sep 2026.
Event: 18-19 September 2026, Marjan Ballroom, Swissotel Corniche Park Towers, Doha.
Purpose of this file: single source of truth for scoping, building, and pitching the project.

## 1. Framing: Your Team Is a CST

Each team acts as a **Client Service Team (CST) within McKinsey** and must:

**A. Answer one of the three business problems our client has, and bring concrete value.**
Client: **Orion Global Group** - a multinational enterprise with global operations, large technology teams, and complex internal processes, actively investing in AI to drive efficiency and quality of outcomes.

**B. Design an agentic AI solution** that can independently reason about a problem, make decisions under uncertainty, and take purposeful actions toward a defined objective, rather than simply generating outputs.

**C. Have a user interface and satisfactory UX** that allows users to access it and leverage it.

Key implication: this is not a chatbot competition. Autonomy, decision-making, and action-taking are the differentiators. A system that only answers questions is explicitly called out as insufficient.

## 2. The Three Client Themes

Three themes, three clients. Pick one.

| Theme | Client | Core tension |
|---|---|---|
| Health & medical operations | Qatar National Health Authority | Demand rising faster than headcount; information scattered across systems that do not talk to each other |
| Education | Meridian Foundation (non-profit, community learning) | ~60,000 learners/year at different levels, second language, taught by community facilitators not specialists; records incomplete and interrupted |
| Travel & Flights | Doha Stopover Challenge | 54.3m passenger movements through Hamad International in 2025, yet travelers lack joined-up support when deciding to take a stopover or leave the airport |

Summary of what each theme expects the agent to do:

- **Health**: retrieve the right record, reason over it, decide or recommend an action, explain itself, and escalate to a clinician or reviewer when the stakes require it.
- **Education**: work out where a learner is, decide the next useful step, explain its reasoning, and pull in a facilitator instead of acting alone.
- **Travel**: own one narrow decision under real constraints, produce a recommendation with its reasoning, and re-plan safely when an input changes.

Common shape across all three: **retrieve -> reason -> decide -> explain -> escalate/re-plan**. Build to that spine regardless of theme.

## 3. Theme Deep Dives

### 3.1 Health & Medical Operations - Qatar National Health Authority

**Context**
- The Authority sets health policy, regulates professionals and facilities, and oversees public hospitals and clinics serving a multilingual mix of citizens and a large expatriate workforce.
- It is under real strain. Demand is rising faster than headcount, and the information needed to decide is scattered across systems that do not talk to each other. Adding staff will not close the gap fast enough. The answer is getting the right information to the right person that has to decide.

**Potential use cases (pick one)**

1. **AI scribe**
   - Problem: clinicians spend consultation time on documentation, and the diagnostic coding and follow-up booking are each handled separately after the fact.
   - The agent: a voice or text agent that listens to the consultation, writes the free text, assigns the diagnostic coding and schedules the next appointment.
   - Measure: documentation minutes per consultation; coding accuracy; clinician sign-off without edit.

2. **Hospital CEO digital twin**
   - Problem: leadership changes clinic hours or appointment slots without seeing what it does to waiting times and capacity elsewhere in the hospital. This applies to other decisions across the hospital.
   - The agent: simulates a proposed change across all appointment slots and shows the ripple effect on waiting times, downstream capacity and staffing before it is committed.
   - Measure: waiting time moved vs predicted; scheduling decisions taken on simulation.

3. **Care plan generator**
   - Problem: care plans vary by clinician and rarely reflect the individual patient beyond the presenting condition.
   - The agent: builds a plan grounded in clinical best practice, then personalizes it to the patient, with genomic and personal tailoring as the next level.
   - Measure: adherence to guideline; clinician acceptance without edit.

4. **Patient voice agent**
   - Problem: patients call in high volumes with routine questions in many languages. Staff are overwhelmed and wait times are long.
   - The agent: resolves routine inquiries end-to-end in the caller's language and hands off cleanly when the query needs medical judgment or it is unsure. Never gives medical advice.
   - Measure: calls resolved without a human, with satisfaction held; wait time; languages covered.

**Target business problem to solve**
Close the gap between rising demand and fixed headcount by putting a reasoning agent at the point of decision, so clinicians, investigators, reviewers and executives act on complete information, faster, with the reasoning visible, the source cited, and a human still accountable for anything clinical, regulatory or privacy-sensitive.

### 3.2 Education - Meridian Foundation

**Context**
- Meridian runs community learning centers and school partnerships, reaching about 60,000 learners a year.
- Many learners have missed school and many study in a language that is not their first. **Most teaching is done by community facilitators, not specialist teachers.** Records are incomplete, and people leave and return.
- The Foundation has funding for AI and wants agents that help real people decide and act, not another chatbot that only answers questions.

**Potential use cases (pick one)**

1. **Personalized learning coach**
   - Problem: learners in the same room are not at the same level. Age does not tell you what they can do, and a plan written at the start of term does not survive weeks away.
   - The agent: works out where one learner actually is, helps them take a useful next step, and coaches without handing over the answer. Says when it is unsure and brings in a facilitator.
   - Measure: catch-up progress; time spent at the right level; fewer give-away answers.

2. **Marks & answer-sheet analysis**
   - Problem: marking eats facilitator time and feedback returns late. A marks sheet shows who scored what, not why - the same mistake can sit across a whole group unnoticed.
   - The agent: marks against a scheme, flags likely mistake patterns for the individual and the group, and drafts feedback. A facilitator decides any mark that counts.
   - Measure: time to return work; feedback actually used; errors named early enough to reteach.

3. **Peer knowledge sharing**
   - Problem: learners already help each other, but it is luck - who sits next to whom. The same few always help, and someone who can do the task may explain it badly.
   - The agent: decides who should work with whom, on what, and how the explainer is supported so they teach rather than hand over the answer.
   - Measure: useful sessions completed; both sides learning; more even participation.

4. **Return & continuity agent**
   - Problem: learners leave and return, and records are incomplete. A facilitator restarting someone after weeks away is guessing at what they retained.
   - The agent: reconstructs a returning learner's position from patchy records, decides where to restart them, and tells the facilitator what it inferred and how confident it is.
   - Measure: time to reinstate a returner; accuracy of the restart point; drop-off after return.

**Target business problem to solve**
One facilitator cannot diagnose, stretch and give feedback to a room of learners sitting at very different levels, so learners work at the wrong level and feedback arrives too late to change anything. The agent should convert scarce facilitator time into targeted time: decide who needs what next, act on it, explain why, and escalate rather than guess.

### 3.3 Travel & Flights - Doha Stopover Challenge (airline & airport)

**Context**
- Hamad International handled 54.3m passenger movements in 2025; 13.5m were journeys to or from Doha. Qatar welcomed 5.1m international visitors and aims for 6m a year by 2030.
- Stopover services already exist - transit accommodation, packaged stopovers, fare comparison. **The problem is not the absence of offers.** Travelers still lack joined-up support at the moment they decide whether to choose a stopover, leave the airport, use limited time in Doha, or return for a longer visit.

**Potential use cases (pick one)**

1. **Choose the right connection**
   - Problem: before booking, a passenger compares flights on fare and duration alone. A longer Doha connection looks inconvenient even when it could support a useful mini-visit.
   - The agent: compares mock flight options, calculates genuinely usable time, proposes a feasible experience and ranks the options by total passenger value.
   - Measure: stopover selection; booking conversion; fare yield or ancillary revenue.

2. **Should I leave the airport?**
   - Problem: a passenger with a Doha connection cannot judge how much city time is left after entry, queues, baggage, transport and the airport-return buffer.
   - The agent: returns go / verification required / stay airside, with a safe return deadline and the reasoning behind it.
   - Measure: safe city visits; passenger confidence; missed flights or support demand.

3. **I'm in Doha - what now?**
   - Problem: maps and generic travel assistants ignore the flight deadline, the heat, opening hours, travel time and budget.
   - The agent: builds a feasible, personalized mini-itinerary and re-plans when an attraction closes, an activity is skipped or the available time changes.
   - Measure: visitor spend; attractions visited; on-time airport returns; satisfaction.

4. **Convert a short stop into a future visit**
   - Problem: a positive half-day stopover rarely leads to a longer Qatar visit, and generic follow-up messages read as spam.
   - The agent: uses stopover history and traveler preferences to select a relevant future trip or offer and decides whether and when to make contact.
   - Measure: return visits; qualified leads; future bookings or lifetime value.

**Target business problem to solve**
Turn a connection into a visit, and a visit into a return, **without ever putting a passenger at risk of missing a flight**. The agent should own one narrow decision at one moment, apply real logic to mock data, explain the recommendation, handle the infeasible or uncertain case safely, and change its answer when an input changes.

## 4. Project Selection Rules

- Teams get 10 minutes to discuss which project they would like to work on, based on interests and strengths.
- Each project can be assigned to a **maximum of three teams**.
- If more than three teams select the same project, the organizers outline a selection approach.

## 5. Required Outputs (2 deliverables)

### 5.1 Functional Agentic AI Solution - 4 main requirements
1. Development code / notebook repo
2. User interface
3. Agentic architecture
4. Mock data (if applicable)

Also required by the pre-event brief: working front-end, working back-end (server-side logic, APIs, data processing), meaningful integration of AI/GenAI, code hosted on GitHub so it can be shared and reviewed.

### 5.2 Pitch and Demonstration - 10 minutes total (template to be provided)
- **Problem statement (1-2 min)**
  - What is the business theme?
  - What is the pain point / opportunity you are solving?
  - What is the business value / impact?
- **Solution concept (2-3 min)**
  - What does your agentic solution do?
  - What is the high level architecture?
- **Live demo (5-7 min)**
  - End-to-end walkthrough of the AI agent
  - Example workflow or use case (problem -> AI action -> outcome)
  - Technical differentiators (multi-agent setup, reasoning, integrations)
- **Q&A**

Note: the pitch-prep slide also specifies a max 5-slide deck and a pitch that stays within 5 minutes for the internal rehearsal timebox. Build the deck to 5 slides, rehearse to 5 minutes of speech, and let the demo fill the rest of the 10.

## 6. Judging Criteria (4 criteria, full checklists)

### Problem Understanding, Framing & Innovation
- Clarity of the client problem and pain point
- Depth of analysis and quality of assumptions under ambiguity
- How well the solution is scoped to a realistic client context
- Innovativeness of the idea and approach
- Clear articulation of the goal the solution is working toward

### Agentic AI Solution Design
- Degree of autonomy (planning, decision-making, action-taking)
- Soundness of the agent architecture and reasoning flow
- Handling of ambiguity, trade-offs, and edge cases
- Explainability and transparency of agent decisions
- Code quality and structure

### UI / UX Quality & Usability
- Clarity and simplicity of the user interface
- Ease of interaction and navigation
- Visual quality and professional look & feel
- How well the UI articulates the interactions of the agents

### Presentation Day Pitch
- **Storytelling & structure**: clear narrative, problem -> solution -> impact
- **Demo execution**: live demo runs smoothly, shows real capabilities
- **Presentation**: presenter engagement and communication

Design implication: every criterion above should map to something visible. Autonomy, reasoning traces, edge-case handling and escalation must be *shown in the UI*, not just claimed on a slide.

## 7. Prescribed Timebox (9 hours of build across 2 days)

| Block | Hours | Activity |
|---|---|---|
| A. Design & Architecture | 0 - 1.5 (1.5 hr) | Map out system workflow. Identify components: input data, Agents, Teams, orchestration, outputs. Define success metrics & basic evaluation plan. Rough UI/UX sketches. Assign tasks to team members. **Deliverable: quick architecture diagram or whiteboard sketch** |
| B. Development Sprint | 1.5 - 5 (3.5 hr) | Core coding phase (split tasks among team). Build working prototype with UI (focus on minimum viable demo, not polish). **Goal: end-to-end flow working, even if rough** |
| C. Testing & Iteration | 5 - 7 (2 hr) | Run example scenarios through the solution. Debug, refine prompts/logic/flows. Validate the agent behaves as intended (autonomy, reasoning, recovery from errors). Improve UI/UX for demo clarity. **Goal: stable demo path (happy flow)** |
| D. Pitch Preparation | 7 - 8.5 (1.5 hr) | Build a 10-minute pitch deck (max 5 slides): problem statement, solution concept, demo, Q&A. Rehearse 1-2 times (timebox practice) |
| E. Final Touch & Submission | 8.5 - 9 (30 min) | Final integration tweaks. Upload code/demo link. Ensure pitch is within 5 min, Q&A ready |

Organizer tip: leverage the first day's evening to develop and test.

## 8. Agile Principle Applied to the Build

Slide 2.A uses the classic skateboard-to-car analogy. The instruction is explicit: do **not** build wheel -> chassis -> body -> car (nothing usable until the end). Build skateboard -> scooter -> bike -> motorbike -> car (something usable at every step).

Key takeaways as stated:
- Highest priority is to satisfy the customer through early and continuous delivery of a valuable solution
- Deliver working solution frequently
- Feedback is gathered at the end of each iteration and used to apply changes to the product
- Working solution is the primary measure of progress

Practical rule for this hackathon: have a demoable end-to-end path by hour 5, then improve it. Never have a half-built system that only works if all pieces land.

## 9. Suggested Technology Stack

**Agentic AI libraries (suggested tools)**
- LangChain
- OpenAI Agents SDK
- Microsoft AutoGen
- CrewAI
- LangGraph
- n8n

**UI frameworks (suggested tools)**
- shadcn/ui
- Streamlit
- Gradio
- CopilotKit

You are free to use whatever stack you are most comfortable with. The list above is a suggestion, not a constraint.

Pre-arrival setup expected: code editor/IDE configured, working Git (commit, branch, push), active GitHub account, chosen languages/frameworks/libraries/dependencies installed and tested locally, presentation tool ready.

## 10. Checklist: What Every Idea of Ours Must Have

Use this as the go/no-go filter before committing to an idea.

**Problem side**
- [ ] Names one specific client pain point, not a theme
- [ ] States the business value in a measurable unit (time, cost, conversion, safety, coverage)
- [ ] Lists the assumptions we are making under ambiguity, explicitly
- [ ] Scoped narrow enough to be real in 9 hours

**Agent side**
- [ ] The agent **decides** something, it does not just answer
- [ ] There is a planning step (it breaks the goal into steps on its own)
- [ ] There is an action step (it does something: schedules, routes, re-plans, drafts, assigns)
- [ ] It handles at least one ambiguous or infeasible case safely
- [ ] It re-plans when an input changes
- [ ] It knows when it is unsure and **escalates to a human**
- [ ] Every decision has a visible reason and a cited source
- [ ] A human remains accountable for anything clinical, regulatory, privacy-sensitive, or safety-critical

**Architecture side**
- [ ] Input data defined (mock data is fine and expected)
- [ ] Agents and their roles defined; multi-agent setup if it earns its place
- [ ] Orchestration layer defined (who calls whom, in what order, with what state)
- [ ] Outputs defined
- [ ] Success metrics and a basic evaluation plan defined
- [ ] One architecture diagram exists and matches what the code actually does

**Product side**
- [ ] Working front-end
- [ ] Working back-end (APIs, data flow)
- [ ] Front-end and back-end actually connected
- [ ] UI makes the agent interactions legible (shows reasoning, confidence, escalation)
- [ ] Clean, simple, professional look and feel
- [ ] Code on GitHub

**Pitch side**
- [ ] 5 slides max
- [ ] Narrative: problem -> solution -> impact
- [ ] Live demo has a rehearsed happy path that has been run end-to-end more than once
- [ ] Technical differentiators named out loud (multi-agent setup, reasoning, integrations)
- [ ] Q&A answers prepared for: feasibility, limitations, what is mock vs real, why this architecture, what breaks at scale

## 11. Notes on Gaps

- The deck section numbered "3" was not captured in the photographs; slides 1-11 cover sections 1, 1.A-1.D, 2, 2.A, 4, 4.A, 5 and 6.
- The 10-minute pitch template is to be provided by organizers; substitute it when received.
