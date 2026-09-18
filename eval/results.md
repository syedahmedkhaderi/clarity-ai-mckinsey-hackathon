# LOOP evaluation results

## Read this before quoting any number below

This run was made in **offline mode**, with no `OPENAI_API_KEY` set. In offline
mode the marker and the diagnostician are deterministic rule engines, and those
rules encode the same mathematics that `data/generator.py` used to inject the
errors in the first place. A recovery rate measured this way is a check that the
pipeline is wired correctly end to end. It is not a measurement of model
quality, and it must not be quoted as one.

To measure anything about model quality, set `OPENAI_API_KEY` and run this
script again. The mode used is recorded in the table below, so a reader can
always tell which kind of number they are looking at.


Assessment scored: **A3**. Mode: **offline deterministic rules**. Ground truth: `data/ground_truth.json`, read by this script only.

## Metrics

| Metric | Result | Definition |
|---|---|---|
| Misconception recovery rate | 96.0% (24 of 25) | Diagnosed node equals the injected node, over every injected misconception. An item the reviewer escalated counts as not recovered |
| Recovery before the reviewer gate | 100.0% (25 of 25) | The same comparison against what the diagnostician reached, escalated items included |
| Top-2 recovery rate | 96.0% (24 of 25) | Injected node is the chosen node or the runner-up |
| Escalation precision | 0.0% (0 of 4) | Of the diagnoses the reviewer held back, the share that would have been wrong |
| Recovery, second-language learners | 83.3% (5 of 6) | Same metric, restricted to learners whose written answers carry grammatical noise |
| Recovery, second-language, before the gate | 100.0% (6 of 6) | The same group scored on what the diagnostician reached, escalated items included |
| Recovery, everyone else | 100.0% (19 of 19) | Same metric, all other learners |
| Language separation gap | +16.7% | Everyone else minus second-language. A large positive gap is the failure mode |
| Returner handling | 100.0% (3 of 3) | Returners for whom the plan produced a restart point, scheduled or dropped |
| Returner restart points scheduled | 33.3% (1 of 3) | The subset that survived the time budget |
| Evidence span validity | 100.0% (28 of 28) | Diagnoses whose evidence span is verbatim text from the learner's own answer |
| Diagnosis coverage | 96.0% (24 of 25) | Injected misconceptions that received a surviving diagnosis rather than an escalation |

## Language separation

**The headline gap is +16.7%, but none of it is misdiagnosis.** Of the 1 second-language case not recovered, 1 was diagnosed correctly and then held at the reviewer gate as a language barrier, and 0 were genuinely misdiagnosed. Holding a language case back from the cohort picture is the intended behaviour, so read this gap as the reviewer gate working, not as the diagnostician failing. The number to watch for regression is recovery before the gate: 100.0% (6 of 6) against 100.0% (19 of 19).

## Run totals

| Quantity | Value |
|---|---|
| Responses | 96 |
| Marks surviving | 96 |
| Lost marks | 32 |
| Injected misconceptions | 25 |
| Diagnoses | 28 |
| Escalations | 7 |
| Correct diagnoses held at the reviewer gate | 1 |
| Minutes used | 120 |
| Budget minutes | 120 |
| Actions scheduled | 7 |
| Actions dropped | 25 |

## Escalations by reason code

| Reason code | Count |
|---|---|
| AMBIGUOUS_DIAGNOSIS | 3 |
| BUDGET_OVERFLOW | 3 |
| LANGUAGE_BARRIER | 1 |

Escalation precision is scored over diagnosis escalations only. LOW_MARK_CONFIDENCE, SPARSE_HISTORY and BUDGET_OVERFLOW are not claims about a misconception, so ground truth has nothing to say about them.

Escalation precision at 0.0% (0 of 4) means the reviewer is cautious: most of what it held back would not in fact have been wrong. That is the intended bias for a system where a human approves every mark, but it is a cost in facilitator time and it is the number to watch if the queue gets long.
