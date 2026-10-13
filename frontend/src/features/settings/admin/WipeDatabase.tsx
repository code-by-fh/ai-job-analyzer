"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { useConfirmation } from "../useConfirmation";
import { WipeDialog } from "./WipeDialog";

const HEADING_ID = "settings-wipe-h";
const OPENER_ID = "settings-wipe-open";

interface WipeScope {
  allUsers: boolean;
  id: string;
  label: MessageKey;
  hint: MessageKey;
}

// Each hint says what routers/admin.py wipe_database deletes for that scope (preflight ruling 24).
const WIPE_SCOPES: readonly WipeScope[] = [
  {
    allUsers: false,
    id: "settings-wipe-own",
    label: "settings.system.wipeOwn",
    hint: "settings.system.wipeOwnText",
  },
  {
    allUsers: true,
    id: "settings-wipe-all",
    label: "settings.system.wipeAll",
    hint: "settings.system.wipeAllText",
  },
];

interface ScopeChoiceProps {
  allUsers: boolean;
  onPick: (allUsers: boolean) => void;
}

function ScopeText({ scope }: { scope: WipeScope }) {
  const { t } = useI18n();
  return (
    <span>
      <span id={`${scope.id}-label`} className="radio-title">
        {t(scope.label)}
      </span>
      <span id={`${scope.id}-hint`} className="meta">
        {t(scope.hint)}
      </span>
    </span>
  );
}

/** Prototype .radio-row: named by its title alone, the deleted data is its description. */
function ScopeOption({ scope, allUsers, onPick }: { scope: WipeScope } & ScopeChoiceProps) {
  return (
    <label className="radio-row">
      <input
        type="radio"
        name="wipe-scope"
        checked={scope.allUsers === allUsers}
        aria-labelledby={`${scope.id}-label`}
        aria-describedby={`${scope.id}-hint`}
        onChange={() => onPick(scope.allUsers)}
      />
      <ScopeText scope={scope} />
    </label>
  );
}

function ScopeChoice({ allUsers, onPick }: ScopeChoiceProps) {
  const { t } = useI18n();
  return (
    <fieldset className="wipe-scope">
      <legend className="meta">{t("settings.system.wipeScope")}</legend>
      {WIPE_SCOPES.map((scope) => (
        <ScopeOption key={scope.id} scope={scope} allUsers={allUsers} onPick={onPick} />
      ))}
    </fieldset>
  );
}

function WipeHeading() {
  const { t } = useI18n();
  return (
    <h3 id={HEADING_ID} className="sec-title-sm">
      <Icon icon={TriangleAlert} />
      <span>{t("settings.system.wipe")}</span>
    </h3>
  );
}

/** D6: the crimson zone; "Nur meine Daten" is the default, the dialog asks for the password. */
export function WipeDatabase() {
  const { t } = useI18n();
  const [allUsers, setAllUsers] = useState(false);
  const confirmation = useConfirmation(OPENER_ID);
  return (
    <section className="settings-block account-block danger-zone" aria-labelledby={HEADING_ID}>
      <WipeHeading />
      <ScopeChoice allUsers={allUsers} onPick={setAllUsers} />
      <p className="prose">{t("settings.system.wipeText")}</p>
      <Button id={OPENER_ID} variant="danger" onClick={confirmation.ask}>
        {t("settings.system.wipe")}
      </Button>
      {confirmation.open ? <WipeDialog allUsers={allUsers} onClose={confirmation.cancel} /> : null}
    </section>
  );
}
