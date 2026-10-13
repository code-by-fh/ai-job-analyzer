export type ToastTone = "info" | "success" | "error";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
}

export interface ToastEntry extends ToastInput {
  id: number;
}

// Spec 4.1: at most 2 stacked; toasts with an action (usually undo) stay at least 10 s.
// Announcements: ToastProvider renders two persistent live regions (status for info and success,
// alert for errors) that exist before any toast is inserted; the items carry no role of their own,
// so each toast is announced exactly once. Error toasts follow the same durations (an error with an action
// stays 10 s) and, like all toasts, pause on hover or focus.
export const MAX_VISIBLE_TOASTS = 2;
export const TOAST_DURATION_MS = 6_000;
export const ACTION_TOAST_DURATION_MS = 10_000;

export function toastDuration(input: ToastInput): number {
  return input.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS;
}

/** Appends a toast and drops the oldest beyond the visible limit. */
export function pushToast(list: readonly ToastEntry[], entry: ToastEntry): ToastEntry[] {
  return [...list, entry].slice(-MAX_VISIBLE_TOASTS);
}
