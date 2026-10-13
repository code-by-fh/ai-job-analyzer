import { ADMIN_REFUSAL } from "@/api/adminPaths";
import { HTTP_CONFLICT, type RefusalTable } from "@/features/profile/refusals";

/** routers/auth.py: POST /users and DELETE /users/{id} refuse with these codes (ruling 23, 14). */
export const USER_REFUSALS: RefusalTable = {
  field: "username",
  refusals: [
    { status: HTTP_CONFLICT, code: ADMIN_REFUSAL.usernameTaken, text: "settings.users.taken" },
    {
      status: HTTP_CONFLICT,
      code: ADMIN_REFUSAL.cannotDeleteSelf,
      text: "settings.users.cannotSelf",
    },
    {
      status: HTTP_CONFLICT,
      code: ADMIN_REFUSAL.cannotDeleteAdmin,
      text: "settings.users.cannotAdmin",
    },
    {
      status: HTTP_CONFLICT,
      code: ADMIN_REFUSAL.crawlRunning,
      text: "settings.account.crawlRunning",
    },
  ],
};
