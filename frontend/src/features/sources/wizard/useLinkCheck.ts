"use client";

import { useEffect, useRef, useState, type Dispatch } from "react";
import { ApiError } from "@/api/errors";
import { previewSourceLinks, type PreviewLink } from "@/api/platforms";
import { HTTP_BAD_REQUEST } from "@/features/profile/refusals";
import { sectionFieldErrors } from "../drawer/useSectionSave";
import type { WizardAction } from "./wizardState";

export interface LinkCheck {
  check: (url: string) => void;
  /** Aborts the running check; its result, when it still arrives, is dropped. */
  cancel: () => void;
  checking: boolean;
  /** How many checks were started, for the live region's one announcement per start. */
  started: number;
}

function resultAction(links: PreviewLink[]): WizardAction {
  return links.length > 0
    ? { type: "linksLoaded", links }
    : { type: "errors", errors: { url: "sources.wizard.noLinks" } };
}

/**
 * The URL guard refuses with 422 on `url` (not public) or a real 400 (not http(s)); both read as
 * one fixed sentence on the field. Any other status, including those errors.ts files under
 * BAD_REQUEST as a fallback (e.g. 408), means the page itself could not be fetched.
 */
function errorAction(error: unknown): WizardAction {
  const refused =
    error instanceof ApiError &&
    (error.status === HTTP_BAD_REQUEST || sectionFieldErrors(error).includes("url"));
  return {
    type: "errors",
    errors: { url: refused ? "sources.error.url" : "sources.wizard.loadFailed" },
  };
}

/**
 * D10 step 1: the check takes up to 90 s. A newer check, an edit of the address or closing the
 * wizard aborts the older one, and a result after its abort is dropped (G21: the server still
 * finishes its fetch).
 */
export function useLinkCheck(dispatch: Dispatch<WizardAction>): LinkCheck {
  const controller = useRef<AbortController | null>(null);
  const [run, setRun] = useState({ checking: false, started: 0 });
  useEffect(() => () => controller.current?.abort(), []);
  const settle = () => setRun((current) => ({ ...current, checking: false }));
  const cancel = () => {
    controller.current?.abort();
    settle();
  };
  const check = (url: string) => {
    const own = startCheck(controller);
    setRun((current) => ({ checking: true, started: current.started + 1 }));
    void previewAction(url, own.signal).then((action) => {
      if (own.signal.aborted) return;
      dispatch(action);
      settle();
    });
  };
  return { check, cancel, ...run };
}

/** The check's outcome as one reducer action; never rejects. */
function previewAction(url: string, signal: AbortSignal): Promise<WizardAction> {
  return previewSourceLinks({ url, signal })
    .then((links) => resultAction(links))
    .catch((error: unknown) => errorAction(error));
}

function startCheck(controller: { current: AbortController | null }): AbortController {
  controller.current?.abort();
  const own = new AbortController();
  controller.current = own;
  return own;
}
