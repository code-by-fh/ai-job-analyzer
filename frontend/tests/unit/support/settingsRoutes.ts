import type { CurrentUserBody } from "@/api/auth";
import { CHANNEL_TYPES, CHANNELS } from "../../e2e/support/notificationFixtures";
import type { RouteTable } from "./stubRoutes";

/** What GET /settings answers for the settings page's readers (time zone, language). */
export const STORED_SETTINGS: Record<string, unknown> = {
  timezone: "Europe/Berlin",
  language: "de",
  role: "Lead",
};
const USER: CurrentUserBody = { id: 2, username: "jonas", is_admin: false };

/** The service's channel types and the user's channels (the e2e literals, no drift). */
export const CHANNEL_ROUTES: RouteTable = {
  "GET /notifications/channel-types": { items: CHANNEL_TYPES },
  "GET /notifications/channels": { items: CHANNELS, total: CHANNELS.length },
};

/** Everything /settings loads; `overrides` replaces or adds routes. */
export function settingsStubs(overrides: RouteTable = {}): RouteTable {
  return {
    "GET /settings": STORED_SETTINGS,
    ...CHANNEL_ROUTES,
    "GET /notification-templates": [],
    "GET /platforms": [],
    "GET /me": USER,
    ...overrides,
  };
}
