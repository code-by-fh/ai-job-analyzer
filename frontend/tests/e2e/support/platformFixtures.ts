import type { CrawlStatusBody } from "../../../src/api/crawl";
import type { ChannelStatusBody, NotificationTemplateBody } from "../../../src/api/notifications";
import type { PlatformBody } from "../../../src/api/platforms";

// One platform set for every spec (G18): fixed error codes, finished runs, and the running crawl of
// AUTHENTICATED_ROUTES belongs to StepStone (same URL, platform_id 1).
export const STEPSTONE: PlatformBody = {
  id: 1,
  name: "StepStone",
  url: "https://www.stepstone.de/jobs/kotlin",
  is_active: true,
  setup_status: "active",
  url_pattern: "/stellenangebote--",
  schedule_time: "14:00",
  schedule_days: [0, 1, 2, 3, 4],
  last_run: {
    started_at: "2026-10-08T05:55:00+00:00",
    finished_at: "2026-10-08T06:00:00+00:00",
    found: 12,
    new: 5,
    matched: 3,
    seeded: false,
    error: null,
  },
  notification_adapters: ["PUSHOVER"],
  pushover_template: null,
};

export const INDEED: PlatformBody = {
  id: 2,
  name: "Indeed",
  url: "https://de.indeed.com/jobs?q=kotlin",
  is_active: true,
  setup_status: "active",
  url_pattern: "/viewjob?jk=",
  last_run: {
    finished_at: "2026-10-07T06:00:00+00:00",
    found: 0,
    new: 0,
    matched: 0,
    seeded: false,
    error: "unreachable",
  },
  notification_adapters: [],
};

export const PLATFORMS: PlatformBody[] = [STEPSTONE, INDEED];

export const RUNNING_CRAWL = {
  job_id: "crawl-1",
  platform: STEPSTONE.url,
  platform_id: STEPSTONE.id,
  status: "crawling",
  total: 12,
  scraping_completed: 5,
};

export const CRAWL_STATUS: CrawlStatusBody = { jobs: [RUNNING_CRAWL] };

// Which channels have credentials (booleans only, as GET /notification-settings/channels answers).
export const CHANNELS: ChannelStatusBody = {
  PUSHOVER: true,
  RESEND: false,
  MAILJET: false,
  SMTP: true,
};
export const TEMPLATES: NotificationTemplateBody[] = [
  {
    id: 4,
    name: "Kurz",
    type: "PUSHOVER",
    content: "$title bei $company ($match_score)",
    is_admin: false,
  },
  {
    id: 5,
    name: "Wochenmail",
    type: "RESEND",
    content: "{{#jobs}}$title{{/jobs}}",
    is_admin: true,
  },
];
