"use client";

import { Check, CircleAlert, Info, X, type LucideIcon } from "lucide-react";
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
import { cx } from "./cx";
import { Icon } from "./Icon";
import {
  pushToast,
  toastDuration,
  type ToastAction,
  type ToastEntry,
  type ToastInput,
  type ToastTone,
} from "./toast";
import {
  TOAST_STACK_CLASS,
  useToastFocusReturn,
  type ToastFocusReturn,
} from "./useToastFocusReturn";

export interface ToastApi {
  show: (input: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const TONE_ICON: Record<ToastTone, LucideIcon> = { info: Info, success: Check, error: CircleAlert };

/** @throws Error when used outside <ToastProvider> (a wiring bug, not a runtime condition). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const focusReturn = useToastFocusReturn();
  const { entries, api } = useToastEntries(focusReturn.noteRemoval);
  return (
    <ToastContext value={api}>
      {children}
      <ToastStack entries={entries} onDismiss={api.dismiss} focusReturn={focusReturn} />
    </ToastContext>
  );
}

type EntriesChange = (list: readonly ToastEntry[]) => readonly ToastEntry[];

/** Every change may remove a toast (pushToast drops the oldest), which can be the focused one. */
function useEntries(noteRemoval: () => void) {
  const [entries, setEntries] = useState<readonly ToastEntry[]>([]);
  const update = useCallback(
    (change: EntriesChange) => {
      noteRemoval();
      setEntries(change);
    },
    [noteRemoval],
  );
  return { entries, update };
}

function useToastEntries(noteRemoval: () => void) {
  const { entries, update } = useEntries(noteRemoval);
  const nextId = useRef(0);
  const dismiss = useCallback(
    (id: number) => update((list) => list.filter((entry) => entry.id !== id)),
    [update],
  );
  const show = useCallback(
    (input: ToastInput) => {
      nextId.current += 1;
      const entry: ToastEntry = { ...input, id: nextId.current };
      update((list) => pushToast(list, entry));
    },
    [update],
  );
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return { entries, api };
}

interface ToastStackProps {
  entries: readonly ToastEntry[];
  onDismiss: (id: number) => void;
  focusReturn: ToastFocusReturn;
}

function ToastStack({ entries, onDismiss, focusReturn }: ToastStackProps) {
  const calm = entries.filter((entry) => entry.tone !== "error");
  const errors = entries.filter((entry) => entry.tone === "error");
  // Persistent live regions: they exist before a toast is inserted, so screen readers announce it
  // once; the items carry no role of their own.
  return (
    <div className={TOAST_STACK_CLASS} onFocus={focusReturn.onFocus}>
      <ToastRegion role="status" live="polite" entries={calm} onDismiss={onDismiss} />
      <ToastRegion role="alert" live="assertive" entries={errors} onDismiss={onDismiss} />
    </div>
  );
}

function ToastRegion({
  role,
  live,
  entries,
  onDismiss,
}: {
  role: "status" | "alert";
  live: "polite" | "assertive";
  entries: readonly ToastEntry[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div role={role} aria-live={live} className="toast-region">
      {entries.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: number) => void }) {
  const { paused, handlers } = usePauseOnInteraction();
  useToastTimer(entry, paused, onDismiss);
  const tone = entry.tone ?? "info";
  const dismiss = () => onDismiss(entry.id);
  return (
    <div className={cx("toast", tone === "error" && "err")} {...handlers}>
      <Icon icon={TONE_ICON[tone]} className="lead" />
      <span className="msg">{entry.message}</span>
      {entry.action ? <ToastActionButton action={entry.action} onDone={dismiss} /> : null}
      <ToastCloseButton onClick={dismiss} />
    </div>
  );
}

function ToastCloseButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button
      size="sm"
      variant="ghost"
      iconOnly
      icon={X}
      aria-label={t("toast.close")}
      onClick={onClick}
    />
  );
}

function ToastActionButton({ action, onDone }: { action: ToastAction; onDone: () => void }) {
  const run = () => {
    action.onAction();
    onDone();
  };
  return (
    <Button size="sm" variant="ghost" onClick={run}>
      {action.label}
    </Button>
  );
}

/** Spec 4.1: the timer pauses while the pointer or focus is on the toast. */
function usePauseOnInteraction() {
  const [paused, setPaused] = useState(false);
  const pause = () => setPaused(true);
  const resume = () => setPaused(false);
  return {
    paused,
    handlers: { onMouseEnter: pause, onMouseLeave: resume, onFocus: pause, onBlur: resume },
  };
}

function useToastTimer(entry: ToastEntry, paused: boolean, onDismiss: (id: number) => void): void {
  const remaining = useRef(toastDuration(entry));
  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(entry.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, entry.id, onDismiss]);
}
