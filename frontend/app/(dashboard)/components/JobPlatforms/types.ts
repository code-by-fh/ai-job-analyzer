export interface Platform {
  id: number;
  url: string;
  name: string;
  favicon_url: string | null;
  crawl_interval_minutes: number;
  schedule_time: string | null; // "HH:MM" UTC
  schedule_days: number[] | null; // 0=Mon..6=Sun
  last_crawl_at: string | null;
  is_active: boolean;
  job_count: number;
  seen_count: number;
  is_notification_enabled: boolean;
  notification_adapters: string[];
  pushover_template: string | null;
  resend_template: string | null;
  resend_recipients: string[] | null;
  mailjet_template: string | null;
  mailjet_recipients: string[] | null;
  smtp_template: string | null;
  smtp_recipients: string[] | null;
}

export type LastRun = {
  total: number;
  total_found?: number;
  saved: number;
  skipped: number;
  scraping_completed?: number;
  analysis_completed?: number;
  status: "success" | "failed";
  error?: string;
  timestamp?: string;
};
