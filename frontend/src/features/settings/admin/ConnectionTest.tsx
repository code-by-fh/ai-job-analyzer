"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { Check, CircleAlert } from "lucide-react";
import { useId } from "react";
import type { ConnectionResult } from "@/api/admin";
import { describeError } from "@/api/describeError";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { REASON_TEXT } from "./testReasons";

export interface ConnectionTestProps {
  /** Tests the stored state on the server (never the draft). */
  run: () => Promise<ConnectionResult>;
  /** The form holds edits: a test would check the stored state, not what is shown (D2). */
  dirty: boolean;
  label: string;
  /** The sentence for a passed test. */
  describe: (result: ConnectionResult) => string;
  /**
   * Changes with every write of the stored settings (the query's dataUpdatedAt). A result belongs to
   * the revision it was started at: after a save or a removal it goes, and an answer that arrives
   * after a save landed is never shown.
   */
  revision: number;
}

/** The variables are the revision the test was started at. */
type TestMutation = UseMutationResult<ConnectionResult, Error, number>;

interface Outcome {
  ok: boolean;
  text: string;
}

function useOutcome(test: TestMutation, props: ConnectionTestProps): Outcome | null {
  const { t } = useI18n();
  const { describe, revision } = props;
  if (test.variables !== revision) return null;
  if (test.error) return { ok: false, text: describeError(test.error, t) };
  const result = test.data;
  if (!result) return null;
  if (result.ok) return { ok: true, text: describe(result) };
  return { ok: false, text: t(REASON_TEXT[result.reason ?? "failed"]) };
}

/** Mounted from the first render, so a screen reader announces the result when it arrives. */
function ResultLine({ outcome }: { outcome: Outcome | null }) {
  const tone = outcome ? (outcome.ok ? "t-ok" : "t-danger") : "";
  return (
    <p role="status" className={`conn-result ${tone}`}>
      {outcome ? (
        <>
          <Icon icon={outcome.ok ? Check : CircleAlert} />
          <span>{outcome.text}</span>
        </>
      ) : null}
    </p>
  );
}

interface TestButtonProps {
  label: string;
  dirty: boolean;
  busy: boolean;
  onClick: () => void;
}

/** Visible, not only for screen readers: the greyed-out button says why it waits. */
function SaveFirst({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <span className="hint" id={id}>
      {t("sources.notify.saveFirst")}
    </span>
  );
}

function TestButton({ label, dirty, busy, onClick }: TestButtonProps) {
  const reasonId = useId();
  return (
    <>
      <Button
        size="sm"
        busy={busy}
        inactive={dirty}
        aria-describedby={dirty ? reasonId : undefined}
        onClick={onClick}
      >
        {label}
      </Button>
      {dirty ? <SaveFirst id={reasonId} /> : null}
    </>
  );
}

/**
 * D2, ruling 19: "Verbindung prüfen" checks what is stored, so it waits while the form is dirty
 * and says why. The result stays below the button (not a toast) to compare it with the fields;
 * a reason is a fixed sentence, a refused request (429, 403, network) its generic one.
 */
export function ConnectionTest(props: ConnectionTestProps) {
  const { run, dirty, label, revision } = props;
  const test = useMutation<ConnectionResult, Error, number>({ mutationFn: () => run() });
  const outcome = useOutcome(test, props);
  return (
    <div className="conn-test">
      <TestButton
        label={label}
        dirty={dirty}
        busy={test.isPending}
        onClick={() => test.mutate(revision)}
      />
      <ResultLine outcome={outcome} />
    </div>
  );
}
