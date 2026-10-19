import type { CompanyScope } from "./adminPaths";

/**
 * Query keys per resource (spec 6). src/realtime/applyEvent.ts invalidates with the same keys.
 * Everything that belongs to one job is nested under ["job", id], so one invalidation of
 * queryKeys.job(id) refreshes detail, history, documents and stored HTML together.
 */
export const queryKeys = {
  me: ["me"],
  languagePreference: ["settings", "language"],
  jobCounts: ["job-counts"],
  jobsRoot: ["jobs"],
  // Inbox lists and counters live under the jobs root, so every job event refreshes them.
  inboxList: (tab: string) => ["jobs", "inbox", tab] as const,
  inboxTotal: (tab: string) => ["jobs", "inbox-total", tab] as const,
  dueApplications: ["jobs", "due"],
  // Bewerbungen lists and the closed counter live under the jobs root too (realtime refreshes them).
  applicationsList: (group: string, q: string) => ["jobs", "applications", group, q] as const,
  applicationsTotal: (group: string, q: string) =>
    ["jobs", "applications-total", group, q] as const,
  matchThreshold: ["settings", "match-threshold"],
  thresholdDistribution: ["threshold-distribution"],
  thresholdPreviewRoot: ["threshold-preview"],
  thresholdPreview: (threshold: number) => ["threshold-preview", threshold] as const,
  setupStatus: ["setup-status"],
  // Imports started in this tab, finished by realtime events (src/realtime/imports.ts).
  imports: ["imports"],
  // Import events that arrived before their import was marked as started (replayed, then dropped).
  importEvents: ["import-events"],
  job: (id: string) => ["job", id] as const,
  jobHistory: (id: string) => ["job", id, "history"] as const,
  jobDocuments: (id: string) => ["job", id, "documents"] as const,
  jobDocumentHtml: (id: string, kind: string) => ["job", id, "html", kind] as const,
  // PDF bytes are immutable per stored version and large, so they live outside the job prefix.
  jobFiles: (jobId: string) => ["job-file", jobId] as const,
  jobFile: (jobId: string, docId: number, version: string) =>
    ["job-file", jobId, docId, version] as const,
  pendingTasks: ["pending-tasks"],
  // Client-only choice; outside the job prefix so a job refresh never touches it.
  attachChoice: (jobId: string) => ["attach-choice", jobId] as const,
  profileDocuments: ["profile-documents"],
  // Bytes of one stored profile document; immutable per upload.
  profileDocumentFile: (id: number, version: string) =>
    ["profile-document-file", id, version] as const,
  // GET /settings read with the profile-only schema (api/profile.ts); secrets are never parsed.
  profile: ["settings", "profile"],
  platforms: ["platforms"],
  // Under the platforms root: the invalidation after every crawl end refreshes the history too.
  platformRuns: (id: number) => ["platforms", "runs", id] as const,
  // A pure derivation from the chosen links; outside the platforms root, nothing invalidates it.
  urlPattern: (selected: readonly string[]) => ["url-pattern", ...selected] as const,
  // The service's channel types (static per deployment) and the user's channels (secrets as booleans).
  channelTypes: ["notification-channel-types"],
  channels: ["notification-channels"],
  notificationTemplates: ["notification-templates"],
  // A server render of a draft; outside every invalidated prefix, nothing refreshes it (ruling 43).
  notificationPreview: (type: string, content: string) =>
    ["notification-preview", type, content] as const,
  profileTimezone: ["settings", "timezone"],
  activity: ["activity"],
  company: (domain: string) => ["company", domain] as const,
  templates: ["templates"],
  // Under the templates prefix: template_ready refreshes the list and every preview.
  templateList: ["templates", "list"],
  // A preview renders the stored profile, so every profile save refreshes all of them.
  templatePreviewRoot: ["templates", "preview"],
  templatePreview: (docType: string, ref: string) =>
    ["templates", "preview", docType, ref] as const,
  // The bundled template files; outside the prefix, they only change with a deployment.
  fileTemplates: ["file-templates"],
  systemStatus: ["system-status"],
  aiSettings: ["admin", "ai"],
  // Fetched on demand and kept for the session (staleTime Infinity).
  openRouterModels: ["admin", "models"],
  users: ["admin", "users"],
  // The directory per scope; company_profile_ready invalidates the whole prefix.
  companiesRoot: ["companies"],
  companies: (scope: CompanyScope) => ["companies", scope] as const,
  // Under the jobs root, so every job event refreshes the company's job lists too.
  companyJobs: (domain: string, archived: boolean) =>
    ["jobs", "company", domain, archived] as const,
  // Under the companies root: a rename, a profile delete and company_profile_ready change the
  // company names a cached search shows, and all of them invalidate that root.
  searchRoot: ["companies", "search"],
  search: (q: string) => ["companies", "search", q] as const,
} as const;

/**
 * Mutation key of every inbox triage and its undo (src/features/inbox/useTriage.ts). The lists
 * refetch only once the last of them settled; src/realtime/applyEvent.ts holds back as well (R15).
 */
export const INBOX_TRIAGE_KEY = ["inbox-triage"] as const;
/** Their scope: one request after the other; a threshold apply queues here too (Task 12). */
export const INBOX_TRIAGE_SCOPE = { id: "inbox-triage" };
