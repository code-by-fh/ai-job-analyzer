"use client";
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth, fetchWithAuth } from '../../components/AuthProvider';
import { useLanguage } from '../../components/LanguageProvider';
import { useNotification } from '../../components/NotificationProvider';

// Components
import ApplicationModal from '../../components/ApplicationModal';
import ConfirmModal from '../../components/ConfirmModal';
import CrawlStatus from './CrawlStatus';
import FilterBar from '../../components/FilterBar';
import JobCard from '../../components/JobCard/JobCard';
import SearchHeader from '../../components/SearchHeader';

// Hooks & Types
import { useCrawl } from '../../hooks/useCrawl';
import { useJobs } from '../../hooks/useJobs';
import { Job } from '../../lib/types';
import { logger } from '../../lib/logger';

interface DashboardProps {
    initialFilter: 'all' | 'favorite' | 'no_favorite' | 'applications';
}

export default function Dashboard({ initialFilter }: DashboardProps) {
    const { user, token, logout } = useAuth();
    const { t } = useLanguage();
    const { showError } = useNotification();
    const router = useRouter();
    const searchParams = useSearchParams();

    // --- STATE ---
    const [query, setQuery] = useState('');
    const [sortBy, setSortBy] = useState<'score' | 'date'>((searchParams.get('sort') as any) || 'score');
    const [filterType, setFilterType] = useState(initialFilter);
    const [searchText, setSearchText] = useState(searchParams.get('search') || '');
    const [domainFilter, setDomainFilter] = useState(searchParams.get('domain') || '');
    const [hasApplication, setHasApplication] = useState(searchParams.get('application') === 'true');
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
    const [needsAttention, setNeedsAttention] = useState(searchParams.get('attention') === 'true');
    const [availableDomains, setAvailableDomains] = useState<{ domain: string; count: number }[]>([]);

    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [initialJobs, setInitialJobs] = useState<Job[]>([]);
    const [initialCrawlStatus, setInitialCrawlStatus] = useState<any[]>([]);
    const [initialSystemCrawling, setInitialSystemCrawling] = useState(false);
    const [initialAiError, setInitialAiError] = useState<string | null>(null);

    // Generator & Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState('');
    const [modalJobId, setModalJobId] = useState('');
    const [modalJob, setModalJob] = useState<Job | null>(null);
    const [pendingIds, setPendingIds] = useState<string[]>([]);

    useEffect(() => {
        if (token && !initialDataLoaded) {
            fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-data?limit=10&offset=0&filter_type=${initialFilter}`)
                .then(res => {
                    if (res.status === 401) { logout(); return null; }
                    return res.json();
                })
                .then(data => {
                    if (data) {
                        setInitialJobs(data.jobs || []);
                        setInitialCrawlStatus(data.active_crawls || []);
                        setInitialSystemCrawling(data.system_crawling || false);
                        setInitialAiError(data.ai_error || null);
                        setInitialDataLoaded(true);
                    }
                })
                .catch(err => logger.error({ err }, "Dashboard data fetch error"));
        }
    }, [token, initialDataLoaded, initialFilter, logout]);


    const {
        jobs,
        setJobs,
        fetchJobs,
        hasMore,
        isLoadingMore,
        globalError: jobsError,
        setGlobalError: setJobsError,
        jobToDelete,
        setJobToDelete,
        confirmDeleteJob,
        handleToggleFavorite,
        handleUpdateStatus,
        updateJob
    } = useJobs({
        token,
        logout,
        filterType,
        sortBy,
        hasApplication,
        statusFilter,
        initialJobs: initialDataLoaded ? initialJobs : undefined
    });

    const onJobUpdate = useCallback((data: any) => {
        setJobs(prev => prev.map(job => (job.id === data.job_id ? { ...job, ...data } : job)));
        setPendingIds(prev => prev.filter(id => id !== data.job_id));
    }, [setJobs]);

    const onNewJob = useCallback((job: Job, crawlJobId?: string) => {
        if (job?.user_id === user?.id) {
            let shouldAdd = true;
            if (filterType === 'favorite' && !job.is_favorite) shouldAdd = false;
            if (filterType === 'no_favorite' && job.is_favorite) shouldAdd = false;

            if (shouldAdd) {
                setJobs(prevJobs => {
                    if (prevJobs.some(j => j.id === job.id)) return prevJobs;
                    return [job, ...prevJobs];
                });
            }
        }
        if (token) fetchJobs(true);
    }, [user?.id, filterType, token, fetchJobs, setJobs]);

    const refreshJob = useCallback(async (jobId: string) => {
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}`);
            if (!res.ok) return;
            const updatedJob = await res.json();
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updatedJob } : j));
        } catch { }
    }, [setJobs]);

    const onJobEvent = useCallback((event: { type: string; job_id?: string; domain?: string }) => {
        if (event.type === 'interview_prep_ready' && event.job_id) {
            refreshJob(event.job_id);
        }
        if (event.type === 'company_profile_ready' && event.domain) {
            jobs.filter(j => j.company_domain === event.domain).forEach(j => refreshJob(j.id));
        }
    }, [jobs, refreshJob]);

    const {
        isCrawling,
        setIsCrawling,
        activeCrawls,
        globalError: crawlError,
        setGlobalError: setCrawlError,
        aiError,
        setAiError,
        fetchCrawlStatus,
        crawlToCancel,
        setCrawlToCancel,
        confirmCancelCrawl
    } = useCrawl({
        user,
        token,
        onJobUpdate,
        onNewJob,
        onJobEvent,
        initialActiveCrawls: initialDataLoaded ? initialCrawlStatus : undefined,
        initialIsCrawling: initialDataLoaded ? initialSystemCrawling : undefined,
    });

    // Bridge jobs/crawl errors → global notification banner
    useEffect(() => { if (jobsError) showError(jobsError); }, [jobsError, showError]);
    useEffect(() => { if (crawlError) showError(crawlError); }, [crawlError, showError]);

    // Sync URL -> State (for back button / browser navigation)
    useEffect(() => {
        const urlParams = {
            filter: searchParams.get('filter') || 'all',
            sort: searchParams.get('sort') || 'score',
            search: searchParams.get('search') || '',
            domain: searchParams.get('domain') || '',
            status: searchParams.get('status') || '',
            application: searchParams.get('application') === 'true',
            attention: searchParams.get('attention') === 'true',
        };

        if (urlParams.filter !== filterType) setFilterType(urlParams.filter as any);
        if (urlParams.sort !== sortBy) setSortBy(urlParams.sort as any);
        if (urlParams.search !== searchText) setSearchText(urlParams.search);
        if (urlParams.domain !== domainFilter) setDomainFilter(urlParams.domain);
        if (urlParams.status !== statusFilter) setStatusFilter(urlParams.status);
        if (urlParams.application !== hasApplication) setHasApplication(urlParams.application);
        if (urlParams.attention !== needsAttention) setNeedsAttention(urlParams.attention);
    }, [searchParams]);

    // Sync State -> URL
    useEffect(() => {
        const timer = setTimeout(() => {
            const params = new URLSearchParams();
            if (filterType !== 'all') params.set('filter', filterType);
            if (sortBy !== 'score') params.set('sort', sortBy);
            if (searchText) params.set('search', searchText);
            if (domainFilter) params.set('domain', domainFilter);
            if (statusFilter) params.set('status', statusFilter);
            if (hasApplication) params.set('application', 'true');
            if (needsAttention) params.set('attention', 'true');

            const newQuery = params.toString();
            const currentQuery = searchParams.toString();

            if (newQuery !== currentQuery) {
                router.replace(`/${newQuery ? `?${newQuery}` : ''}`, { scroll: false });
            }
        }, 400); // 400ms debounce
        return () => clearTimeout(timer);
    }, [filterType, sortBy, searchText, domainFilter, statusFilter, hasApplication, needsAttention, router, searchParams]);

    const handleFilterChange = (newFilter: 'all' | 'favorite' | 'no_favorite' | 'applications') => {
        setFilterType(newFilter);
    };

    useEffect(() => {
        if (!hasMore || isLoadingMore) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                fetchJobs(false);
            }
        }, { threshold: 1.0 });

        const trigger = document.getElementById('infinite-scroll-trigger');
        if (trigger) observer.observe(trigger);

        return () => {
            if (trigger) observer.unobserve(trigger);
        }
    }, [hasMore, isLoadingMore, jobs]);

    const startSearch = async () => {
        if (!user?.is_profile_complete) {
            showError(t('completeProfileFirst'));
            return;
        }
        if (!query) return;

        try {
            const parsed = new URL(query);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                showError(t('invalidUrlProtocol'));
                return;
            }
        } catch (_) {
            showError(t('invalidUrl'));
            return;
        }

        setIsCrawling(true);
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/scraper/search`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, location: 'Remote', user_id: user?.id })
            });
            setQuery('');
        } catch (e) {
            setIsCrawling(false);
        }
    };

    const handleGenerate = async (job: Job) => {
        if (job.application_draft) {
            setModalContent(job.application_draft);
            setModalJobId(job.id);
            setModalJob(job);
            setModalOpen(true);
            return;
        }

        setPendingIds(prev => [...prev, job.id]);
        try {
            await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/generate`, {
                method: 'POST',
            });
        } catch (e) {
            setPendingIds(prev => prev.filter(id => id !== job.id));
        }
    };

    useEffect(() => {
        const counts: Record<string, number> = {};
        jobs.forEach(job => {
            if (job.company) {
                counts[job.company] = (counts[job.company] || 0) + 1;
            }
        });
        const sorted = Object.entries(counts)
            .map(([domain, count]) => ({ domain, count }))
            .sort((a, b) => b.count - a.count);
        setAvailableDomains(sorted);
    }, [jobs]);

    const jobNeedsAttention = (job: Job) => {
        const followUpDue = !!job.next_follow_up_at && new Date(job.next_follow_up_at) <= new Date();
        return followUpDue || job.status === 'INTERVIEW';
    };

    const needsAttentionCount = useMemo(() => {
        return jobs.filter(jobNeedsAttention).length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobs]);

    const visibleJobs = useMemo(() => {
        return jobs.filter(job => {
            const q = searchText.toLowerCase();
            const matchesSearch = !q ||
                job.title.toLowerCase().includes(q) ||
                job.company.toLowerCase().includes(q);
            const matchesDomain = !domainFilter || job.company === domainFilter;
            const matchesNeedsAttention = !needsAttention || jobNeedsAttention(job);
            return matchesSearch && matchesDomain && matchesNeedsAttention;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobs, searchText, domainFilter, needsAttention]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <ApplicationModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                content={modalContent}
                jobId={modalJobId}
                currentStatus={modalJob?.status || 'OPEN'}
                onStatusUpdate={handleUpdateStatus}
                token={token}
            />

            <ConfirmModal
                isOpen={!!jobToDelete}
                onClose={() => setJobToDelete(null)}
                onConfirm={confirmDeleteJob}
                title={t('deleteJob')}
                message={t('deleteConfirm')}
                confirmText={t('delete')}
                cancelText={t('cancel')}
                isDestructive={true}
            />

            <ConfirmModal
                isOpen={!!crawlToCancel}
                onClose={() => setCrawlToCancel(null)}
                onConfirm={confirmCancelCrawl}
                title={t('cancelCrawl')}
                message={t('cancelCrawlConfirm')}
                confirmText={t('confirm')}
                cancelText={t('cancel')}
                isDestructive={true}
            />

            <SearchHeader
                jobCount={jobs.length}
                query={query}
                setQuery={setQuery}
                onSearch={startSearch}
                isCrawling={isCrawling}
                isProfileComplete={!!user?.is_profile_complete}
                headlineMsgkey="jobIntelligence"
            />


            {/* CRAWL STATUS */}
            {activeCrawls.size > 0 && (
                <CrawlStatus jobs={Array.from(activeCrawls.values())} onCancel={setCrawlToCancel} />
            )}

            <FilterBar
                filterType={filterType}
                setFilterType={handleFilterChange}
                sortBy={sortBy}
                setSortBy={setSortBy}
                searchText={searchText}
                setSearchText={setSearchText}
                domainFilter={domainFilter}
                setDomainFilter={setDomainFilter}
                availableDomains={availableDomains}
                hasApplication={hasApplication}
                setHasApplication={setHasApplication}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                needsAttention={needsAttention}
                setNeedsAttention={setNeedsAttention}
                needsAttentionCount={needsAttentionCount}
                platformFilter={undefined}
                setPlatformFilter={() => { }}
                availablePlatforms={[]}
            />

            {/* JOB LIST */}
            <div className="grid gap-6">
                {visibleJobs.length === 0 && !isCrawling && (
                    <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        <p className="text-slate-400 dark:text-slate-500">{t('systemWaiting')}</p>
                    </div>
                )}

                {visibleJobs.map((job, index) => (
                    <JobCard
                        key={job.id}
                        job={job}
                        isGenerating={pendingIds.includes(job.id) || job.status === 'GENERATING'}
                        onGenerate={handleGenerate}
                        onStatusUpdate={handleUpdateStatus}
                        onToggleFavorite={handleToggleFavorite}
                        onUpdateJob={updateJob}
                    />
                ))}

                {/* Infinite Scroll Trigger */}
                {hasMore && (
                    <div id="infinite-scroll-trigger" className="h-10 flex justify-center items-center">
                        {isLoadingMore && <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />}
                    </div>
                )}
            </div>
        </div>
    );
}
