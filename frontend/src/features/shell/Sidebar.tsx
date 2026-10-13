"use client";

import { Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/api/auth";
import { useI18n } from "@/i18n/useI18n";
import { CountBadge } from "@/ui/CountBadge";
import { Icon } from "@/ui/Icon";
import { ActivityButton } from "./ActivityButton";
import { requestSearch } from "./GlobalSearch";
import { isActivePath, MAIN_NAV, SETTINGS_HREF, type NavItem, type NavKey } from "./navigation";
import { ThemeButton } from "./ThemeButton";
import { useActiveNavKey } from "./useActiveNavKey";
import { useNavCounts, type NavCounts } from "./useNavCounts";
import { UserMenu } from "./UserMenu";

/** Desktop sidebar: always ink, large numbered navigation (prototype "shell"). */
export function Sidebar({ user }: { user: CurrentUser | undefined }) {
  const { t } = useI18n();
  const counts = useNavCounts(user !== undefined);
  const activeKey = useActiveNavKey(user !== undefined);
  return (
    <aside className="sidebar" aria-label={t("shell.sidebar")}>
      <div className="brand">
        <span className="brand-word">{t("app.name")}</span>
        <span className="brand-mark" aria-hidden="true" />
      </div>
      <nav className="nav" aria-label={t("nav.main")}>
        {MAIN_NAV.map((item) => (
          <NavLink key={item.key} item={item} counts={counts} active={activeKey === item.key} />
        ))}
      </nav>
      <SidebarFoot user={user} />
    </aside>
  );
}

interface NavLinkProps {
  item: NavItem;
  counts: NavCounts;
  active: boolean;
}

function NavLink({ item, counts, active }: NavLinkProps) {
  const { t } = useI18n();
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}>
      <span className="nav-no" aria-hidden="true">
        {item.number}
      </span>
      <span className="nav-label">{t(item.labelKey)}</span>
      <NavBadge itemKey={item.key} counts={counts} />
    </Link>
  );
}

export interface NavBadgeProps {
  itemKey: NavKey;
  counts: NavCounts;
  /** Bottom bar: source errors as an icon pill on the nav icon, the sentence for screen readers only. */
  compact?: boolean;
}

export function NavBadge({ itemKey, counts, compact = false }: NavBadgeProps) {
  const { t } = useI18n();
  if (itemKey === "inbox" && counts.inbox > 0) {
    return <CountBadge count={counts.inbox} label={t("nav.newMatches", { count: counts.inbox })} />;
  }
  if (itemKey === "applications" && counts.applicationsDue > 0) {
    const due = counts.applicationsDue;
    return <CountBadge count={due} label={t("nav.due", { count: due })} neutral />;
  }
  if (itemKey !== "sources" || counts.sourceErrors === 0) return null;
  const sentence = t("nav.sourceErrors", { count: counts.sourceErrors });
  return compact ? <ErrorPill sentence={sentence} /> : <ErrorWords sentence={sentence} />;
}

function ErrorWords({ sentence }: { sentence: string }) {
  return (
    <span className="count-plain t-danger">
      <Icon icon={TriangleAlert} />
      {sentence}
    </span>
  );
}

function ErrorPill({ sentence }: { sentence: string }) {
  return (
    <span className="count-badge count-badge-danger">
      <Icon icon={TriangleAlert} />
      <span className="sr-only">{sentence}</span>
    </span>
  );
}

/** D10: the "/" key alone is invisible, so the sidebar offers the search with its key hint. */
function SearchButton() {
  const { t } = useI18n();
  return (
    <button type="button" className="side-btn" onClick={requestSearch} aria-keyshortcuts="/">
      <Icon icon={Search} />
      <span>{t("search.label")}</span>
      <kbd className="end" aria-hidden="true">
        /
      </kbd>
    </button>
  );
}

function SidebarFoot({ user }: { user: CurrentUser | undefined }) {
  const { t } = useI18n();
  const active = isActivePath(usePathname() ?? "", SETTINGS_HREF);
  return (
    <div className="sidebar-foot">
      <ActivityButton enabled={user !== undefined} />
      <ThemeButton />
      <SearchButton />
      <Link className="side-btn" href={SETTINGS_HREF} aria-current={active ? "page" : undefined}>
        <Icon icon={SlidersHorizontal} />
        <span>{t("nav.settings")}</span>
      </Link>
      {user ? <UserMenu user={user} /> : null}
    </div>
  );
}
