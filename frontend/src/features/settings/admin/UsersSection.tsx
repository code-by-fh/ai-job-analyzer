"use client";

import type { SettingsSectionProps } from "../SettingsPage";
import { SettingsSectionFrame } from "../SettingsSectionFrame";
import { CreateUserForm } from "./CreateUserForm";
import { UserList } from "./UserList";

/** Benutzer (D5): the installation's users and creating a member. */
export function UsersSection({ report }: SettingsSectionProps) {
  return (
    <SettingsSectionFrame section="users">
      <div className="form-max">
        <UserList />
        <CreateUserForm report={report} />
      </div>
    </SettingsSectionFrame>
  );
}
