import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../lib/logger';
import { CrawlJob } from '../(dashboard)/components/CrawlStatus';
import { AuthContextType, fetchWithAuth } from '../components/AuthProvider';
import { useNotification } from '../components/NotificationProvider';
import { Job } from '../lib/types';

interface UseCrawlProps {
    user: AuthContextType['user'];
    token: string | null;
    onJobUpdate?: (data: any) => void;
    onNewJob?: (job: Job, crawlJobId?: string) => void;
    onJobEvent?: (event: { type: string; job_id?: string; domain?: string }) => void;
    initialActiveCrawls?: CrawlJob[];
    initialIsCrawling?: boolean;
    initialAiError?: string | null;
}

export function useCrawl({ user, token, onJobUpdate, onNewJob, onJobEvent, initialActiveCrawls, initialIsCrawling, initialAiError }: UseCrawlProps) {
    const [isCrawling, setIsCrawling] = useState(initialIsCrawling || false);

    const initMap = new Map<string, CrawlJob>();
    if (initialActiveCrawls) {
        initialActiveCrawls.forEach(j => {
            if (j.status !== 'completed') {
                initMap.set(j.job_id, j);
            }
        });
    }

    const [activeCrawls, setActiveCrawls] = useState<Map<string, CrawlJob>>(initMap);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(initialAiError ?? null);
    const { showError } = useNotification();

    // Show persisted AI error from Redis on initial load
    useEffect(() => {
        if (initialAiError) showError(initialAiError);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialAiError]);

    // WebSocket Ref to persist across renders without triggering effects
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Expose this so parent can cancel
    const [crawlToCancel, setCrawlToCancel] = useState<string | null>(null);

    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    const fetchCrawlStatus = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/scraper/crawl-status?user_id=${user.id}`);
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
            logger.error({ err: e }, "Error loading crawl status");
        }
    }, [user?.id]);

    const confirmCancelCrawl = async () => {
        if (!crawlToCancel || !user?.id) return;

        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/scraper/cancel-crawl`, {
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
            logger.error({ err: e }, 'Error cancelling crawl');
            setGlobalError('Network error while cancelling crawl');
        }
        setCrawlToCancel(null);
    };

    // Refs for callbacks to ensure stability without strictly needing to be in dependency array of effect
    const onJobUpdateRef = useRef(onJobUpdate);
    const onNewJobRef = useRef(onNewJob);
    const onJobEventRef = useRef(onJobEvent);

    // Ref for the connection timer to prevent strict-mode double-invocation issues
    const connectionTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Update refs when props change
    useEffect(() => {
        onJobUpdateRef.current = onJobUpdate;
        onNewJobRef.current = onNewJob;
        onJobEventRef.current = onJobEvent;
    }, [onJobUpdate, onNewJob, onJobEvent]);

    const connectWebSocket = useCallback(() => {
        if (!token || !user) return;

        // Clear any pending connection attempt
        if (connectionTimerRef.current) {
            clearTimeout(connectionTimerRef.current);
            connectionTimerRef.current = null;
        }

        // Prevent multiple connections if already stable
        if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
            return;
        }

        // Small delay to bypass React Strict Mode's immediate unmount
        connectionTimerRef.current = setTimeout(() => {
            const ws = new WebSocket(`${process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, 'ws')}/ws`);
            wsRef.current = ws;

            ws.onopen = () => {
                // logger.info("WebSocket Connected");
            };

            ws.onmessage = (event) => {
                try {
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
                                    jobs_saved: existing?.jobs_saved || 0,
                                    jobs_skipped: existing?.jobs_skipped || 0,
                                    started_at: data.started_at || existing?.started_at,
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
                                    total_found: data.total_found ?? existing?.total_found ?? data.total,
                                    scraping_completed: data.scraping_completed,
                                    analysis_completed: existing?.analysis_completed || 0,
                                    status: 'crawling'
                                });
                            });
                        }
                    }
                    else if (data.type === "crawl_job_extracting") {
                        if (data.user_id === user?.id) {
                            setActiveCrawls(prev => {
                                const existing = prev.get(data.job_id);
                                if (existing) {
                                    return new Map(prev).set(data.job_id, {
                                        ...existing,
                                        extracting_count: data.extracting_count,
                                        total: data.total || existing.total,
                                    });
                                }
                                return prev;
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
                                        total: data.total ?? existing.total,
                                        total_found: data.total_found ?? existing.total_found ?? (data.total ?? existing.total),
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
                        }
                    }
                    else if (data.type === "crawl_completed") {
                        setIsCrawling(false);
                        setActiveCrawls(prev => {
                            const newMap = new Map(prev);
                            newMap.forEach((job, id) => {
                                if (!job.show_success && job.status !== 'failed') {
                                    newMap.delete(id);
                                }
                            });
                            return newMap;
                        });
                    }
                    else if (data.type === "crawl_job_failed") {
                        if (data.user_id === user?.id) {
                            setActiveCrawls(prev => {
                                const existing = prev.get(data.job_id);
                                if (existing) {
                                    return new Map(prev).set(data.job_id, {
                                        ...existing,
                                        status: 'failed',
                                        error_message: data.error_message || data.reason
                                    });
                                }
                                return prev;
                            });

                            setTimeout(() => {
                                setActiveCrawls(prev => {
                                    const newMap = new Map(prev);
                                    newMap.delete(data.job_id);
                                    if (newMap.size === 0) setIsCrawling(false);
                                    return newMap;
                                });
                            }, 5000);
                        }
                    }
                    else if (data.type === "job_skipped") {
                        if (data.user_id === user?.id) {
                            setActiveCrawls(prev => {
                                const existing = prev.get(data.job_id);
                                if (existing) {
                                    const analyzingJobs = (existing.analyzing_jobs || []).filter(
                                        title => title !== data.job_title
                                    );
                                    return new Map(prev).set(data.job_id, {
                                        ...existing,
                                        jobs_skipped: (existing.jobs_skipped || 0) + 1,
                                        analyzing_jobs: analyzingJobs
                                    });
                                }
                                return prev;
                            });
                        }
                    }
                    else if (data.type === "new_job") {
                        if (onNewJobRef.current) onNewJobRef.current(data.job, data.crawl_job_id);

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
                        if (onJobUpdateRef.current) onJobUpdateRef.current(data);
                    }
                    else if (data.type === "job_updated") {
                        // Fired after manual re-analysis (force_reanalyze=true)
                        if (onJobUpdateRef.current && data.job) {
                            onJobUpdateRef.current({ ...data.job, job_id: data.job.id });
                        }
                    }
                    else if (data.type === 'interview_prep_ready' || data.type === 'company_profile_ready') {
                        onJobEventRef.current?.({ type: data.type, job_id: data.job_id, domain: data.domain });
                    }
                    else if (data.type === "global_error") {
                        setGlobalError(data.message);
                        setTimeout(() => setGlobalError(null), 8000);
                    }
                    else if (data.type === "ai_error") {
                        setAiError(data.message);
                        showError(data.message);
                    }
                    else if (data.type === "ai_error_cleared") {
                        setAiError(null);
                    }
                } catch (e) {
                    logger.error({ err: e }, "Error parsing WS message");
                }
            };

            ws.onclose = () => {
                wsRef.current = null;
            };

            ws.onerror = (err) => {
                // Ignore errors during close/cleanup
                if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) return;
                logger.error({ err }, "WebSocket error");
                ws.close();
            };
        }, 100);

    }, [token, user]);

    useEffect(() => {
        if (token) {
            if (!initialActiveCrawls && !initialIsCrawling) {
                fetchCrawlStatus();
            }
        }

        connectWebSocket();

        return () => {
            // Cancel any pending connection attempt
            if (connectionTimerRef.current) {
                clearTimeout(connectionTimerRef.current);
                connectionTimerRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [token, user, fetchCrawlStatus, connectWebSocket]);

    return {
        isCrawling,
        setIsCrawling,
        activeCrawls,
        setActiveCrawls,
        globalError,
        setGlobalError,
        aiError,
        setAiError,
        fetchCrawlStatus,
        crawlToCancel,
        setCrawlToCancel,
        confirmCancelCrawl
    };
}
