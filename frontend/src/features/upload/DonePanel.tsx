import { useAppView } from "../../hooks/useAppView";
import { useSession } from "../../hooks/useSession";
import type { SavedTest } from "../../types/upload";

/** Shown after a test is saved. It says what happens next and never leaves the teacher guessing. */
export function DonePanel({ saved, onAnother }: { saved: SavedTest; onAnother: () => void }) {
  const { setView } = useAppView();
  const { health } = useSession();
  const blocked = saved.run_blocked_reason !== null || health?.ai_available === false;
  return (
    <div className="panel p-6">
      <h2 className="text-sm font-semibold text-ink">Your test is saved</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {saved.name} is ready on Home.{" "}
        {blocked
          ? "Analysing it needs an AI key, so it cannot run yet."
          : "Pick it there and start the analysis when you are ready."}
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-primary" onClick={() => setView("home")}>
          Go to Home
        </button>
        <button type="button" className="btn" onClick={onAnother}>
          Add another test
        </button>
      </div>
    </div>
  );
}
