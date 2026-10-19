import type { PlatformBody } from "@/api/platforms";
import { INDEED, STEPSTONE, TEMPLATES } from "../../e2e/support/platformFixtures";
import type { RecordedCall } from "./fakeFetch";
import { CHANNEL_ROUTES } from "./settingsRoutes";
import { stubRoutes, type RouteTable } from "./stubRoutes";

// The e2e literals themselves (preflight §4): unit and e2e sources cannot drift apart.
export const SOURCE_A: PlatformBody = STEPSTONE;
export const SOURCE_B: PlatformBody = INDEED;
export { TEMPLATES };

/** Everything /sources loads; `extra` overrides or adds routes (e.g. a crawl start). */
export function sourcesStubs(
  platforms: unknown = [SOURCE_A, SOURCE_B],
  extra: RouteTable = {},
): RecordedCall[] {
  return stubRoutes({
    "GET /platforms": platforms,
    "GET /scraper/crawl-status": { jobs: [] },
    ...CHANNEL_ROUTES,
    "GET /notification-templates": TEMPLATES,
    "GET /settings": { timezone: "Europe/Berlin" },
    "GET /platforms/1/runs": [],
    "GET /platforms/2/runs": [],
    ...extra,
  });
}
