import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { DEMO_CLASS_ID } from "./copy";

/** The classes the teacher has added themselves. The demo class is not one of them. */
export function useUploadedClasses() {
  return useQuery({
    queryKey: ["upload", "classes"],
    queryFn: async () => (await api.courses()).filter((c) => c.id !== DEMO_CLASS_ID),
  });
}
