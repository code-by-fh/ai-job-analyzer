"use client";

import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { usersQueryOptions, type AdminUser } from "@/api/admin";
import { ADMIN_LIMITS } from "@/api/adminPaths";
import { SectionState } from "@/features/profile/SectionState";
import { useCurrentUser } from "@/features/shell/useCurrentUser";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "@/ui/Button";
import { Tag } from "@/ui/Tag";
import { settingsHeadingId } from "../labels";
import { DeleteUserDialog } from "./DeleteUserDialog";

interface UserRowsProps {
  users: readonly AdminUser[];
  /** The signed-in admin's id; undefined while /me loads (no row is marked, none deletable). */
  me: number | undefined;
  onDelete: (user: AdminUser) => void;
}

/** D5: only another member can be deleted here; the server refuses self and admins anyway (409). */
const deletable = (user: AdminUser, me: number | undefined) =>
  me !== undefined && user.id !== me && !user.is_admin;

function UserRow({ user, me, onDelete }: { user: AdminUser } & Omit<UserRowsProps, "users">) {
  const { t } = useI18n();
  return (
    <li>
      <span className="user-name">{user.username}</span>
      <Tag>{t(user.is_admin ? "user.roleAdmin" : "user.roleMember")}</Tag>
      {user.id === me ? <span className="meta">{t("settings.users.you")}</span> : null}
      {deletable(user, me) ? (
        <Button
          variant="ghost"
          className="btn-danger user-delete"
          iconOnly
          icon={Trash2}
          aria-label={t("settings.users.delete", { name: user.username })}
          onClick={() => onDelete(user)}
        />
      ) : null}
    </li>
  );
}

/** Fixed lines under the list: nobody else yet, or R10's cut page (no paging UI). */
function ListNotes({ users, me }: Omit<UserRowsProps, "onDelete">) {
  const { t } = useI18n();
  const nobodyElse = users.every((user) => user.id === me);
  const cut = users.length >= ADMIN_LIMITS.usersPage;
  return (
    <>
      {nobodyElse ? <p className="meta">{t("settings.users.empty")}</p> : null}
      {cut ? (
        <p className="meta">{t("settings.users.truncated", { count: ADMIN_LIMITS.usersPage })}</p>
      ) : null}
    </>
  );
}

function UserRows({ users, me, onDelete }: UserRowsProps) {
  return (
    <>
      <ul role="list" className="user-list" aria-labelledby={settingsHeadingId("users")}>
        {users.map((user) => (
          <UserRow key={user.id} user={user} me={me} onDelete={onDelete} />
        ))}
      </ul>
      <ListNotes users={users} me={me} />
    </>
  );
}

/** The users of the installation; the query lives here, so only an admin who opens it sends it. */
export function UserList() {
  const query = useQuery(usersQueryOptions());
  const me = useCurrentUser().data?.id;
  const [target, setTarget] = useState<AdminUser | null>(null);
  return (
    <div className="settings-block">
      <SectionState query={query}>
        {(users) => <UserRows users={users} me={me} onDelete={setTarget} />}
      </SectionState>
      {target ? <DeleteUserDialog user={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}
