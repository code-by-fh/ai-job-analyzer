import { API_BASE_URL } from "@/config";
import { createApiClient } from "./client";
import { redirectToLogin } from "./session";

/** The app-wide client; a session that cannot be refreshed ends on /login?next=. */
export const api = createApiClient({ baseUrl: API_BASE_URL, onAuthLost: redirectToLogin });
