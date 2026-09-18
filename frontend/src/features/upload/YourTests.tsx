import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { uploadApi } from "../../api/upload";
import { Panel } from "../../components/ui/Panel";
import { useSession } from "../../hooks/useSession";
import { shortDate } from "../../lib/format";
import { useUploadedClasses } from "./useUploadedClasses";

/** The tests already added, with a delete that asks first, inline, rather than in a browser dialog. */
export function YourTests() {
  const qc = useQueryClient();
  const { selectedTest, setSelectedTest } = useSession();
  const [confirming, setConfirming] = useState<string | null>(null);

  const tests = useQuery({ queryKey: ["upload", "tests"], queryFn: uploadApi.listTests });
  const courses = useUploadedClasses();
  const className = (id: string) =>
    courses.data?.find((c) => c.id === id)?.name ?? (courses.isLoading ? "" : id);

  const remove = useMutation({
    mutationFn: uploadApi.deleteTest,
    onSuccess: (_result, assessmentId) => {
      setConfirming(null);
      // Home would otherwise keep pointing at a test that no longer exists.
      if (selectedTest === assessmentId) setSelectedTest("A3");
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["upload"] });
    },
  });

  const rows = tests.data ?? [];
  return (
    <Panel
      title="Tests you have added"
      subtitle="Deleting a test also removes its answers and anything worked out from them."
      flush
    >
      {tests.isError ? (
        <p className="p-4 text-sm text-flag">
          {tests.error instanceof ApiError
            ? tests.error.message
            : "Your tests could not be loaded."}
        </p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">
          {tests.isLoading ? "Loading your tests." : "You have not added a test yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Test</th>
                <th className="w-40">Class</th>
                <th className="w-24">Questions</th>
                <th className="w-24">Students</th>
                <th className="w-24">Added</th>
                <th className="w-96"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.assessment_id}>
                  <td className="text-ink">{t.name}</td>
                  <td className="text-ink-muted">{className(t.class_id)}</td>
                  <td className="num text-ink-muted">{t.question_count}</td>
                  <td className="num text-ink-muted">{t.student_count}</td>
                  <td className="text-ink-muted">{shortDate(t.created_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    {confirming === t.assessment_id ? (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span className="text-xs text-ink-muted">Delete this test for good?</span>
                        <button
                          type="button"
                          className="btn btn-xs"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(t.assessment_id)}
                        >
                          {remove.isPending ? "Deleting" : "Yes, delete it"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() => {
                            setConfirming(null);
                            remove.reset();
                          }}
                        >
                          Keep it
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-xs"
                        onClick={() => {
                          remove.reset();
                          setConfirming(t.assessment_id);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {remove.isError && (
        <p role="alert" className="border-t border-line p-3 text-sm text-flag">
          {remove.error instanceof ApiError
            ? remove.error.message
            : "That test could not be deleted."}
        </p>
      )}
    </Panel>
  );
}
