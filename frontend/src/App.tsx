import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api/client";
import { LmsShell, type ViewKey } from "./components/LmsShell";
import { OverrideDialog, type OverrideTarget } from "./components/OverrideDialog";
import { Dashboard } from "./views/Dashboard";
import { LearnerView } from "./views/LearnerView";
import { CohortView } from "./views/CohortView";
import { PlanView } from "./views/PlanView";
import { QueueView } from "./views/QueueView";
import type { BatchResult, Escalation, LearnerProfile, ProfileEntry, TraceEvent } from "./types";

const POLL_MS = 400;

/** Plain-English label for the stage currently running, shown on the button. */
const STAGE_LABEL: Record<string, string> = {
  intake: "Reading the batch",
  marker: "Marking responses",
  diagnostician: "Naming misconceptions",
  cohort_analyst: "Finding cohort patterns",
  planner: "Building your plan",
};
const PIPELINE = ["intake", "marker", "diagnostician", "cohort_analyst", "planner"];

export default function App() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewKey>("dashboard");
  const [assessmentId, setAssessmentId] = useState("A3");
  const [minutes, setMinutes] = useState(120);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [status, setStatus] = useState("idle");
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileEntry[]>>({});
  const [override, setOverride] = useState<OverrideTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const taxonomy = useQuery({ queryKey: ["taxonomy"], queryFn: api.taxonomy });
  const assignments = useQuery({
    queryKey: ["assignments", "C1"],
    queryFn: () => api.assignments("C1"),
  });
  const questions = useQuery({
    queryKey: ["questions", assessmentId],
    queryFn: () => api.questions(assessmentId),
  });

  const threshold = health.data?.thresholds.shared_misconception_share ?? 0.4;

  const loadBatch = useCallback(
    async (id: string) => {
      const result = await api.batch(id);
      setBatch(result);
      const entries = await Promise.all(
        result.learners.map(async (l) => {
          const p = (await fetch(`/api/learner/${l.learner_id}/profile`).then((r) =>
            r.json(),
          )) as LearnerProfile;
          return [l.learner_id, p.entries] as const;
        }),
      );
      setProfiles(Object.fromEntries(entries));
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
    [qc],
  );

  // A visible clock while the run is in flight. Without it a twenty second wait
  // and a hang look exactly the same.
  useEffect(() => {
    if (startedAt === null) return;
    if (status !== "running") {
      setElapsedMs(Date.now() - startedAt);
      return;
    }
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [startedAt, status]);

  // Poll the trace while the graph runs.
  //
  // This loop must never die. The previous version scheduled one timeout per
  // effect run and swallowed failures into state, so a single failed fetch (a
  // backend restart, a dropped request, a batch id the server no longer knows)
  // stopped the polling permanently and the UI sat on "Working" forever with a
  // ticking clock and no events. It reschedules in a finally now, tolerates
  // transient failures, and gives up loudly rather than silently.
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    let since = 0;

    const tick = async () => {
      if (cancelled) return;
      let delay = POLL_MS;
      try {
        const res = await api.trace(batchId, since);
        if (cancelled) return;
        failures = 0;
        if (res.events.length) {
          since = res.total;
          setTrace((prev) => [...prev, ...res.events]);
          setLastEventAt(Date.now());
        }
        if (res.status !== "running") {
          setStatus(res.status);
          await loadBatch(batchId);
          return; // terminal, stop polling
        }
      } catch {
        if (cancelled) return;
        failures += 1;
        if (failures >= 5) {
          setStatus("lost");
          setError(
            "Lost contact with the backend for this run. It may have restarted. " +
              "Your data is safe; start the analysis again.",
          );
          return;
        }
        delay = Math.min(POLL_MS * 2 ** failures, 4000); // back off, keep trying
      } finally {
        if (!cancelled) timer = window.setTimeout(tick, delay);
      }
    };

    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [batchId, loadBatch]);

  const run = async () => {
    setError(null);
    setTrace([]);
    setBatch(null);
    setStatus("running");
    setStartedAt(Date.now());
    setElapsedMs(0);
    setLastEventAt(Date.now());
    try {
      const { batch_id } = await api.runBatch(assessmentId, "C1", minutes);
      setBatchId(batch_id);
    } catch (e) {
      setError(String(e));
      setStatus("failed");
    }
  };

  const applyOverride = async (newValue: string | null, reason: string) => {
    if (!batchId || !override) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.override(batchId, {
        type: override.type,
        target_id:
          override.type === "learner_unavailable"
            ? override.learnerId
            : `${override.learnerId}:${override.questionId}`,
        new_value: newValue,
        reason,
      });
      setBatch(result);
      setTrace(result.trace);
      setOverride(null);
      setView("plan");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const resolveEscalation = async (e: Escalation) => {
    if (!batchId) return;
    await api.resolve(batchId, e.escalation_id, "Facilitator accepted the agent's reading.");
    await loadBatch(batchId);
  };

  const escalationOverride = (e: Escalation) => {
    if (!e.learner_id) return;
    setOverride({
      type: e.question_id ? "diagnosis" : "learner_unavailable",
      learnerId: e.learner_id,
      questionId: e.question_id ?? undefined,
      currentNode: e.candidate_a,
    });
  };

  // The furthest stage that has started but not finished.
  const stage = useMemo(() => {
    const ended = new Set(trace.filter((e) => e.action === "end").map((e) => e.agent));
    const started = trace.map((e) => e.agent);
    const active = PIPELINE.filter((a) => started.includes(a) && !ended.has(a));
    return active.length ? (STAGE_LABEL[active[active.length - 1]] ?? null) : null;
  }, [trace]);

  // A run that has produced nothing for a while is either very slow or wedged.
  // Either way the facilitator should be told and given a way out.
  const stalledMs = status === "running" && lastEventAt ? Date.now() - lastEventAt : 0;

  const cancelRun = () => {
    setStatus("idle");
    setBatchId(null);
    setError(null);
  };

  const openCount = useMemo(
    () => (batch?.escalations ?? []).filter((e) => !e.resolved).length,
    [batch],
  );

  const needsRun = !batch && view !== "dashboard";

  return (
    <LmsShell
      view={view}
      onNavigate={setView}
      queueCount={openCount}
      mode={health.data?.mode ?? ""}
      offline={(health.data?.provider ?? "offline") === "offline"}
    >
      {error && (
        <div className="panel border-flag-line bg-flag-soft px-4 py-3 mb-5">
          <p className="text-sm text-flag">
            Something went wrong talking to the backend: {error}
          </p>
        </div>
      )}

      {view === "dashboard" && (
        <Dashboard
          assignments={assignments.data ?? []}
          selected={assessmentId}
          onSelect={setAssessmentId}
          minutes={minutes}
          onMinutes={setMinutes}
          onRun={run}
          running={status === "running"}
          trace={trace}
          status={status}
          batch={batch}
          health={health.data ?? null}
          stage={stage}
          elapsedMs={elapsedMs}
          stalledMs={stalledMs}
          onCancel={cancelRun}
        />
      )}

      {needsRun && (
        <div className="panel p-8 text-center">
          <p className="text-sm text-ink-muted">
            Run an analysis first. Go to Run and trace, pick an assignment, and start LOOP.
          </p>
          <button className="btn mt-3" onClick={() => setView("dashboard")}>
            Go to Run and trace
          </button>
        </div>
      )}

      {batch && view === "learners" && (
        <LearnerView
          batch={batch}
          taxonomy={taxonomy.data ?? null}
          questions={questions.data ?? []}
          profiles={profiles}
          onOverrideDiagnosis={(learnerId, questionId) =>
            setOverride({
              type: "diagnosis",
              learnerId,
              questionId,
              currentNode:
                batch.diagnoses.find(
                  (d) => d.learner_id === learnerId && d.question_id === questionId,
                )?.taxonomy_node ?? null,
            })
          }
        />
      )}

      {batch && view === "cohort" && (
        <CohortView
          batch={batch}
          taxonomy={taxonomy.data ?? null}
          questions={questions.data ?? []}
          threshold={threshold}
          onOverrideDiagnosis={(learnerId, questionId) =>
            setOverride({
              type: "diagnosis",
              learnerId,
              questionId,
              currentNode:
                batch.diagnoses.find(
                  (d) => d.learner_id === learnerId && d.question_id === questionId,
                )?.taxonomy_node ?? null,
            })
          }
        />
      )}

      {batch && view === "plan" && (
        <PlanView
          batch={batch}
          onApprove={async (learnerId) => {
            if (!batchId) return;
            const ids = batch.marks
              .filter((m) => m.learner_id === learnerId)
              .map((m) => `${m.learner_id}:${m.question_id}`);
            await api.approve(batchId, ids);
            await loadBatch(batchId);
          }}
        />
      )}

      {batch && view === "queue" && (
        <QueueView batch={batch} onResolve={resolveEscalation} onOverride={escalationOverride} />
      )}

      {override && (
        <OverrideDialog
          target={override}
          taxonomy={taxonomy.data ?? null}
          onCancel={() => setOverride(null)}
          onSubmit={applyOverride}
          busy={busy}
        />
      )}
    </LmsShell>
  );
}
