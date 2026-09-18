/** Words and limits for the Add a test flow. Kept together so the sentences can be read in one place. */

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const DEFAULT_CLASS_NAME = "My class";

export const AI_KEY_NOTICE =
  "Your test will be saved. Analysing it needs an AI key, so it cannot run yet.";

export const STEPS = [
  { id: 1, label: "Add the test" },
  { id: 2, label: "Add the answers" },
  { id: 3, label: "Check" },
  { id: 4, label: "Save" },
] as const;

/** Extensions each drop zone accepts. */
export const PAPER_EXTENSIONS = [".csv", ".json"];
export const SHEET_EXTENSIONS = [".csv", ".txt", ".md"];

export const PAPER_ACCEPT_PHRASE = "a CSV or JSON file";
export const SHEET_ACCEPT_PHRASE = "a CSV file, or plain text files (TXT or MD)";

/** The demo class. Uploaded classes are every other class. */
export const DEMO_CLASS_ID = "C1";
