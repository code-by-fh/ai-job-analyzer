import { z } from "zod";
import { api } from "./instance";

const currentUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  is_admin: z.boolean(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type CurrentUserBody = z.input<typeof currentUserSchema>;

export interface Credentials {
  username: string;
  password: string;
}

const statusSchema = z.object({ status: z.string() });

/** Sets the httpOnly session cookies; a 401 here means wrong credentials, not an expired session. */
export async function login(credentials: Credentials): Promise<void> {
  const form = { username: credentials.username, password: credentials.password };
  await api.request("/auth/login", statusSchema, { method: "POST", form, skipAuthRefresh: true });
}

/** Ends the session on every device: the server bumps the user's token version. */
export async function logout(): Promise<void> {
  await api.request("/auth/logout", statusSchema, { method: "POST", skipAuthRefresh: true });
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return api.request("/me", currentUserSchema);
}
