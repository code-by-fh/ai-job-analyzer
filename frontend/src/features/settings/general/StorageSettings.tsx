"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Cloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { storageStatusQueryOptions, type StorageStatus } from "@/api/settings";
import type { StorageService } from "@/api/settingsPaths";
import { SectionState } from "@/features/profile/SectionState";
import type { MessageKey } from "@/i18n/de";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/Icon";
import { settingsHeadingId } from "../labels";
import { DisconnectDriveDialog } from "./DisconnectDriveDialog";
import { useStorageActions } from "./useStorageActions";

const CONNECT_ID = "settings-drive-connect";
const UNAVAILABLE_ID = "settings-drive-unavailable";
const CONNECT_FIRST_ID = "settings-drive-connect-first";
const DRIVE: StorageService = "GOOGLE_DRIVE";

type StorageActions = ReturnType<typeof useStorageActions>;

/**
 * Preflight ruling 20: after Trennen the opener is gone, so the connect button takes focus, or the
 * heading when Drive is not offered any more (no button is rendered).
 */
const focusTargetAfterDisconnect = () =>
  document.getElementById(CONNECT_ID) ?? document.getElementById(settingsHeadingId("general"));

/**
 * The connect button exists only once the refetched status has rendered, which can be later than
 * the next frame after the mutation settled. So the focus moves from an effect that runs after the
 * render showing "not connected", once per successful Trennen (request() bumps the count).
 */
function useFocusAfterDisconnect(connected: boolean): () => void {
  const [requested, setRequested] = useState(0);
  const handled = useRef(0);
  useEffect(() => {
    if (requested === handled.current || connected) return;
    handled.current = requested;
    focusTargetAfterDisconnect()?.focus();
  }, [requested, connected]);
  return () => setRequested((count) => count + 1);
}

interface StorageOptionProps {
  service: StorageService;
  label: MessageKey;
  hint: MessageKey;
  checked: boolean;
  /** Why the option cannot be chosen now, linked by aria-describedby. */
  reasonId?: string;
  /**
   * True when it cannot be chosen at all here; otherwise a reason only makes it aria-disabled, so
   * it stays focusable and arrowing onto it keeps the focus there (R11, WCAG 3.2.2).
   */
  disabled?: boolean;
  onPick: (service: StorageService) => void;
}

function OptionText({ id, label, hint }: { id: string; label: MessageKey; hint: MessageKey }) {
  const { t } = useI18n();
  return (
    <span>
      <span id={`${id}-label`} className="radio-title">
        {t(label)}
      </span>
      <span id={`${id}-hint`} className="meta">
        {t(hint)}
      </span>
    </span>
  );
}

/** Named by its title alone (aria-labelledby); the hint is its description. */
function StorageOption(props: StorageOptionProps) {
  const { service, label, hint, checked, reasonId, disabled = false, onPick } = props;
  const id = `settings-storage-${service}`;
  return (
    <label className="radio-row">
      <input
        type="radio"
        name="storage"
        value={service}
        checked={checked}
        disabled={disabled}
        aria-disabled={(reasonId !== undefined && !disabled) || undefined}
        aria-labelledby={`${id}-label`}
        aria-describedby={cx(`${id}-hint`, reasonId)}
        onChange={() => onPick(service)}
      />
      <OptionText id={id} label={label} hint={hint} />
    </label>
  );
}

interface ConnectedLineProps {
  email: string | null;
  onDisconnect: () => void;
}

/** "Eingerichtet" style (constraint colours): --ok text with a check icon, never colour alone. */
function ConnectedLine({ email, onDisconnect }: ConnectedLineProps) {
  const { t } = useI18n();
  // The address is missing when Google did not tell it at connect time.
  const text = email
    ? t("settings.storage.connectedAs", { email })
    : t("settings.storage.callbackConnected");
  return (
    <div className="row">
      <span className="meta t-ok storage-connected">
        <Icon icon={Check} />
        {text}
      </span>
      <Button size="sm" variant="ghost" onClick={onDisconnect}>
        {t("settings.storage.disconnect")}
      </Button>
    </div>
  );
}

function ConnectButton({ connect }: { connect: StorageActions["connect"] }) {
  const { t } = useI18n();
  return (
    <Button
      id={CONNECT_ID}
      size="sm"
      icon={Cloud}
      busy={connect.isPending}
      onClick={() => connect.mutate()}
    >
      {t("settings.storage.connect")}
    </Button>
  );
}

function ConnectFirst({ connect }: { connect: StorageActions["connect"] }) {
  const { t } = useI18n();
  return (
    <>
      <p id={CONNECT_FIRST_ID} className="hint">
        {t("settings.storage.connectFirst")}
      </p>
      <ConnectButton connect={connect} />
    </>
  );
}

interface DriveDetailProps {
  status: StorageStatus;
  connect: StorageActions["connect"];
  onDisconnect: () => void;
}

/** R10: the connect button only where the server can run the OAuth flow at all. */
function DriveDetail({ status, connect, onDisconnect }: DriveDetailProps) {
  const { t } = useI18n();
  return (
    <div className="radio-detail">
      {status.available ? null : (
        <p id={UNAVAILABLE_ID} className="hint">
          {t("settings.storage.driveUnavailable")}
        </p>
      )}
      {status.connected ? (
        <ConnectedLine email={status.email} onDisconnect={onDisconnect} />
      ) : (
        status.available && <ConnectFirst connect={connect} />
      )}
    </div>
  );
}

/**
 * Ruling 38: the radios show the pending choice. R11 (replaces ruling 38's focus jump): Drive
 * before it is connected sends nothing (the server would refuse it with 400) and moves no focus;
 * its radio is aria-disabled and described by the "connect first" hint.
 */
function useStorageChoices(status: StorageStatus, actions: StorageActions) {
  const [confirming, setConfirming] = useState(false);
  const focusAfterDisconnect = useFocusAfterDisconnect(status.connected);
  const { choose, disconnect } = actions;
  const shown = choose.isPending ? choose.variables : status.active;
  const pick = (service: StorageService) => {
    if (service !== DRIVE || status.connected) choose.mutate(service);
  };
  const confirmDisconnect = () =>
    disconnect.mutate(undefined, {
      // flushSync commits the close now, so the dialog's own focus return runs before the move.
      onSuccess: () => {
        flushSync(() => setConfirming(false));
        focusAfterDisconnect();
      },
    });
  return { shown, pick, confirming, setConfirming, confirmDisconnect };
}

const STORAGE_OPTIONS = [
  { service: "NONE", label: "settings.storage.database", hint: "settings.storage.databaseHint" },
  { service: DRIVE, label: "settings.storage.drive", hint: "settings.storage.driveHint" },
] as const satisfies readonly Pick<StorageOptionProps, "service" | "label" | "hint">[];

interface StorageOptionsProps {
  status: StorageStatus;
  shown: StorageService;
  onPick: (service: StorageService) => void;
}

/** R10: not offered at all without server configuration; R11: aria-disabled until connected. */
function driveBlock(status: StorageStatus): Pick<StorageOptionProps, "reasonId" | "disabled"> {
  if (!status.available) return { reasonId: UNAVAILABLE_ID, disabled: true };
  if (!status.connected) return { reasonId: CONNECT_FIRST_ID, disabled: false };
  return {};
}

function StorageOptions({ status, shown, onPick }: StorageOptionsProps) {
  return STORAGE_OPTIONS.map((option) => (
    <StorageOption
      key={option.service}
      {...option}
      {...(option.service === DRIVE ? driveBlock(status) : {})}
      checked={shown === option.service}
      onPick={onPick}
    />
  ));
}

function StorageChoices({ status, actions }: { status: StorageStatus; actions: StorageActions }) {
  const choices = useStorageChoices(status, actions);
  return (
    <>
      <StorageOptions status={status} shown={choices.shown} onPick={choices.pick} />
      <DriveDetail
        status={status}
        connect={actions.connect}
        onDisconnect={() => choices.setConfirming(true)}
      />
      {choices.confirming ? (
        <DisconnectDriveDialog
          busy={actions.disconnect.isPending}
          onConfirm={choices.confirmDisconnect}
          onClose={() => choices.setConfirming(false)}
        />
      ) : null}
    </>
  );
}

/** D4: where generated files go; every choice saves at once (D3, no draft). */
export function StorageSettings() {
  const { t } = useI18n();
  const query = useQuery(storageStatusQueryOptions());
  const actions = useStorageActions();
  // Ruling 38: aria-busy instead of disabled, so the focused radio keeps its focus while saving.
  return (
    <fieldset className="settings-block" aria-busy={actions.choose.isPending || undefined}>
      <legend className="sec-title-sm">{t("settings.storage.title")}</legend>
      <p className="hint">{t("settings.storage.intro")}</p>
      <SectionState query={query}>
        {(status) => <StorageChoices status={status} actions={actions} />}
      </SectionState>
    </fieldset>
  );
}
