import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "../../hooks/useSession";
import type { SavedTest } from "../../types/upload";

/**
 * What has to happen once a test is saved, whether it came from the four steps
 * or the sample button: refresh the lists that show tests and select the new one,
 * so Home opens on it.
 */
export function useAfterSave(): (saved: SavedTest) => void {
  const qc = useQueryClient();
  const { setSelectedTest } = useSession();
  return useCallback(
    (saved) => {
      qc.invalidateQueries({ queryKey: ["tests"] });
      qc.invalidateQueries({ queryKey: ["upload"] });
      setSelectedTest(saved.assessment_id);
    },
    [qc, setSelectedTest],
  );
}
