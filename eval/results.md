# LOOP evaluation results

## Mode

This run used the model path (`OPENAI_API_KEY` was set), so the recovery numbers
below reflect the diagnostician's prompt and the model behind it. The errors
being recovered were injected by deterministic Python rules in
`data/generator.py`, never by a language model, so the measurement is not
self-graded.


Assessment scored: **A3**. Mode: **model**. Ground truth: `data/ground_truth.json`, read by this script only.

## Metrics

| Metric | Result | Definition |
|---|---|---|
| Misconception recovery rate | 92.0% (23 of 25) | Diagnosed node equals the injected node, over every injected misconception. An item the reviewer escalated counts as not recovered |
| Recovery before the reviewer gate | 96.0% (24 of 25) | The same comparison against what the diagnostician reached, escalated items included |
| Top-2 recovery rate | 96.0% (24 of 25) | Injected node is the chosen node or the runner-up |
| Escalation precision | 66.7% (2 of 3) | Of the diagnoses the reviewer held back, the share that would have been wrong |
| Recovery, second-language learners | 83.3% (5 of 6) | Same metric, restricted to learners whose written answers carry grammatical noise |
| Recovery, second-language, before the gate | 100.0% (6 of 6) | The same group scored on what the diagnostician reached, escalated items included |
| Recovery, everyone else | 94.7% (18 of 19) | Same metric, all other learners |
| Language separation gap | +11.4% | Everyone else minus second-language. A large positive gap is the failure mode |
| Returner handling | 100.0% (3 of 3) | Returners for whom the plan produced a restart point, scheduled or dropped |
| Returner restart points scheduled | 100.0% (3 of 3) | The subset that survived the time budget |
| Evidence span validity | 100.0% (31 of 31) | Diagnoses whose evidence span is verbatim text from the learner's own answer |
| Diagnosis coverage | 96.0% (24 of 25) | Injected misconceptions that received a surviving diagnosis rather than an escalation |

## Language separation

A gap of +11.4% is small. Language noise is not, on this run, being read as conceptual weakness. That is the behaviour the fixture exists to protect. Of the 1 second-language case not recovered, 1 was diagnosed correctly and then held at the reviewer gate as a language barrier, and 0 were genuinely misdiagnosed.

## Run totals

| Quantity | Value |
|---|---|
| Responses | 96 |
| Marks surviving | 96 |
| Lost marks | 34 |
| Injected misconceptions | 25 |
| Diagnoses | 31 |
| Escalations | 3 |
| Correct diagnoses held at the reviewer gate | 1 |
| Minutes used | 120 |
| Budget minutes | 120 |
| Actions scheduled | 8 |
| Actions dropped | 13 |

## Escalations by reason code

| Reason code | Count |
|---|---|
| LANGUAGE_BARRIER | 3 |

Escalation precision is scored over diagnosis escalations only. LOW_MARK_CONFIDENCE, SPARSE_HISTORY and BUDGET_OVERFLOW are not claims about a misconception, so ground truth has nothing to say about them.

Escalation precision at 66.7% (2 of 3) means the reviewer is cautious: most of what it held back would not in fact have been wrong. That is the intended bias for a system where a human approves every mark, but it is a cost in facilitator time and it is the number to watch if the queue gets long.
