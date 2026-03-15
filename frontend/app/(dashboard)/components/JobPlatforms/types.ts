export interface Platform {
    id: number;
    url: string;
    name: string;
    favicon_url: string | null;
    crawl_interval_minutes: number;
    last_crawl_at: string | null;
    is_active: boolean;
    job_count: number;
    is_notification_enabled: boolean;
    notification_adapters: string[];
    gmail_template: string | null;
    gmail_recipients: string[] | null;
    pushover_template: string | null;
}

export type LastRun = {
    total: number;
    total_found?: number;
    saved: number;
    skipped: number;
    scraping_completed?: number;
    analysis_completed?: number;
    status: 'success' | 'failed';
    error?: string;
    timestamp?: string;
};
