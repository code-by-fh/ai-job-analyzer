"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { PanelHeader } from "./PanelHeader";

interface UnsavedChanges {
  setDirty: (dirty: boolean) => void;
  /**
   * Only the browser's close/reload warning, for content that saves itself when the user moves
   * within the app (autosave). Unlike setDirty it never opens the leave dialog or holds links.
   */
  setUnloadWarning: (on: boolean) => void;
  /** Resolves true at once when nothing is unsaved, otherwise after the user's answer. */
  requestLeave: () => Promise<boolean>;
}

const UnsavedChangesContext = createContext<UnsavedChanges | null>(null);

export function useUnsavedChanges(): UnsavedChanges {
  const value = useContext(UnsavedChangesContext);
  if (!value) throw new Error("useUnsavedChanges needs an UnsavedChangesProvider");
  return value;
}

const LEFT_BUTTON = 0;

/** The in-app destination of a plain left click on a link, or null when the browser should handle it. */
function internalDestination(event: MouseEvent): HTMLAnchorElement | null {
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]") ?? null;
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (!anchor || event.defaultPrevented || modified || event.button !== LEFT_BUTTON) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  const here = window.location;
  if (url.origin !== here.origin) return null;
  return url.pathname + url.search === here.pathname + here.search ? null : anchor;
}

/** Warns before unload (browsers only show their own text) while changes are unsaved. */
function useUnloadWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return undefined;
    const block = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", block);
    return () => window.removeEventListener("beforeunload", block);
  }, [dirty]);
}

interface LinkGuard {
  dirty: boolean;
  isDirty: () => boolean;
  release: () => void;
  requestLeave: () => Promise<boolean>;
}

/** Holds the click behind the dialog; on "leave" the link is clicked again with the guard released. */
async function holdLink(anchor: HTMLAnchorElement, guard: LinkGuard): Promise<void> {
  if (!(await guard.requestLeave())) return;
  guard.release();
  anchor.click();
}

/**
 * Capture phase on the document runs before the router's own click handler, so a guarded
 * navigation never starts.
 */
function useLinkInterception(guard: LinkGuard): void {
  const { dirty } = guard;
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (event: MouseEvent) => {
      const anchor = guard.isDirty() ? internalDestination(event) : null;
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
      void holdLink(anchor, guard);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, guard]);
}

/** The dirty flag, readable outside the render cycle (event handlers must see the latest value). */
function useDirtyFlag() {
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);
  const isDirty = useCallback(() => dirtyRef.current, []);
  return { dirty, setDirty, isDirty };
}

/** The pending "may the user leave?" question; a newer question answers the older one with "stay". */
function useLeaveQuestion(isDirty: () => boolean) {
  const [asking, setAsking] = useState(false);
  const answerRef = useRef<((leave: boolean) => void) | null>(null);
  const answer = useCallback((leave: boolean) => {
    answerRef.current?.(leave);
    answerRef.current = null;
    setAsking(false);
  }, []);
  const requestLeave = useCallback(() => {
    if (!isDirty()) return Promise.resolve(true);
    answerRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      answerRef.current = resolve;
      setAsking(true);
    });
  }, [isDirty]);
  return { asking, answer, requestLeave };
}

interface Guards {
  dirty: boolean;
  isDirty: () => boolean;
  setDirty: (dirty: boolean) => void;
  requestLeave: () => Promise<boolean>;
  unloadWarning: boolean;
}

function useNavigationGuards({ dirty, isDirty, setDirty, requestLeave, unloadWarning }: Guards) {
  const release = useCallback(() => setDirty(false), [setDirty]);
  const guard = useMemo(
    () => ({ dirty, isDirty, release, requestLeave }),
    [dirty, isDirty, release, requestLeave],
  );
  useUnloadWarning(dirty || unloadWarning);
  useLinkInterception(guard);
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { dirty, setDirty, isDirty } = useDirtyFlag();
  const { asking, answer, requestLeave } = useLeaveQuestion(isDirty);
  const [unloadWarning, setUnloadWarning] = useState(false);
  useNavigationGuards({ dirty, isDirty, setDirty, requestLeave, unloadWarning });
  const value = useMemo(
    () => ({ setDirty, setUnloadWarning, requestLeave }),
    [setDirty, requestLeave],
  );
  return (
    <UnsavedChangesContext value={value}>
      {children}
      <LeaveDialog open={asking} onAnswer={answer} />
    </UnsavedChangesContext>
  );
}

function LeaveDialog({ open, onAnswer }: { open: boolean; onAnswer: (leave: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={() => onAnswer(false)} label={t("unsaved.title")}>
      <div className="panel-in">
        <PanelHeader title={t("unsaved.title")} onClose={() => onAnswer(false)} />
        <p className="prose">{t("unsaved.text")}</p>
        <div className="row panel-actions">
          <Button variant="primary" onClick={() => onAnswer(true)}>
            {t("unsaved.confirm")}
          </Button>
          <Button variant="ghost" onClick={() => onAnswer(false)}>
            {t("unsaved.stay")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
