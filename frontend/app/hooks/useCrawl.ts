import { useState, useEffect } from 'react';
import { CrawlJob } from '../components/CrawlStatus';
import { AuthContextType } from '../components/AuthProvider';
import { Job } from '../lib/types';

interface UseCrawlProps {
    user: AuthContextType['user'];
    token: string | null;
    onJobUpdate?: (data: any) => void;
    onNewJob?: (job: Job, crawlJobId?: string) => void;
}

export function useCrawl({ user, token, onJobUpdate, onNewJob }: UseCrawlProps) {
    const [isCrawling, setIsCrawling] = useState(false);
    const [activeCrawls, setActiveCrawls] = useState<Map<string, CrawlJob>>(new Map());
    const [globalError, setGlobalError] = useState<string | null>(null);

    // Expose this so parent can cancel
    const [crawlToCancel, setCrawlToCancel] = useState<string | null>(null);

    const fetchCrawlStatus = async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/crawl-status?user_id=${user.id}`);
            const data = await res.json();
            if (data.jobs && data.jobs.length > 0) {
                const jobsMap = new Map<string, CrawlJob>();
                data.jobs.forEach((job: CrawlJob) => {
                    if (job.status !== 'completed') {
                        jobsMap.set(job.job_id, job);
                    }
                });
                setActiveCrawls(jobsMap);
                setIsCrawling(jobsMap.size > 0);
            } else {
                setActiveCrawls(new Map());
                setIsCrawling(false);
            }
        } catch (e) {
            console.error("Fehler beim Laden des Crawl-Status:", e);
        }
    };

    const confirmCancelCrawl = async () => {
        if (!crawlToCancel || !user?.id) return;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/cancel-crawl`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job_id: crawlToCancel, user_id: user.id })
            });

            if (res.ok) {
                setActiveCrawls(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(crawlToCancel);
                    if (newMap.size === 0) {
                        setIsCrawling(false);
                    }
                    return newMap;
                });
            } else {
                const data = await res.json().catch(() => ({}));
                setGlobalError(`Failed to cancel: ${data.message || res.statusText}`);
            }
        } catch (e) {
            console.error('Error cancelling crawl:', e);
            setGlobalError('Network error while cancelling crawl');
        }
        setCrawlToCancel(null);
    };

    useEffect(() => {
        if (token) {
            fetchCrawlStatus();
        }

        // Check initial status
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/status`)
            .then(res => res.json())
            .then(data => { if (data.crawling) setIsCrawling(true); })
            .catch(() => { });

        const ws = new WebSocket(`${process.env.NEXT_PUBLIC_API_WS_URL}/ws`);
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "crawl_job_started") {
                if (data.user_id === user?.id) {
                    setActiveCrawls(prev => {
                        const existing = prev.get(data.job_id);
                        return new Map(prev).set(data.job_id, {
                            ...existing,
                            job_id: data.job_id,
                            platform: data.platform,
                            total: existing?.total || 0,
                            scraping_completed: existing?.scraping_completed || 0,
                            analysis_completed: existing?.analysis_completed || 0,
                            status: 'starting'
                        });
                    });
                    setIsCrawling(true);
                }
            }
            else if (data.type === "crawl_job_progress") {
                if (data.user_id === user?.id) {
                    setActiveCrawls(prev => {
                        const existing = prev.get(data.job_id);
                        return new Map(prev).set(data.job_id, {
                            ...existing,
                            job_id: data.job_id,
                            platform: data.platform,
                            total: data.total,
                            scraping_completed: data.scraping_completed,
                            analysis_completed: existing?.analysis_completed || 0,
                            status: 'crawling'
                        });
                    });
                }
            }
            else if (data.type === "job_analysis_started") {
                if (data.user_id === user?.id) {
                    setActiveCrawls(prev => {
                        const existing = prev.get(data.job_id);
                        if (existing) {
                            const analyzingJobs = existing.analyzing_jobs || [];
                            const allJobTitles = existing.all_job_titles || [];

                            const newAllJobTitles = allJobTitles.includes(data.job_title)
                                ? allJobTitles
                                : [...allJobTitles, data.job_title];

                            return new Map(prev).set(data.job_id, {
                                ...existing,
                                current_job_title: data.job_title,
                                analysis_completed: data.analysis_completed,
                                analyzing_jobs: [...analyzingJobs, data.job_title],
                                all_job_titles: newAllJobTitles
                            });
                        }
                        return prev;
                    });
                }
            }
            else if (data.type === "job_analysis_finished") {
                if (data.user_id === user?.id) {
                    setActiveCrawls(prev => {
                        const existing = prev.get(data.job_id);
                        if (existing) {
                            const analyzingJobs = (existing.analyzing_jobs || []).filter(
                                title => title !== data.job_title
                            );
                            return new Map(prev).set(data.job_id, {
                                ...existing,
                                analyzing_jobs: analyzingJobs
                            });
                        }
                        return prev;
                    });
                }
            }
            else if (data.type === "crawl_job_completed") {
                if (data.user_id === user?.id) {
                    setActiveCrawls(prev => {
                        const existing = prev.get(data.job_id);
                        if (existing) {
                            return new Map(prev).set(data.job_id, {
                                ...existing,
                                show_success: true
                            });
                        }
                        return prev;
                    });

                    setTimeout(() => {
                        setActiveCrawls(prev => {
                            const newMap = new Map(prev);
                            newMap.delete(data.job_id);
                            if (newMap.size === 0) {
                                setIsCrawling(false);
                            }
                            return newMap;
                        });
                    }, 5000);

                    // Signal parent to refresh? logic is handled via onNewJob implicitly or explicit fetch from parent?
                    // The old code did `if (token) fetchJobs(true);` here.
                    // We can use a callback or just expose a refresh need.
                }
            }
            else if (data.type === "crawl_completed") {
                setIsCrawling(false);
                setActiveCrawls(new Map());
            }
            else if (data.type === "new_job") {
                // Logic specific to aggregating new jobs...
                if (onNewJob) onNewJob(data.job, data.crawl_job_id);

                // Update counters
                if (data.crawl_job_id) {
                    setActiveCrawls(prev => {
                        const existing = prev.get(data.crawl_job_id);
                        if (existing) {
                            const analyzingJobs = (existing.analyzing_jobs || []).filter(
                                title => title !== data.job.title
                            );
                            return new Map(prev).set(data.crawl_job_id, {
                                ...existing,
                                jobs_saved: (existing.jobs_saved || 0) + 1,
                                analyzing_jobs: analyzingJobs
                            });
                        }
                        return prev;
                    });
                }
            }
            else if (data.type === "job_update") {
                if (onJobUpdate) onJobUpdate(data);
            }
            else if (data.type === "global_error") {
                setGlobalError(data.message);
                setTimeout(() => setGlobalError(null), 8000);
            }
        };
        return () => ws.close();
    }, [token, user]);

    return {
        isCrawling,
        setIsCrawling,
        activeCrawls,
        setActiveCrawls,
        globalError,
        setGlobalError,
        fetchCrawlStatus,
        crawlToCancel,
        setCrawlToCancel,
        confirmCancelCrawl
    };
}
