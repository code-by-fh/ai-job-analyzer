"use client";

import { usePrefetchQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { channelsQueryOptions, channelTypesQueryOptions } from "@/api/notificationChannels";
import { notificationTemplatesQueryOptions } from "@/api/notifications";
import { platformsQueryOptions, type Platform } from "@/api/platforms";
import { profileTimezoneQueryOptions } from "@/api/settings";
import { activityQueryOptions } from "@/realtime/useActivity";
import { SourcesLiveStatus } from "./crawl/SourcesLiveStatus";
import { SourceDrawer } from "./drawer/SourceDrawer";
import { FailingBanner } from "./FailingBanner";
import { SourceList } from "./SourceList";
import { ProfileRequiredNotice, useProfileMissing } from "./profileGate";
import { SourcesHeader } from "./SourcesHeader";
import { useSourcesUrl, type SourcesUrl } from "./useSourcesUrl";
import { AddSourceWizard } from "./wizard/AddSourceWizard";

/**
 * Constraint "queries start in parallel": the running crawls and the drawer's data are asked for
 * with the list, so nothing waits for the list to answer (preflight ruling 13).
 */
function usePrefetchSources(): void {
  usePrefetchQuery(platformsQueryOptions());
  usePrefetchQuery(activityQueryOptions());
  usePrefetchQuery(channelsQueryOptions());
  usePrefetchQuery(channelTypesQueryOptions());
  usePrefetchQuery(notificationTemplatesQueryOptions());
  usePrefetchQuery(profileTimezoneQueryOptions());
}

/** D1: an id that is not (or no longer) a listed source opens nothing and leaves the URL. */
function useDropUnknownSource(url: SourcesUrl, platforms: readonly Platform[] | undefined): void {
  const unknown =
    url.sourceId !== null &&
    platforms !== undefined &&
    !platforms.some((platform) => platform.id === url.sourceId);
  const { close } = url;
  useEffect(() => {
    if (unknown) close();
  }, [unknown, close]);
}

/** The profile gate holds for a deep link too: `?add=1` without a profile leaves the URL, the notice says why. */
function useDropBlockedWizard(url: SourcesUrl, blocked: boolean): void {
  const drop = url.adding && blocked;
  const { close } = url;
  useEffect(() => {
    if (drop) close();
  }, [drop, close]);
}

/** D1: the source whose drawer is open; none while the wizard is. */
function drawerSource(url: SourcesUrl, platforms: readonly Platform[]): Platform | undefined {
  return url.adding ? undefined : platforms.find((platform) => platform.id === url.sourceId);
}

/**
 * Quellen (spec 4.2). The drawer opens only once its source is in the loaded list (D2: it reads the
 * source from there); the wizard opens at once (D12: its duplicate check uses the list once it is
 * there). SourcesLiveStatus is the page's one live region (D13), always mounted; it is muted while
 * the modal drawer speaks through its own.
 */
export function SourcesPage() {
  usePrefetchSources();
  const url = useSourcesUrl();
  const platforms = useQuery(platformsQueryOptions());
  useDropUnknownSource(url, platforms.data);
  const profileMissing = useProfileMissing();
  useDropBlockedWizard(url, profileMissing);
  const list = platforms.data ?? [];
  return (
    <div className="page sources">
      <SourcesHeader platforms={platforms.data} onAdd={url.openWizard} />
      <ProfileRequiredNotice />
      <FailingBanner platforms={list} onOpen={url.openSource} />
      <SourceList query={platforms} onAdd={url.openWizard} onEdit={url.openSource} />
      <SourcesLiveStatus platforms={list} muted={drawerSource(url, list) !== undefined} />
      <SourcesOverlay url={url} platforms={list} wizardBlocked={profileMissing} />
    </div>
  );
}

/** D1: one overlay at a time, the wizard (`add`, never without a profile) or the drawer of a listed source. */
function SourcesOverlay({
  url,
  platforms,
  wizardBlocked,
}: {
  url: SourcesUrl;
  platforms: readonly Platform[];
  wizardBlocked: boolean;
}) {
  const open = drawerSource(url, platforms);
  if (url.adding) return wizardBlocked ? null : <Wizard url={url} platforms={platforms} />;
  return open ? (
    <SourceDrawer key={open.id} platform={open} onClose={url.close} onDeleted={url.close} />
  ) : null;
}

function Wizard({ url, platforms }: { url: SourcesUrl; platforms: readonly Platform[] }) {
  return (
    <AddSourceWizard
      platforms={platforms}
      onClose={url.close}
      onOpenSource={url.openSource}
      // The wizard puts focus on the new row from its own unmount (preflight ruling 15).
      onCreated={url.close}
    />
  );
}
