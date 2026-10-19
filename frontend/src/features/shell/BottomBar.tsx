"use client";

import { LoaderCircle, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useActivity } from "@/realtime/useActivity";
import { Icon } from "@/ui/Icon";
import { activityLabel } from "./ActivityButton";
import { MORE_BUTTON_ID } from "./crawl/CrawlStrip";
import { MoreSheet } from "./MoreSheet";
import { BOTTOM_BAR_NAV, isMoreActive, type NavItem } from "./navigation";
import { NavBadge } from "./Sidebar";
import { useActiveNavKey } from "./useActiveNavKey";
import { useNavCounts, type NavCounts } from "./useNavCounts";

/** Mobile navigation (below 768 px the sidebar is hidden). */
export function BottomBar({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const counts = useNavCounts(signedIn);
  const activeKey = useActiveNavKey(signedIn);
  return (
    <nav className="bottombar" aria-label={t("nav.main")}>
      {BOTTOM_BAR_NAV.map((item) => (
        <BottomBarLink key={item.key} item={item} active={activeKey === item.key} counts={counts} />
      ))}
      <MoreEntry active={isMoreActive(pathname)} signedIn={signedIn} />
    </nav>
  );
}

function MoreEntry({ active, signedIn }: { active: boolean; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MoreButton active={active} signedIn={signedIn} onOpen={() => setOpen(true)} />
      <MoreSheet open={open} onClose={() => setOpen(false)} signedIn={signedIn} />
    </>
  );
}

interface MoreButtonProps {
  active: boolean;
  signedIn: boolean;
  onOpen: () => void;
}

/** Background tasks live under "Mehr" on mobile, so it carries their busy signal (spec 4.1). */
function MoreButton({ active, signedIn, onOpen }: MoreButtonProps) {
  const { t } = useI18n();
  const running = useActivity(signedIn).running.length;
  return (
    <button
      id={MORE_BUTTON_ID}
      type="button"
      className="bb-item"
      aria-current={active ? "page" : undefined}
      onClick={onOpen}
    >
      <MoreIcon busy={running > 0} />
      <span>{t("nav.more")}</span>
      {running > 0 ? <BusyText label={activityLabel(running, t)} /> : null}
    </button>
  );
}

// The spinner is the one moving indicator the spec allows: a running crawl.
function MoreIcon({ busy }: { busy: boolean }) {
  return busy ? (
    <Icon icon={LoaderCircle} size="lg" className="spin" />
  ) : (
    <Icon icon={Menu} size="lg" />
  );
}

// The leading text node keeps a word break in the accessible name ("Mehr 1 Aufgabe läuft").
function BusyText({ label }: { label: string }) {
  return (
    <>
      {" "}
      <span className="sr-only">{label}</span>
    </>
  );
}

interface BottomBarLinkProps {
  item: NavItem;
  active: boolean;
  counts: NavCounts;
}

function BottomBarLink({ item, active, counts }: BottomBarLinkProps) {
  const { t } = useI18n();
  return (
    <Link className="bb-item" href={item.href} aria-current={active ? "page" : undefined}>
      <Icon icon={item.icon} size="lg" />
      <span>{t(item.labelKey)}</span>
      <NavBadge itemKey={item.key} counts={counts} compact />
    </Link>
  );
}
