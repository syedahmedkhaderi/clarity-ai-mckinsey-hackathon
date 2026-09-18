import { Panel } from "../../components/ui/Panel";
import { useSession } from "../../hooks/useSession";

/** The seven topics, so the teacher knows what to write in the topic column. */
export function TopicsPanel() {
  const { taxonomy } = useSession();
  const topics = taxonomy?.topics ?? [];
  return (
    <Panel
      title="Topics you can tag"
      subtitle="Write a code or a name in the topic column of your marking guide."
    >
      {topics.length === 0 ? (
        <p className="text-sm text-ink-muted">The topic list is loading.</p>
      ) : (
        <ul className="divide-y divide-line -my-1.5">
          {topics.map((t) => (
            <li key={t.id} className="flex items-baseline gap-3 py-1.5 text-sm">
              <span className="num w-7 shrink-0 text-ink-faint">{t.id}</span>
              <span className="text-ink">{t.label}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Leave the topic blank if none fits. The question is still marked, but no mistake pattern is
        looked for.
      </p>
    </Panel>
  );
}
