"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { setupStatusQueryOptions } from "@/api/setup";
import { PROFILE_HREF } from "@/features/shell/navigation";
import { useI18n } from "@/i18n/useI18n";
import { forgetImport, useImports } from "@/realtime/useImports";
import { Button } from "@/ui/Button";
import { Drawer } from "@/ui/Drawer";
import { Notice } from "@/ui/Notice";
import { PanelHeader } from "@/ui/PanelHeader";
import { ImportForm } from "./ImportForm";
import { ImportProgress } from "./ImportProgress";

/** Masthead action "Per URL importieren" (spec 4.2); each opening mounts a fresh drawer. */
export function ImportButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <ImportTrigger onClick={() => setOpen(true)} />
      {open ? <ImportDrawer onClose={close} /> : null}
    </>
  );
}

/** A labelled secondary button at every width; the accessible name stays the full one. */
function ImportTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button
      size="sm"
      icon={Link2}
      aria-label={t("import.open")}
      title={t("import.open")}
      onClick={onClick}
    >
      {t("import.openShort")}
    </Button>
  );
}

/** The crawl this drawer started; `finished` once its entry is gone (the provider toasts it). */
function useImportSession(onClose: () => void) {
  const queryClient = useQueryClient();
  const [crawlId, setCrawlId] = useState<string | null>(null);
  const entry = useImports()[crawlId ?? ""];
  const [retried, setRetried] = useState(false);
  const finished = crawlId !== null && !entry;
  useEffect(() => {
    if (finished) onClose();
  }, [finished, onClose]);
  // R18(1): a stalled import the user gives up on is forgotten, so it never toasts later.
  const retry = () => {
    setCrawlId(null);
    setRetried(true);
    if (crawlId) forgetImport(queryClient, crawlId);
  };
  return { crawlId, entry, finished, retried, start: setCrawlId, retry };
}

function ImportDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const session = useImportSession(onClose);
  if (session.finished) return null;
  return (
    <Drawer open onClose={onClose} label={t("import.title")} variant="narrow">
      <div className="panel-in">
        <PanelHeader title={t("import.title")} onClose={onClose} />
        <p className="prose">{t("import.intro")}</p>
        <ProfileHint />
        {session.crawlId && session.entry ? (
          <ImportProgress crawlId={session.crawlId} entry={session.entry} onRetry={session.retry} />
        ) : (
          <ImportForm onStarted={session.start} focusOnMount={session.retried} />
        )}
      </div>
    </Drawer>
  );
}

/** Without a profile the analysis cannot score the job; say so before the user waits for nothing. */
function ProfileHint() {
  const { t } = useI18n();
  const setup = useQuery(setupStatusQueryOptions());
  if (!setup.data || setup.data.profile_complete) return null;
  return (
    <div className="import-block">
      <Notice tone="warn">
        {t("import.profileMissing")}{" "}
        <Link className="link" href={PROFILE_HREF}>
          {t("action.openProfile")}
        </Link>
      </Notice>
    </div>
  );
}
