"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { SetupStatus } from "@/api/setup";
import { inboxHref } from "@/domain/inbox";
import {
  currentStep,
  doneCount,
  ONBOARDING_STEPS,
  stepDone,
  type OnboardingStep,
} from "@/domain/onboarding";
import { navNumber, PROFILE_HREF, SOURCES_ADD_HREF } from "@/features/shell/navigation";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { Masthead } from "@/ui/Masthead";
import { ImportButton } from "../import/ImportButton";
import { AiSetupAction } from "./AiSetupAction";

const PERCENT = 100;
const STEP_COPY: Readonly<Record<OnboardingStep, { title: MessageKey; text: MessageKey }>> = {
  profile: { title: "onboard.profile.title", text: "onboard.profile.text" },
  source: { title: "onboard.source.title", text: "onboard.source.text" },
  ai: { title: "onboard.ai.title", text: "onboard.ai.text" },
};

// The AI step's link depends on the user's role (AiSetupAction); the other two are plain links.
const STEP_LINK: Readonly<
  Record<Exclude<OnboardingStep, "ai">, { href: string; label: MessageKey }>
> = {
  profile: { href: PROFILE_HREF, label: "action.openProfile" },
  source: { href: SOURCES_ADD_HREF, label: "onboard.source.action" },
};

export interface OnboardingProps {
  status: SetupStatus;
  /** Opened on request (?view=setup) from the inbox, so there is an inbox to go back to. */
  requested: boolean;
}

/** Prototype renderOnboarding with three steps (decision D6); replaces the whole inbox. */
export function Onboarding({ status, requested }: OnboardingProps) {
  const done = doneCount(status);
  const total = ONBOARDING_STEPS.length;
  return (
    <div className="page onboard">
      <OnboardingHead status={status} done={done} total={total} />
      <OnboardingProgress done={done} total={total} />
      <OnboardingSteps status={status} />
      <OnboardingFoot requested={requested} />
    </div>
  );
}

interface HeadProps {
  status: SetupStatus;
  done: number;
  total: number;
}

function OnboardingHead({ status, done, total }: HeadProps) {
  const { t } = useI18n();
  const title = useOnboardingTitle();
  return (
    <>
      <Masthead
        number={navNumber("inbox")}
        title={title}
        deck={t("onboard.deck", { done, total })}
      />
      {/* R19(3): with an AI provider a single job can be imported and scored without a source. */}
      {status.ai_configured ? (
        <div className="ob-import">
          <ImportButton />
        </div>
      ) : null}
    </>
  );
}

/** R19(4): "Willkommen" alone, without a trailing comma, until the user is known. */
function useOnboardingTitle(): string {
  const { t } = useI18n();
  const name = useCurrentUser().data?.username;
  return name ? t("onboard.title", { name }) : t("onboard.titleAnonymous");
}

/** Decorative: the deck says the same in words. */
function OnboardingProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="ob-progress" aria-hidden="true">
      <i style={{ width: `${(done / total) * PERCENT}%` }} />
    </div>
  );
}

function OnboardingSteps({ status }: { status: SetupStatus }) {
  return (
    <ol role="list" className="ob-list">
      {ONBOARDING_STEPS.map((step, index) => (
        <OnboardingItem key={step} step={step} number={index + 1} status={status} />
      ))}
    </ol>
  );
}

interface ItemProps {
  step: OnboardingStep;
  number: number;
  status: SetupStatus;
}

function OnboardingItem({ step, number, status }: ItemProps) {
  const { t } = useI18n();
  const done = stepDone(status, step);
  return (
    <li className={cx("ob-item", done && "done")}>
      <span className="ob-num" aria-hidden="true">
        {done ? <Icon icon={Check} /> : number}
      </span>
      <div>
        <h2 className="ob-title">{t(STEP_COPY[step].title)}</h2>
        <p className="ob-text">{t(STEP_COPY[step].text)}</p>
      </div>
      <div className="ob-act">
        <StepState step={step} status={status} />
      </div>
    </li>
  );
}

function StepState({ step, status }: { step: OnboardingStep; status: SetupStatus }) {
  const { t } = useI18n();
  if (stepDone(status, step)) return <span className="meta ob-done">{t("onboard.done")}</span>;
  return <StepAction step={step} primary={currentStep(status) === step} />;
}

function StepAction({ step, primary }: { step: OnboardingStep; primary: boolean }) {
  const { t } = useI18n();
  const className = cx("btn", primary && "btn-primary");
  if (step === "ai") return <AiSetupAction className={className} />;
  const link = STEP_LINK[step];
  return (
    <Link className={className} href={link.href}>
      {t(link.label)}
    </Link>
  );
}

function OnboardingFoot({ requested }: { requested: boolean }) {
  const { t } = useI18n();
  return (
    <p className="meta ob-foot">
      {t("onboard.foot")}{" "}
      {requested ? (
        // replace (decision D1), like the way here: Back leaves the inbox.
        <Link className="link" href={inboxHref({ tab: "new" })} replace>
          {t("onboard.toInbox")}
        </Link>
      ) : null}
    </p>
  );
}
