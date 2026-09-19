import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { OverrideTarget } from "../components/OverrideDialog";
import { plainText } from "../lib/plain";
import {
  AI_KEY_REQUIRED_SENTENCE,
  DEFAULT_HIGH_SEVERITY_FLOOR,
  assessmentOfQuestion,
  questionLabel,
  testLabel,
} from "../lib/format";
import type {
  Assignment,
  BatchResult,
  Escalation,
  Health,
  ProfileEntry,
  Question,
  Taxonomy,
  TraceEvent,
} from "../types";

const POLL_MS = 400;

/** Plain-English label for the stage currently running, shown on the button. */
const STAGE_LABEL: Record<string, string> = {
  intake: "Reading the class",
  marker: "Marking the answers",
  diagnostician: "Finding mistakes",
  cohort_analyst: "Building the class picture",
  planner: "Planning what to do next",
};
const PIPELINE = ["intake", "marker", "diagnostician", "cohort_analyst", "planner"];

// The planner still fits a fixed budget in code, but the teacher no longer sets
// it. The plan page lists everything in priority order instead of a time box.
const PLANNER_MINUTES = 120;

/**
 * Escalations raised only because an action fell outside the planner's budget
 * are dropped here, so no page mentions a time box the teacher cannot see.
 */
function withoutBudgetEscalations(result: BatchResult): BatchResult {
  return {
    ...result,
    escalations: result.escalations.filter((e) => e.reason_code !== "BUDGET_OVERFLOW"),
  };
}

export interface Session {
  health: Health | null;
  tests: Assignment[];
  selectedTest: string;
  setSelectedTest: (id: string) => void;
  batch: BatchResult | null;
  batchId: string | null;
  /** The screen is showing the seeded example, not a run the teacher started. */
  preloaded: boolean;
  trace: TraceEvent[];
  status: string;
  running: boolean;
  /** The stage in flight, in words, or null between stages. */
  stage: string | null;
  elapsedMs: number;
  /** Time since the last trace event arrived, while running. Zero when not running. */
  stalledMs: number;
  run: () => Promise<void>;
  /** Gives up on a run that will not finish and clears the "Working" state. */
  cancelRun: () => void;

  resolve: (escalationId: string) => Promise<void>;

  profiles: Record<string, ProfileEntry[]>;
  taxonomy: Taxonomy | null;
  questions: Question[];

  overrideTarget: OverrideTarget | null;
  setOverrideTarget: (t: OverrideTarget | null) => void;
  overrideBusy: boolean;
  /** Returns true when the override went through, so the caller can move on. */
  applyOverride: (newValue: string | null, reason: string) => Promise<boolean>;
  overrideDiagnosis: (learnerId: string, questionId: string) => void;
  overrideEscalation: (e: Escalation) => void;

  runBlockedReason: (a: Assignment) => string | null;
  /** Escalations still waiting for the teacher. */
  openCount: number;
  sharedThreshold: number;
  highSeverityFloor: number;

  /** Lookups that turn ids into words. Each falls back to the id itself. */
  testName: (assessmentId: string) => string;
  questionName: (questionId: string) => string;
  patternName: (nodeId: string | null | undefined) => string;
  topicName: (topicId: string) => string;
  learnerName: (learnerId: string) => string;
  /** Rewrites ids and old jargon inside backend-written text into plain words. */
  plain: (text: string | null | undefined) => string;

  error: string | null;
  clearError: () => void;
}

const SessionContext = createContext<Session | null>(null);

function describe(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return `Something went wrong talking to the server. ${String(e)}`;
}

/** Every course's tests in one list, with the demo class first. */
async function loadTests(): Promise<Assignment[]> {
  const ids = await api
    .courses()
    .then((courses) => courses.map((c) => c.id))
    .catch(() => ["C1"]);
  const lists = await Promise.all(ids.map((id) => api.assignments(id).catch(() => [])));
  const seen = new Map<string, Assignment>();
  for (const a of lists.flat()) if (!seen.has(a.id)) seen.set(a.id, a);
  return [...seen.values()];
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [selectedTest, setSelectedTest] = useState("A3");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [status, setStatus] = useState("idle");
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ProfileEntry[]>>({});
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget | null>(null);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  /** True while the screen is showing the seeded example rather than a run the
   *  teacher started. The UI says so, so nobody mistakes it for their own data. */
  const [preloaded, setPreloaded] = useState(false);

  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const taxonomy = useQuery({ queryKey: ["taxonomy"], queryFn: api.taxonomy });
  const tests = useQuery({ queryKey: ["tests"], queryFn: loadTests });
  // Once a run exists the questions belong to that run's test, not to whatever
  // the picker has moved on to since.
  const questionsFor = batch?.assessment_id ?? selectedTest;
  const questions = useQuery({
    queryKey: ["questions", questionsFor],
    queryFn: () => api.questions(questionsFor),
  });

  const loadBatch = useCallback(
    async (id: string) => {
      const result = withoutBudgetEscalations(await api.batch(id));
      setBatch(result);
      const entries = await Promise.all(
        result.learners.map(async (l) => {
          const p = await api.profile(l.learner_id);
          return [l.learner_id, p.entries] as const;
        }),
      );
      setProfiles(Object.fromEntries(entries));
      qc.invalidateQueries({ queryKey: ["tests"] });
    },
    [qc],
  );

  // Open on a worked example rather than an empty shell. The backend seeds a
  // finished analysis at startup, so there is normally one waiting. This only
  // ever fills an empty session: once the teacher starts their own run, that run
  // owns the screen.
  useEffect(() => {
    let cancelled = false;
    if (batchId || batch) return;
    (async () => {
      try {
        const latest = await api.latestBatch();
        if (cancelled || !latest?.batch_id) return;
        setBatch(withoutBudgetEscalations(latest));
        setBatchId(latest.batch_id);
        setTrace(latest.trace ?? []);
        setStatus(latest.status ?? "complete");
        setPreloaded(true);
        const entries = await Promise.all(
          latest.learners.map(async (l) => {
            const prof = await api.profile(l.learner_id);
            return [l.learner_id, prof.entries] as const;
          }),
        );
        if (!cancelled) setProfiles(Object.fromEntries(entries));
      } catch {
        // No finished run yet. The empty state and the Run button are correct.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Deliberately once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Poll the trace while the graph runs so the pipeline animates rather than
  // showing a spinner.
  //
  // This loop must never die. An earlier version scheduled one timeout per
  // effect run and swallowed failures into state, so a single failed fetch (a
  // backend restart, a dropped request, a batch id the server no longer knows)
  // stopped polling permanently and the screen sat on "Working" forever with a
  // ticking clock and no events. It reschedules in a finally now, tolerates
  // transient failures with backoff, and gives up loudly after five in a row
  // rather than silently.
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
            "Lost contact with the server for this run. It may have restarted. " +
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

  const testList = tests.data ?? [];
  const healthData = health.data ?? null;
  const taxonomyData = taxonomy.data ?? null;

  const runBlockedReason = useCallback(
    (a: Assignment): string | null =>
      a.source === "uploaded" && healthData && !healthData.ai_available
        ? AI_KEY_REQUIRED_SENTENCE
        : null,
    [healthData],
  );

  const run = async () => {
    const test = testList.find((t) => t.id === selectedTest);
    const blocked = test ? runBlockedReason(test) : null;
    if (blocked) {
      setError(blocked);
      return;
    }
    setError(null);
    setTrace([]);
    setBatch(null);
    setStatus("running");
    setPreloaded(false);
    setStartedAt(Date.now());
    setElapsedMs(0);
    setLastEventAt(Date.now());
    try {
      const { batch_id } = await api.runBatch(selectedTest, test?.class_id ?? "C1", PLANNER_MINUTES);
      setBatchId(batch_id);
    } catch (e) {
      setError(describe(e));
      setStatus("failed");
    }
  };

  // A run that has produced nothing for a while is either very slow or wedged.
  // Either way the teacher should be told and given a way out.
  const stalledMs = status === "running" && lastEventAt ? Date.now() - lastEventAt : 0;

  const cancelRun = () => {
    setStatus("idle");
    setBatchId(null);
    setError(null);
  };

  const resolve = async (escalationId: string) => {
    if (!batchId) return;
    try {
      await api.resolve(batchId, escalationId, "Teacher accepted the system's reading.");
      await loadBatch(batchId);
    } catch (e) {
      setError(describe(e));
    }
  };

  const applyOverride = async (newValue: string | null, reason: string): Promise<boolean> => {
    if (!batchId || !overrideTarget) return false;
    setOverrideBusy(true);
    setError(null);
    try {
      const result = await api.override(batchId, {
        type: overrideTarget.type,
        target_id:
          overrideTarget.type === "learner_unavailable"
            ? overrideTarget.learnerId
            : `${overrideTarget.learnerId}:${overrideTarget.questionId}`,
        new_value: newValue,
        reason,
      });
      setBatch(withoutBudgetEscalations(result));
      setTrace(result.trace);
      setOverrideTarget(null);
      return true;
    } catch (e) {
      setError(describe(e));
      return false;
    } finally {
      setOverrideBusy(false);
    }
  };

  const learnerName = (learnerId: string) =>
    batch?.learners.find((l) => l.learner_id === learnerId)?.learner_name ?? learnerId;

  const overrideDiagnosis = (learnerId: string, questionId: string) =>
    setOverrideTarget({
      type: "diagnosis",
      learnerId,
      learnerName: learnerName(learnerId),
      questionId,
      currentNode:
        batch?.diagnoses.find((d) => d.learner_id === learnerId && d.question_id === questionId)
          ?.taxonomy_node ?? null,
    });

  const overrideEscalation = (e: Escalation) => {
    if (!e.learner_id) return;
    setOverrideTarget({
      type: e.question_id ? "diagnosis" : "learner_unavailable",
      learnerId: e.learner_id,
      learnerName: learnerName(e.learner_id),
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

  const openCount = useMemo(
    () => (batch?.escalations ?? []).filter((e) => !e.resolved).length,
    [batch],
  );

  const testName = (assessmentId: string) =>
    testList.find((t) => t.id === assessmentId)?.display_name ?? testLabel(assessmentId);

  const questionName = (questionId: string) =>
    questionLabel(questionId, testName(assessmentOfQuestion(questionId)) || undefined);
  const patternName = (nodeId: string | null | undefined) =>
    nodeId ? (taxonomyData?.nodes.find((n) => n.id === nodeId)?.label ?? nodeId) : "";

  const value: Session = {
    health: healthData,
    tests: testList,
    selectedTest,
    setSelectedTest,
    batch,
    batchId,
    preloaded,
    trace,
    status,
    running: status === "running",
    stage,
    elapsedMs,
    stalledMs,
    run,
    cancelRun,
    resolve,
    profiles,
    taxonomy: taxonomyData,
    questions: questions.data ?? [],
    overrideTarget,
    setOverrideTarget,
    overrideBusy,
    applyOverride,
    overrideDiagnosis,
    overrideEscalation,
    runBlockedReason,
    openCount,
    sharedThreshold: healthData?.thresholds.shared_misconception_share ?? 0.4,
    highSeverityFloor: healthData?.thresholds.high_severity_floor ?? DEFAULT_HIGH_SEVERITY_FLOOR,
    testName,
    questionName,
    patternName,
    topicName: (topicId) => taxonomyData?.topics.find((t) => t.id === topicId)?.label ?? topicId,
    learnerName,
    plain: (text) => plainText(text, { patternName, learnerName, questionName, testName }),
    error,
    clearError: () => setError(null),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
