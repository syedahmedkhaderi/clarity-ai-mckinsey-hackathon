export * from "./labels";

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Confidence is always a number: 0.85 reads "85% sure". */
export function sure(confidence: number): string {
  return `${pct(confidence)} sure`;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** "1 mark", "14 marks". */
export function marksLabel(n: number): string {
  return `${n} ${n === 1 ? "mark" : "marks"}`;
}

/** Demo tests are A1 to A4, uploaded ones U01 and up. */
/** The demo course's paper names; mirrors DEMO_TEST_NAMES in backend/lms/mock_api.py. */
const DEMO_TEST_NAMES: Record<string, string> = { A1: "Test 1", A2: "Test 2", A3: "Mid-term", A4: "Final" };

export function testLabel(assessmentId: string): string {
  if (DEMO_TEST_NAMES[assessmentId]) return DEMO_TEST_NAMES[assessmentId];
  const demo = /^A(\d+)$/.exec(assessmentId);
  if (demo) return `Test ${Number(demo[1])}`;
  const uploaded = /^U(\d+)$/.exec(assessmentId);
  if (uploaded) return `Uploaded test ${Number(uploaded[1])}`;
  return assessmentId;
}

/** The test a question belongs to: A3Q4 gives A3, U01Q04 gives U01. */
export function assessmentOfQuestion(questionId: string): string {
  return /^(.+?)Q\d+$/.exec(questionId)?.[1] ?? "";
}

/**
 * "Mid-term, Question 4". An uploaded question has no test number to derive a name
 * from, so it reads "Question 4" unless the caller passes the test's own name.
 */
export function questionLabel(questionId: string, testName?: string): string {
  const number = /Q(\d+)$/.exec(questionId)?.[1];
  if (number === undefined) return questionId;
  const question = `Question ${Number(number)}`;
  if (testName) return `${testName}, ${question}`;
  const demo = /^A(\d+)Q\d+$/.exec(questionId);
  return demo ? `${testLabel(`A${demo[1]}`)}, ${question}` : question;
}

/** "Mid-term analysis, 18 Sep". The date is left off when it is not known. */
export function analysisLabel(testName: string, iso?: string): string {
  const date = iso ? shortDate(iso) : "";
  return date ? `${testName} analysis, ${date}` : `${testName} analysis`;
}
