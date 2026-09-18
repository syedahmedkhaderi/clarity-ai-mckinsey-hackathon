/**
 * Display-time rewrite for text the backend writes (reasons, plan titles, notes,
 * trace lines). It only swaps internal ids and old jargon for the words a
 * teacher sees elsewhere. It never changes what the backend stored or sent.
 */
export interface PlainLookups {
  patternName: (nodeId: string) => string;
  learnerName: (learnerId: string) => string;
  questionName: (questionId: string) => string;
  testName: (assessmentId: string) => string;
}

const WORDS: [RegExp, string][] = [
  [/\bmisconceptions\b/gi, "mistake patterns"],
  [/\bmisconception\b/gi, "mistake pattern"],
  [/\bfacilitators\b/gi, "teachers"],
  [/\bfacilitator\b/gi, "teacher"],
  [/\blearners\b/gi, "students"],
  [/\blearner\b/gi, "student"],
  [/\bcohort\b/gi, "class"],
  [/\bprovisional\b/gi, "draft"],
  [/\bthe agent\b/gi, "the system"],
];

function keepCase(replacement: string, original: string): string {
  const first = original.charAt(0);
  return first === first.toUpperCase() && first !== first.toLowerCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

export function plainText(text: string | null | undefined, lookups: PlainLookups): string {
  if (!text) return "";
  let out = text.replace(/\s*\(\s*M\d{2}\s*\)/g, "");
  out = out.replace(/\bReteach\b/g, "Re-teach").replace(/\breteach\b/g, "re-teach");
  out = out.replace(/\b(?:[A-Z]\d{1,2}|U\d{2})Q\d{1,2}\b/g, (id) => lookups.questionName(id));
  out = out.replace(/\bM\d{2}\b/g, (id) => lookups.patternName(id));
  out = out.replace(/\b(?:L\d{2}|C\d{2}-S\d{2})\b/g, (id) => lookups.learnerName(id));
  out = out.replace(/\b(?:A[1-9]|U\d{2})\b/g, (id) => lookups.testName(id));
  for (const [pattern, replacement] of WORDS) {
    out = out.replace(pattern, (match) => keepCase(replacement, match));
  }
  return out;
}
