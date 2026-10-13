"use client";

import { LogOut, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/useI18n";
import { useActivity } from "@/realtime/useActivity";
import { Button } from "@/ui/Button";
import { Drawer } from "@/ui/Drawer";
import { Icon } from "@/ui/Icon";
import { PanelHeader } from "@/ui/PanelHeader";
import { ActivityPanel } from "./ActivityPanel";
import { requestSearch } from "./GlobalSearch";
import { isActivePath, MORE_NAV } from "./navigation";
import { PreferenceSegs } from "./PreferenceOptions";
import { useLogout } from "./useLogout";

export interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
}

/** Mobile "Mehr": profile, settings, activity, appearance, language and logout. */
export function MoreSheet({ open, onClose, signedIn }: MoreSheetProps) {
  const { t } = useI18n();
  return (
    <Drawer open={open} onClose={onClose} label={t("nav.more")} variant="sheet">
      <div className="panel-in">
        <PanelHeader title={t("nav.more")} onClose={onClose} />
        <MoreLinks onNavigate={onClose} />
        <MoreBody signedIn={signedIn} />
      </div>
    </Drawer>
  );
}

function MoreLinks({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="nav nav-sheet" aria-label={t("nav.more")}>
      {MORE_NAV.map((item) => (
        <MoreLink key={item.href} item={item} onNavigate={onNavigate} />
      ))}
      <button type="button" onClick={() => openSearch(onNavigate)}>
        <Icon icon={Search} />
        <span>{t("search.label")}</span>
      </button>
    </nav>
  );
}

function MoreLink({
  item,
  onNavigate,
}: {
  item: (typeof MORE_NAV)[number];
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  return (
    <Link
      href={item.href}
      aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon icon={item.icon} />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}

// Close the sheet first so the search dialog is not stacked on top of it.
function openSearch(closeSheet: () => void): void {
  closeSheet();
  requestSearch();
}

function MoreBody({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const activity = useActivity(signedIn);
  const logout = useLogout();
  return (
    <>
      <hr className="div" />
      <ActivityPanel activity={activity} />
      <hr className="div" />
      <PreferenceSegs />
      <hr className="div" />
      <Button variant="ghost" icon={LogOut} onClick={logout}>
        {t("user.logout")}
      </Button>
    </>
  );
}
