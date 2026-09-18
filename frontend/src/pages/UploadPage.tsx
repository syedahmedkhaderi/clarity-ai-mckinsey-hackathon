import { EmptyState } from "../components/ui/EmptyState";
import { useAppView } from "../hooks/useAppView";

export function UploadPage() {
  const { setView } = useAppView();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-ink">Add a test</h1>
      </header>
      <EmptyState
        title="Adding a test is coming here"
        action={
          <button className="btn" onClick={() => setView("home")}>
            Back to Home
          </button>
        }
      />
    </div>
  );
}
