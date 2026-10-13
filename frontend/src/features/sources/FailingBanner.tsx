"use client";

import type { Platform } from "@/api/platforms";
import { lastRunOf, RUN_ERROR_LABEL } from "@/domain/runLine";
import { failingSources } from "@/domain/sources";
import type { Translate } from "@/i18n/translate";
import { formatDayTime } from "@/i18n/formatDayTime";
import { useI18n } from "@/i18n/useI18n";
import { useNow } from "@/lib/clock";
import { Notice } from "@/ui/Notice";

interface BannerProps {
  platforms: readonly Platform[];
  onOpen: (id: number) => void;
}

function bannerTitle(count: number, t: Translate): string {
  return count === 1 ? t("sources.banner.titleOne") : t("sources.banner.title", { count });
}

/**
 * D3: failing sources on top, crimson with icon and words, one button per source that opens its
 * drawer. It describes a state on load, so it is not announced (announce={false}).
 */
export function FailingBanner({ platforms, onOpen }: BannerProps) {
  const { t } = useI18n();
  const failing = failingSources(platforms);
  if (failing.length === 0) return null;
  return (
    <div className="src-banner">
      <Notice tone="error" announce={false}>
        <p className="src-banner-title">{bannerTitle(failing.length, t)}</p>
        <ul role="list" className="src-banner-list">
          {failing.map((platform) => (
            <BannerItem key={platform.id} platform={platform} onOpen={onOpen} />
          ))}
        </ul>
      </Notice>
    </div>
  );
}

function BannerItem({ platform, onOpen }: { platform: Platform; onOpen: (id: number) => void }) {
  const { t, language } = useI18n();
  const now = useNow();
  const run = lastRunOf(platform);
  if (!run?.error) return null;
  const when = formatDayTime(run.finishedAt, t, { now, language });
  const reason = t(RUN_ERROR_LABEL[run.error]);
  return (
    <li>
      <button type="button" className="link" onClick={() => onOpen(platform.id)}>
        {t("sources.banner.item", { name: platform.name, reason, when })}
      </button>
    </li>
  );
}
