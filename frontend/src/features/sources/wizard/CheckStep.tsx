"use client";

import type { Dispatch, FormEvent } from "react";
import type { Platform } from "@/api/platforms";
import { PENDING_SETUP } from "@/domain/sources";
import { parseImportUrl } from "@/features/inbox/import/importUrl";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/Field";
import { Notice } from "@/ui/Notice";
import { StepFoot } from "./StepFoot";
import type { LinkCheck } from "./useLinkCheck";
import type { WizardAction, WizardState } from "./wizardState";

export const WIZARD_URL_ID = "wizard-url";
const DUPLICATE = "sources.wizard.duplicate";

/**
 * The stored address is the server's canonical form (Task 1). The client compares WHATWG hrefs, which
 * normalise less (no IDN or other canonicalisation), so this check is deliberately the stricter
 * side: whatever it calls a duplicate the server does too, and what it misses the server's own
 * duplicate refusal on setup still catches. It never refuses a source the server would accept.
 */
function sameAddress(stored: string, typed: string): boolean {
  const canonical = (url: string) => (URL.canParse(url) ? new URL(url).href : url);
  return canonical(stored) === canonical(typed);
}

/** D15: a pending legacy row is not a duplicate; the server reuses it on setup. */
function existingSource(platforms: readonly Platform[], typed: string): Platform | undefined {
  const url = parseImportUrl(typed);
  if (!url) return undefined;
  return platforms.find(
    (platform) => platform.setup_status !== PENDING_SETUP && sameAddress(platform.url, url),
  );
}

export interface CheckStepProps {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  platforms: readonly Platform[];
  /** Opens a listed source's drawer; the wizard holds nothing else then (only its own address). */
  onOpenExisting: (id: number) => void;
  /** Owned by the wizard, so its live region outlives this step. */
  link: LinkCheck;
}

/** Client checks first (import rule, D12 duplicate against the loaded list), then the server's. */
function useCheckSubmit({ state, dispatch, platforms, link }: CheckStepProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = parseImportUrl(state.url);
    if (!url) dispatch({ type: "errors", errors: { url: "import.invalidUrl" } });
    else if (existingSource(platforms, url))
      dispatch({ type: "errors", errors: { url: DUPLICATE } });
    else link.check(url);
  };
  return submit;
}

/** D10 step 1: the address of a search results page, checked for job links. */
export function CheckStep(props: CheckStepProps) {
  const { t } = useI18n();
  const submit = useCheckSubmit(props);
  const { checking } = props.link;
  return (
    <form noValidate onSubmit={submit}>
      <UrlField {...props} />
      {checking ? <Notice>{t("sources.wizard.checking")}</Notice> : null}
      <StepFoot>
        <Button type="submit" variant="primary" busy={checking}>
          {t("sources.wizard.step1")}
        </Button>
      </StepFoot>
    </form>
  );
}

/** I1: editing the address during a check drops that check; its links belong to the old address. */
function addressEditor(link: LinkCheck, dispatch: Dispatch<WizardAction>) {
  return (url: string) => {
    if (link.checking) link.cancel();
    dispatch({ type: "url", url });
  };
}

function UrlField({ state, dispatch, link, ...existing }: CheckStepProps) {
  const { t } = useI18n();
  const error = state.errors.url;
  return (
    <>
      <TextField
        id={WIZARD_URL_ID}
        type="url"
        data-autofocus
        label={t("sources.wizard.url")}
        hint={t("sources.wizard.urlHint")}
        placeholder={t("sources.wizard.urlPlaceholder")}
        value={state.url}
        onChange={(event) => addressEditor(link, dispatch)(event.target.value)}
        error={error ? t(error) : undefined}
      />
      <ViewExisting state={state} {...existing} />
    </>
  );
}

/** D10: after "Diese Quelle gibt es schon." a link to that source's drawer. */
function ViewExisting({
  state,
  platforms,
  onOpenExisting,
}: Omit<CheckStepProps, "dispatch" | "link">) {
  const { t } = useI18n();
  const source = state.errors.url === DUPLICATE ? existingSource(platforms, state.url) : undefined;
  if (!source) return null;
  return (
    <button
      type="button"
      className="link wizard-existing"
      onClick={() => onOpenExisting(source.id)}
    >
      {t("sources.wizard.viewExisting", { name: source.name })}
    </button>
  );
}
