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
import type { BatchResult, Escalation, TraceEvent } from "./types";

const POLL_MS = 400;

export default function App() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewKey>("dashboard");
  const [assessmentId, setAssessmentId] = useState("A3");
  const [minutes, setMinutes] = useState(120);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [status, setStatus] = useState("idle");
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [profiles, setProfiles] = useState<Record<string, never[]>>({});
  const [override, setOverride] = useState<OverrideTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          const p = await fetch(`/api/learner/${l.learner_id}/profile`).then((r) => r.json());
          return [l.learner_id, p.entries] as const;
        }),
      );
      setProfiles(Object.fromEntries(entries));
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
    [qc],
  );

  // Poll the trace while the graph runs so the pipeline animates rather than
  // showing a spinner.
  useEffect(() => {
    if (!batchId || status !== "running") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api.trace(batchId, trace.length);
        if (cancelled) return;
        if (res.events.length) setTrace((prev) => [...prev, ...res.events]);
        if (res.status !== "running") {
          setStatus(res.status);
          await loadBatch(batchId);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };
    const handle = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [batchId, status, trace.length, loadBatch]);

  const run = async () => {
    setError(null);
    setTrace([]);
    setBatch(null);
    setStatus("running");
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
          profiles={profiles as never}
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
