// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { CrawlStatusBody } from "../../../src/api/crawl";
import {
  CANCEL_CRAWL_PATH,
  NOTIFICATION_TEMPLATES_PATH,
  PLATFORMS_PATH,
  platformCrawlPath,
  platformNamePath,
  platformPath,
  platformRunsPath,
  PLATFORM_SETUP_PATH,
  PREVIEW_LINKS_PATH,
  RUN_HISTORY_SIZE,
  URL_PATTERN_PATH,
} from "../../../src/api/platformPaths";
import { CHANNEL_LIMITS } from "../../../src/api/notificationPaths";
import type {
  PlatformBody,
  PlatformRunBody,
  PlatformSetupRequest,
  PreviewLinksBody,
} from "../../../src/api/platforms";
import type { SetupStatusBody } from "../../../src/api/setup";
import { PENDING_SETUP } from "../../../src/domain/sources";
import { AUTHENTICATED_ROUTES, SETUP_DONE } from "./fixtures";
import { pushEvent } from "./jobFixtures";
import {
  live,
  reply,
  setRoutes,
  type ApiLog,
  type MockResponse,
  type MockRoutes,
  type MutableRoutes,
} from "./mockApi";
import { NotificationServer, notificationRoutes } from "./notificationServer";
import { INDEED, PLATFORMS, RUNNING_CRAWL, STEPSTONE, TEMPLATES } from "./platformFixtures";

interface Crawl {
  id: string;
  total: number;
  done: number;
  /** Epoch ms as a string, like the scraper's hash. */
  startedAt: string;
}

type RunningCrawl = typeof RUNNING_CRAWL;

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const CANCELLED_AT = "2026-10-08T08:01:00+00:00";

// core/platform_rules.py and PlatformUpdate (database/core.py).
const SCHEDULE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_COUNT = 7;
const MAX_SCHEDULE_TIMES = 6;
const MAX_NAME_LENGTH = 100;
const MAX_PATTERN_LENGTH = 300;
const PATCHABLE = new Set([
  "name",
  "url",
  "url_pattern",
  "is_active",
  "schedule_times",
  "schedule_days",
  "notification_channel_ids",
  "pushover_template",
  "resend_template",
  "mailjet_template",
  "smtp_template",
  "resend_recipients",
  "mailjet_recipients",
  "smtp_recipients",
]);
// update_platform applies these only when `is not None`: a null leaves the stored value as it is.
const NULL_IS_UNSET = ["name", "url", "url_pattern", "is_active"];
// update_platform stores "" and [] of these as null (`or None`).
const EMPTY_IS_NULL = [
  "pushover_template",
  "resend_template",
  "mailjet_template",
  "smtp_template",
  "resend_recipients",
  "mailjet_recipients",
  "smtp_recipients",
];
// The literal-address part of core/url_safety.py; the fake resolves no DNS.
const PRIVATE_HOST =
  /^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.|\[)/;
const WWW = /^www\./;
// routers/platforms.py _PATTERN_DELIMS.
const PATTERN_DELIMS = "/-_=?&.";
const NO_SCHEDULE = { schedule_times: null, schedule_days: null };

// The prototype's FOUND_LINKS on get-in-it.de (renderAddSource): six postings and one navigation link.
export const FOUND_LINKS: PreviewLinksBody["links"] = [
  {
    url: "https://www.get-in-it.de/jobsuche/p/senior-java-developer-hamburg-48211",
    text: "Senior Java Developer (m/w/d) – Hamburg",
  },
  {
    url: "https://www.get-in-it.de/jobsuche/p/backend-entwickler-kotlin-48190",
    text: "Backend-Entwickler Kotlin",
  },
  {
    url: "https://www.get-in-it.de/jobsuche/p/software-engineer-payments-48177",
    text: "Software Engineer Payments",
  },
  {
    url: "https://www.get-in-it.de/jobsuche/p/teamlead-backend-java-48160",
    text: "Teamlead Backend (Java)",
  },
  {
    url: "https://www.get-in-it.de/jobsuche/p/cloud-engineer-aws-48102",
    text: "Cloud Engineer AWS",
  },
  {
    url: "https://www.get-in-it.de/jobsuche/p/java-entwickler-logistik-48099",
    text: "Java-Entwickler Logistik",
  },
  { url: "https://www.get-in-it.de/unternehmen/top-arbeitgeber", text: "Unternehmen entdecken" },
];
// A page the render service reads without any link.
const EMPTY_HOST = "leer.example.com";

type Sent = Record<string, unknown>;
type LastRun = NonNullable<PlatformBody["last_run"]>;

// The jobs the user found from each fixture source; a delete keeps them (G7).
const KEPT_JOBS: ReadonlyArray<[number, number]> = [
  [STEPSTONE.id, 4],
  [INDEED.id, 0],
];

const newestFirst = (a: PlatformRunBody, b: PlatformRunBody) =>
  b.finished_at.localeCompare(a.finished_at);

/** The history row record_platform_run writes from the same counters as last_run. */
function runOf(lastRun: LastRun): PlatformRunBody {
  if (!lastRun.finished_at) throw new Error("sources server: a finished run needs finished_at");
  return {
    started_at: lastRun.started_at,
    finished_at: lastRun.finished_at,
    found: lastRun.found ?? 0,
    new: lastRun.new ?? 0,
    matched: lastRun.matched ?? 0,
    seeded: lastRun.seeded ?? false,
    error: lastRun.error,
  };
}

/** A 422 as FastAPI shapes it: the field's loc and a fixed code, never the value sent. */
const invalid = (field: string) =>
  reply(HTTP_UNPROCESSABLE, {
    detail: [{ loc: ["body", field], msg: "invalid", type: "value_error" }],
  });

/** The canonical form the server stores (lower case, IDN as punycode), or null when refused. */
function canonicalUrl(text: unknown): string | null {
  if (typeof text !== "string" || !URL.canParse(text)) return null;
  const url = new URL(text);
  const fetchable = (url.protocol === "http:" || url.protocol === "https:") && !url.username;
  return fetchable && !PRIVATE_HOST.test(url.hostname) ? url.href : null;
}

const siteOf = (url: string) => new URL(url).host.replace(WWW, "");

function badDays(days: unknown): boolean {
  if (days === null) return false;
  if (!Array.isArray(days) || days.length === 0) return true;
  const valid = days.every((day) => Number.isInteger(day) && day >= 0 && day < WEEKDAY_COUNT);
  return !valid || new Set(days).size !== days.length;
}

function badText(value: unknown, max: number, onlySlashes = false): boolean {
  const text = typeof value === "string" ? value.trim() : "";
  const empty = onlySlashes ? text.replaceAll("/", "") === "" : text === "";
  return empty || text.length > max;
}

function badTimes(times: unknown): boolean {
  if (!Array.isArray(times) || times.length === 0 || times.length > MAX_SCHEDULE_TIMES) return true;
  const valid = times.every((time) => typeof time === "string" && SCHEDULE_TIME.test(time));
  return !valid || new Set(times).size !== times.length;
}

/** The field validators, in the order of the model; the first refused field answers. */
function fieldError(sent: Sent): string | null {
  const times = sent.schedule_times;
  if ("schedule_times" in sent && times !== null && badTimes(times)) {
    return "schedule_times";
  }
  if ("schedule_days" in sent && badDays(sent.schedule_days)) return "schedule_days";
  if ("name" in sent && badText(sent.name, MAX_NAME_LENGTH)) return "name";
  if ("url_pattern" in sent && badText(sent.url_pattern, MAX_PATTERN_LENGTH, true)) {
    return "url_pattern";
  }
  if ("notification_channel_ids" in sent && badChannelIds(sent.notification_channel_ids)) {
    return "notification_channel_ids";
  }
  return "url" in sent && canonicalUrl(sent.url) === null ? "url" : null;
}

/**
 * PlatformUpdate: at most 20 ids. Not modelled: the check that each id is one of the user's
 * channels (the web only offers those) and the de-duplication.
 */
function badChannelIds(ids: unknown): boolean {
  if (!Array.isArray(ids) || ids.length > CHANNEL_LIMITS.channels) return true;
  return !ids.every((id) => typeof id === "string");
}

function withoutUnsetNulls(sent: Sent): Sent {
  return Object.fromEntries(
    Object.entries(sent).filter(([key, value]) => value !== null || !NULL_IS_UNSET.includes(key)),
  );
}

/** Checked only when the schedule was touched; "days without time" lands on schedule_times. */
function scheduleHalfMissing(
  stored: Pick<PlatformBody, "schedule_times" | "schedule_days">,
  sent: Sent,
): string | null {
  if (!("schedule_times" in sent || "schedule_days" in sent)) return null;
  const time = "schedule_times" in sent ? sent.schedule_times : stored.schedule_times;
  const days = "schedule_days" in sent ? sent.schedule_days : stored.schedule_days;
  if ((time == null) === (days == null)) return null;
  return time == null ? "schedule_times" : "schedule_days";
}

/** The stored values: trimmed, sorted, canonical, "" and [] as null (the fake keeps no favicon). */
function normalised(sent: Sent): Partial<PlatformBody> {
  const stored: Sent = { ...sent };
  if (typeof sent.name === "string") stored.name = sent.name.trim();
  if (typeof sent.url_pattern === "string") stored.url_pattern = sent.url_pattern.trim();
  if ("url" in sent) stored.url = canonicalUrl(sent.url);
  if (Array.isArray(sent.schedule_times))
    stored.schedule_times = [...(sent.schedule_times as string[])].sort();
  if (Array.isArray(sent.schedule_days))
    stored.schedule_days = [...(sent.schedule_days as number[])].sort((a, b) => a - b);
  for (const key of EMPTY_IS_NULL) {
    const value = sent[key];
    if (key in sent && (value === "" || (Array.isArray(value) && value.length === 0))) {
      stored[key] = null;
    }
  }
  return stored as Partial<PlatformBody>;
}

const patternKey = (url: string) => {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
};

/** One example has no divergence point: cut at the first delimiter after the leading slash. */
function firstSegment(key: string): string {
  const cut = [...key].findIndex((char, index) => index > 0 && PATTERN_DELIMS.includes(char));
  return cut > 0 ? key.slice(0, cut) : key;
}

/** The character-level common prefix, cut back to its last delimiter. */
function sharedPrefix(keys: readonly string[]): string {
  let prefix = keys[0] ?? "";
  for (const key of keys) while (!key.startsWith(prefix)) prefix = prefix.slice(0, -1);
  if (!prefix || PATTERN_DELIMS.includes(prefix.at(-1)!)) return prefix;
  const cut = Math.max(...[...PATTERN_DELIMS].map((delim) => prefix.lastIndexOf(delim)));
  return cut > 0 ? prefix.slice(0, cut + 1) : prefix;
}

/** server/routers/platforms.py `_infer_url_pattern`: never only slashes (it would match every link). */
export function inferPattern(urls: readonly string[]): string {
  const keys = urls.filter(Boolean).map(patternKey);
  if (keys.length === 0) return "";
  const pattern = keys.length === 1 ? firstSegment(keys[0]!) : sharedPrefix(keys);
  if (pattern.replaceAll("/", "") !== "") return pattern;
  const segment = new URL(urls[0]!).pathname.split("/").find(Boolean);
  return segment ? `/${segment}` : keys[0]!;
}

/**
 * What the server keeps for /sources: platforms, their run history and running crawls
 * (server/routers/platforms.py and scraper_api.py rules).
 */
export class SourcesServer {
  protected readonly platforms = new Map<number, PlatformBody>();
  /** Platform id -> its running crawl, as the scraper's Redis registry (one per platform). */
  readonly running = new Map<number, Crawl>();
  /** Platform id -> how many of the user's jobs came from it; a delete keeps them. */
  readonly keptJobs = new Map<number, number>(KEPT_JOBS);
  private readonly runs = new Map<number, PlatformRunBody[]>();
  private crawlSeq = 1;
  /** The user's channels the drawer offers (a cross-page spec passes the settings' routes instead). */
  readonly notifications = new NotificationServer();

  constructor(
    platforms: readonly PlatformBody[] = PLATFORMS,
    running: readonly RunningCrawl[] = [RUNNING_CRAWL],
  ) {
    for (const platform of platforms) this.platforms.set(platform.id, structuredClone(platform));
    for (const crawl of running) {
      this.running.set(crawl.platform_id, {
        id: crawl.job_id,
        total: crawl.total,
        done: crawl.scraping_completed,
        startedAt: crawl.started_at,
      });
    }
  }

  get(id: number): PlatformBody {
    const platform = this.platforms.get(id);
    if (!platform) throw new Error(`sources server: no platform ${id}`);
    return platform;
  }

  list(): PlatformBody[] {
    return [...this.platforms.values()].map((platform) => structuredClone(platform));
  }

  /**
   * POST /platforms/{id}/crawl: one crawl per platform (409), a paused or unfinished source is
   * refused (400). Not modelled: the 502 for any other scraper refusal and the last_crawl_at stamp.
   */
  crawl(id: number): unknown {
    const platform = this.get(id);
    if (platform.is_active === false)
      return reply(HTTP_BAD_REQUEST, { detail: "Platform is deactivated" });
    if (platform.setup_status === PENDING_SETUP) {
      return reply(HTTP_BAD_REQUEST, { detail: "Platform setup not completed" });
    }
    if (this.running.has(id)) return reply(HTTP_CONFLICT, { detail: "Crawl already running" });
    this.crawlSeq += 1;
    const crawl = {
      id: `crawl-${this.crawlSeq}`,
      total: 0,
      done: 0,
      startedAt: String(Date.now()),
    };
    this.running.set(id, crawl);
    return { status: "Started", job_id: crawl.id };
  }

  /**
   * PATCH /platforms/{id}: partial, validated like update_platform, answers the stored platform
   * (never the request). A URL change stays on the site and must not be another source (400).
   * Differences, on purpose: a 422 names only the first refused field (pydantic lists all of
   * them; the web shows each on its field either way), and is_notification_enabled and the job
   * count are not kept (the web reads neither).
   */
  patch(id: number, sent: unknown): unknown {
    const body = withoutUnsetNulls((sent ?? {}) as Sent);
    const foreign = Object.keys(body).filter((key) => !PATCHABLE.has(key));
    if (foreign.length > 0)
      throw new Error(`sources server: unknown PATCH field ${foreign.join()}`);
    const field = fieldError(body);
    if (field) return invalid(field);
    const stored = normalised(body);
    // update_platform's order: the URL change (400) before the schedule pair check (422).
    if (stored.url && this.urlRefused(id, stored.url)) {
      return reply(HTTP_BAD_REQUEST, { detail: "Platform URL refused" });
    }
    const half = scheduleHalfMissing(this.get(id), body);
    if (half) return invalid(half);
    Object.assign(this.get(id), stored);
    return structuredClone(this.get(id));
  }

  /** Another site, or the address of another source of this user. */
  private urlRefused(id: number, url: string): boolean {
    if (siteOf(url) !== siteOf(this.get(id).url)) return true;
    return this.list().some((platform) => platform.id !== id && platform.url === url);
  }

  /**
   * POST /platforms/preview-links: the URL guard's 422 on `url` for an internal or non-http target,
   * no links for an empty page, else the found links of that host. Not modelled: the 500 of a page
   * the render service cannot load.
   */
  previewLinks(sent: unknown): unknown {
    const url = canonicalUrl((sent as { url?: unknown } | null)?.url);
    if (url === null) return invalid("url");
    const { host } = new URL(url);
    if (host === EMPTY_HOST) return { links: [] };
    return { links: FOUND_LINKS.filter((link) => new URL(link.url).host === host) };
  }

  /**
   * POST /platforms/setup in the server's order: the field validators (422, the first refused
   * field only), the schedule pair (422), then a source with that address (400; a pending legacy
   * row is reused, D15). The first run (B8): seed and analyze both crawl now, only "analyze" is
   * reported as started. Not modelled: the AI name (the fake names it "<host> Jobs") and a
   * refused scraper start. sourcesRoutes registers the new source's per-id routes.
   */
  setup(sent: unknown): unknown {
    const body = (sent ?? {}) as Sent;
    const refused = this.setupRefusal(body);
    if (refused) return refused;
    const request = body as unknown as PlatformSetupRequest;
    const platform = this.created(request, normalised(withoutUnsetNulls(body)));
    this.platforms.set(platform.id, platform);
    if (request.initial_run !== "none") {
      const startedAt = String(Date.now());
      this.running.set(platform.id, {
        id: `crawl-setup-${platform.id}`,
        total: 0,
        done: 0,
        startedAt,
      });
    }
    return {
      ...structuredClone(platform),
      initial_crawl_started: request.initial_run === "analyze",
    };
  }

  private setupRefusal(body: Sent): unknown {
    const fields = withoutUnsetNulls(body);
    const selected = body.selected_urls;
    if (canonicalUrl(body.url) === null) return invalid("url");
    if (!Array.isArray(selected) || selected.length === 0) return invalid("selected_urls");
    const field = fieldError(fields) ?? scheduleHalfMissing(NO_SCHEDULE, body);
    if (field) return invalid(field);
    const url = canonicalUrl(body.url);
    const taken = this.list().some((p) => p.url === url && p.setup_status !== PENDING_SETUP);
    return taken ? reply(HTTP_BAD_REQUEST, { detail: "Platform URL already exists" }) : null;
  }

  /** A new row, or the pending legacy row of that address with the wizard's choices applied. */
  private created(request: PlatformSetupRequest, stored: Partial<PlatformBody>): PlatformBody {
    const url = stored.url!;
    const pending = this.list().find((platform) => platform.url === url);
    const id = pending?.id ?? Math.max(0, ...this.platforms.keys()) + 1;
    const base: PlatformBody = pending ?? {
      id,
      url,
      name: `${new URL(url).host} Jobs`,
      is_active: true,
      last_run: null,
      notification_channel_ids: [],
    };
    return {
      ...base,
      name: stored.name ?? base.name,
      setup_status: "active",
      url_pattern: stored.url_pattern ?? inferPattern(request.selected_urls),
      schedule_times: stored.schedule_times ?? null,
      schedule_days: stored.schedule_days ?? null,
      notification_channel_ids: stored.notification_channel_ids ?? base.notification_channel_ids,
    };
  }

  /** POST /platforms/url-pattern: the setup's own inference, 422 on an empty selection. */
  urlPattern(sent: unknown): unknown {
    const selected = (sent as { selected_urls?: unknown } | null)?.selected_urls;
    if (!Array.isArray(selected) || selected.length === 0) return invalid("selected_urls");
    return { url_pattern: inferPattern(selected as string[]) };
  }

  /** GET /setup-status as routers/settings.py computes it for this state (preflight ruling 19). */
  setupStatus(): SetupStatusBody {
    const hasJobs = [...this.keptJobs.values()].some((count) => count > 0);
    return { ...SETUP_DONE, has_source: this.platforms.size > 0, has_jobs: hasJobs };
  }

  /** POST /platforms/{id}/generate-name: the server stores the generated name right away. */
  suggestName(id: number): unknown {
    const platform = this.get(id);
    platform.name = `${platform.name} Jobs`;
    return { id, name: platform.name };
  }

  /** POST /scraper/cancel-crawl: the scraper answers 200 with a status, also when it refuses. */
  cancel(sent: unknown): unknown {
    const jobId = (sent as { job_id?: string } | null)?.job_id;
    const entry = [...this.running].find(([, crawl]) => crawl.id === jobId);
    if (!entry) return { status: "error", message: "Job not found" };
    this.finish(entry[0], { finished_at: CANCELLED_AT, error: "cancelled" });
    return { status: "success", message: "Crawl job cancelled" };
  }

  /** The end of a crawl as record_platform_run writes it: last_run and a history row. */
  finish(id: number, lastRun: LastRun): void {
    this.running.delete(id);
    const run = { found: 0, new: 0, matched: 0, seeded: false, ...lastRun };
    this.get(id).last_run = run;
    this.addRuns(id, [runOf(run)]);
  }

  /** Earlier runs of a source, e.g. for the drawer's history. */
  addRuns(id: number, runs: readonly PlatformRunBody[]): void {
    this.get(id);
    this.runs.set(id, [...(this.runs.get(id) ?? []), ...structuredClone(runs)].sort(newestFirst));
  }

  /** All stored runs, newest first. Not modelled: the server keeps only the newest 20. */
  runsOf(id: number): PlatformRunBody[] {
    return structuredClone(this.runs.get(id) ?? []);
  }

  /** GET /platforms/{id}/runs?limit=10: owner-scoped, so a deleted source answers 404. */
  runsRoute(id: number): unknown {
    if (!this.platforms.has(id)) return reply(HTTP_NOT_FOUND, { detail: "Platform not found" });
    return this.runsOf(id).slice(0, RUN_HISTORY_SIZE);
  }

  /**
   * DELETE /platforms/{id}: 409 while a crawl of the source runs; otherwise the source and its
   * history go and its jobs stay without a source (G7).
   */
  delete(id: number): unknown {
    if (!this.platforms.has(id)) return reply(HTTP_NOT_FOUND, { detail: "Platform not found" });
    if (this.running.has(id)) return reply(HTTP_CONFLICT, { detail: "Crawl running" });
    this.platforms.delete(id);
    this.runs.delete(id);
    return { status: "deleted", kept_jobs: this.keptJobs.get(id) ?? 0 };
  }

  crawlStatus(): CrawlStatusBody {
    const jobs = [...this.running].map(([platformId, crawl]) => ({
      job_id: crawl.id,
      platform: this.get(platformId).url,
      platform_id: platformId,
      status: crawl.done > 0 ? "crawling" : "starting",
      total: crawl.total,
      scraping_completed: crawl.done,
      started_at: crawl.startedAt,
    }));
    return { jobs };
  }
}

/**
 * Everything /sources loads, answered from the server's state. A journey that also needs the inbox
 * passes its routes as `base`, so their keys are not overridden (preflight ruling 20).
 */
export function sourcesRoutes(
  server = new SourcesServer(),
  extra: MockRoutes = {},
  base: MockRoutes = AUTHENTICATED_ROUTES,
): MutableRoutes {
  const routes: MutableRoutes = {
    ...base,
    [`GET ${PLATFORMS_PATH}`]: live(() => server.list()),
    "GET /scraper/crawl-status": live(() => server.crawlStatus()),
    [`GET ${NOTIFICATION_TEMPLATES_PATH}`]: { body: TEMPLATES },
    ...notificationRoutes(server.notifications),
    [`POST ${PREVIEW_LINKS_PATH}`]: live((sent) => server.previewLinks(sent)),
    [`POST ${URL_PATTERN_PATH}`]: live((sent) => server.urlPattern(sent)),
    [`POST ${PLATFORM_SETUP_PATH}`]: live((sent) => setupWithRoutes(server, routes, sent)),
    "GET /setup-status": live(() => server.setupStatus()),
    ...platformRoutes(server),
    ...extra,
  };
  return routes;
}

/**
 * A source the wizard creates gets its per-id routes (crawl, PATCH, history, ...) like the fixture
 * sources, so a later step can open or crawl it. They go into the very object handed to mockApi,
 * which looks routes up per request; a spec that copies the routes must pass the copy instead.
 */
function setupWithRoutes(server: SourcesServer, routes: MutableRoutes, sent: unknown): unknown {
  const known = new Set(server.list().map(({ id }) => id));
  const answer = server.setup(sent);
  for (const { id } of server.list()) {
    if (!known.has(id)) setRoutes(routes, sourceRoutes(server, id));
  }
  return answer;
}

/** The calls per platform (Durchsuchen, PATCH, Namen vorschlagen, history, delete) and Abbrechen, by the server's rules. */
export function platformRoutes(server: SourcesServer): MockRoutes {
  const routes: Record<string, MockResponse> = {
    [`POST ${CANCEL_CRAWL_PATH}`]: live((sent) => server.cancel(sent)),
  };
  for (const { id } of server.list()) Object.assign(routes, sourceRoutes(server, id));
  return routes;
}

/** The per-id calls of one source. */
function sourceRoutes(server: SourcesServer, id: number): MockRoutes {
  return {
    [`POST ${platformCrawlPath(id)}`]: live(() => server.crawl(id)),
    [`PATCH ${platformPath(id)}`]: live((sent) => server.patch(id, sent)),
    [`DELETE ${platformPath(id)}`]: live(() => server.delete(id)),
    [`GET ${platformRunsPath(id)}`]: live(() => server.runsRoute(id)),
    [`POST ${platformNamePath(id)}`]: live(() => server.suggestName(id)),
  };
}

interface CrawlEnd {
  platformId: number;
  type: "crawl_job_completed" | "crawl_job_failed" | "crawl_job_cancelled";
  lastRun: LastRun;
}

/** Ends a running crawl on the server and tells the page, as the worker would. */
export function finishCrawl(log: ApiLog, server: SourcesServer, end: CrawlEnd): void {
  const crawl = server.running.get(end.platformId);
  if (!crawl) throw new Error(`sources server: no crawl runs for platform ${end.platformId}`);
  server.finish(end.platformId, end.lastRun);
  pushEvent(log, { type: end.type, job_id: crawl.id });
}
