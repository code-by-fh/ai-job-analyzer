"use client";

import { useState } from "react";
import type { Platform } from "@/api/platforms";
import { safeHref } from "@/domain/links";
import { Monogram } from "@/ui/Monogram";

// The server asks Google's favicon service for 64 px; shown at 24 px, so it stays sharp on 2x screens.
const ICON_PX = 24;

/**
 * The target site's favicon, as in the old UI; the source's initials when there is none or it does
 * not load. Decorative: the name next to it names the row. No referrer, so the icon service never
 * learns which page of this app asked.
 */
export function SourceIcon({ platform }: { platform: Pick<Platform, "name" | "favicon_url"> }) {
  const src = safeHref(platform.favicon_url);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="src-icon" aria-hidden="true">
      {src && failed !== src ? (
        <Favicon src={src} onError={() => setFailed(src)} />
      ) : (
        <Monogram name={platform.name} />
      )}
    </span>
  );
}

function Favicon({ src, onError }: { src: string; onError: () => void }) {
  return (
    // A plain <img>: next/image would fetch the remote icon through the Next server.
    <img
      src={src}
      alt=""
      width={ICON_PX}
      height={ICON_PX}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
