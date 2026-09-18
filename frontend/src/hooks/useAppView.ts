import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ViewKey = "home" | "students" | "class" | "plan" | "review" | "upload";

export const VIEW_KEYS: ViewKey[] = ["home", "students", "class", "plan", "review", "upload"];

export interface AppView {
  view: ViewKey;
  setView: (v: ViewKey) => void;
}

function fromHash(): ViewKey {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return (VIEW_KEYS as string[]).includes(raw) ? (raw as ViewKey) : "home";
}

/**
 * The current page, kept in the URL hash so a refresh or a shared link lands on
 * the same page. A hash rather than a router because there are six pages and no
 * nested routes.
 */
export function useAppViewState(): AppView {
  const [view, setViewState] = useState<ViewKey>(fromHash);

  useEffect(() => {
    const onHash = () => setViewState(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setView = useCallback((next: ViewKey) => {
    if (window.location.hash !== `#/${next}`) window.location.hash = `/${next}`;
    setViewState(next);
  }, []);

  return { view, setView };
}

export const AppViewContext = createContext<AppView | null>(null);

export function useAppView(): AppView {
  const ctx = useContext(AppViewContext);
  if (!ctx) throw new Error("useAppView must be used inside the app view provider");
  return ctx;
}
