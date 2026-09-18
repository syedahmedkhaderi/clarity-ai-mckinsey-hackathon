import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emailApi } from "../../api/email";
import { ApiError } from "../../api/http";
import { Tag } from "../../components/ui/Tag";
import { NOTE_STATE, type NoteState } from "./copy";

export function StateTag({ state }: { state: NoteState }) {
  const { label, tone } = NOTE_STATE[state];
  return <Tag tone={tone}>{label}</Tag>;
}

/** A student's address with a small Edit that saves straight to the student record. */
export function EmailAddress({ learnerId, email }: { learnerId: string; email: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(email);

  const save = useMutation({
    mutationFn: (address: string) => emailApi.updateStudent(learnerId, address),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["students"] });
    },
  });

  const open = () => {
    setValue(email);
    save.reset();
    setEditing(true);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(value.trim());
  };

  if (!editing) {
    return (
      <span className="inline-flex items-baseline gap-2">
        <span className={email ? "text-sm text-ink" : "text-sm text-ink-faint"}>
          {email || "No address yet"}
        </span>
        <button type="button" className="text-xs text-ink-muted underline" onClick={open}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          aria-label="Email address"
          className="w-60 rounded border border-line-strong px-2 py-1 text-sm"
        />
        <button type="submit" className="btn btn-xs" disabled={save.isPending}>
          {save.isPending ? "Saving" : "Save"}
        </button>
        <button type="button" className="btn btn-xs" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {save.error && (
        <p className="text-xs text-flag">
          {save.error instanceof ApiError ? save.error.message : "The address could not be saved."}
        </p>
      )}
    </form>
  );
}
