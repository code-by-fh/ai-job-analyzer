"use client";

import { Ellipsis, LogOut, User } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { CurrentUser } from "@/api/auth";
import { useI18n } from "@/i18n/useI18n";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { ACCOUNT_HREF, initialOf } from "./navigation";
import { LanguageOptions, ThemeOptions } from "./PreferenceOptions";
import { useLogout } from "./useLogout";

/** Account, language, theme and logout (spec 4.1). */
export function UserMenu({ user }: { user: CurrentUser }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="pop-anchor">
      <UserButton user={user} open={open} onToggle={() => setOpen(!open)} />
      <Popover open={open} onClose={() => setOpen(false)} placement="up" label={t("user.menu")}>
        <UserMenuPanel user={user} onNavigate={() => setOpen(false)} />
      </Popover>
    </div>
  );
}

interface UserButtonProps {
  user: CurrentUser;
  open: boolean;
  onToggle: () => void;
}

function UserButton({ user, open, onToggle }: UserButtonProps) {
  return (
    <button
      type="button"
      className="side-btn"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="avatar" aria-hidden="true">
        {initialOf(user.username)}
      </span>
      <span>{user.username}</span>
      <Icon icon={Ellipsis} className="end" />
    </button>
  );
}

function UserMenuHead({ user }: { user: CurrentUser }) {
  const { t } = useI18n();
  return (
    <div className="pop-head">
      {user.username}
      <div className="meta faint font-normal">
        {t(user.is_admin ? "user.roleAdmin" : "user.roleMember")}
      </div>
    </div>
  );
}

function UserMenuPanel({ user, onNavigate }: { user: CurrentUser; onNavigate: () => void }) {
  const { t } = useI18n();
  const logout = useLogout();
  return (
    <>
      <UserMenuHead user={user} />
      <div className="pop-sep" />
      <Link className="pop-item" href={ACCOUNT_HREF} onClick={onNavigate}>
        <Icon icon={User} />
        {t("user.account")}
      </Link>
      <UserMenuPreferences />
      <button type="button" className="pop-item" onClick={logout}>
        <Icon icon={LogOut} />
        {t("user.logout")}
      </button>
    </>
  );
}

function UserMenuPreferences() {
  return (
    <>
      <div className="pop-sep" />
      <LanguageOptions />
      <div className="pop-sep" />
      <ThemeOptions />
      <div className="pop-sep" />
    </>
  );
}
