"use client";
import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { useLanguage } from './LanguageProvider';

// Components
import ApplicationModal from './ApplicationModal';
import ConfirmModal from './ConfirmModal';
import CrawlStatus from './CrawlStatus';
import FilterBar from './FilterBar';
import JobCard from './JobCard';
import SearchHeader from './SearchHeader';

// Hooks & Types
import { useCrawl } from '../hooks/useCrawl';
import { useJobs } from '../hooks/useJobs';
import { Job } from '../lib/types';

interface DashboardProps {
    initialFilter: 'all' | 'favorite' | 'no_favorite' | 'applications';
}

export default function Dashboard({ initialFilter }: DashboardProps) {
    const { user, token, logout } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();

    // --- STATE ---
    const [query, setQuery] = useState('');
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'score' | 'date'>('score');
    const [filterType, setFilterType] = useState(initialFilter);

    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const [initialJobs, setInitialJobs] = useState<Job[]>([]);
    const [initialCrawlStatus, setInitialCrawlStatus] = useState<any[]>([]);
    const [initialSystemCrawling, setInitialSystemCrawling] = useState(false);

    // Generator & Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState('');
    const [modalJobId, setModalJobId] = useState('');
    const [modalJob, setModalJob] = useState<Job | null>(null);
    const [pendingIds, setPendingIds] = useState<string[]>([]);


    useEffect(() => {
        if (token && !initialDataLoaded) {
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/dashboard-data?limit=10&offset=0&filter_type=${initialFilter}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(res => {
                    if (res.status === 401) { logout(); return null; }
                    return res.json();
                })
                .then(data => {
                    if (data) {
                        setInitialJobs(data.jobs || []);
                        setInitialCrawlStatus(data.active_crawls || []);
                        setInitialSystemCrawling(data.system_crawling || false);
                        setInitialDataLoaded(true);
                    }
                })
                .catch(err => console.error("Dashboard data fetch error:", err));
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
        handleUpdateStatus
    } = useJobs({
        token,
        logout,
        filterType,
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

    const {
        isCrawling,
        setIsCrawling,
        activeCrawls,
        globalError: crawlError,
        setGlobalError: setCrawlError,
        fetchCrawlStatus,
        crawlToCancel,
        setCrawlToCancel,
        confirmCancelCrawl
    } = useCrawl({
        user,
        token,
        onJobUpdate,
        onNewJob,
        initialActiveCrawls: initialDataLoaded ? initialCrawlStatus : undefined,
        initialIsCrawling: initialDataLoaded ? initialSystemCrawling : undefined
    });

    const globalError = jobsError || crawlError;
    const setGlobalError = (msg: string | null) => {
        if (msg) setJobsError(msg); else { setJobsError(null); setCrawlError(null); }
    }
    useEffect(() => {
        const urlFilter = searchParams.get('filter');
        const validFilters = ['all', 'favorite', 'no_favorite', 'applications'];
        const target = validFilters.includes(urlFilter || '') ? (urlFilter as any) : 'all';

        if (filterType !== target) {
            setFilterType(target);
        }
    }, [searchParams, filterType]);

    const handleFilterChange = (newFilter: 'all' | 'favorite' | 'no_favorite' | 'applications') => {
        if (newFilter === 'all') {
            router.push('/');
        } else {
            router.push(`/?filter=${newFilter}`);
        }
        setFilterType(newFilter);
    };

    useEffect(() => {
        const t = localStorage.getItem('token');
        if (!t) router.push('/login');
    }, [router]);
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

    useEffect(() => {
        if (expandedJobId) {
            setTimeout(() => {
                const element = document.getElementById(`job-details-${expandedJobId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    }, [expandedJobId]);

    const startSearch = async () => {
        if (!user?.is_profile_complete) {
            setGlobalError(t('completeProfileFirst'));
            setTimeout(() => setGlobalError(null), 3000);
            return;
        }
        if (!query) return;

        try {
            const parsed = new URL(query);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                setGlobalError(t('invalidUrlProtocol'));
                setTimeout(() => setGlobalError(null), 3000);
                return;
            }
        } catch (_) {
            setGlobalError(t('invalidUrl'));
            setTimeout(() => setGlobalError(null), 3000);
            return;
        }

        setIsCrawling(true);
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/search`, {
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
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/generate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            setPendingIds(prev => prev.filter(id => id !== job.id));
        }
    };

    const sortedJobs = [...jobs].sort((a, b) => {
        if (sortBy === 'date') {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        }
        return b.match_score - a.match_score;
    });

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

            {/* GLOBAL ERROR BANNER */}
            {globalError && (
                <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-lg flex items-center justify-between">
                    <span>⚠️ {globalError}</span>
                </div>
            )}

            {/* CRAWL STATUS */}
            {activeCrawls.size > 0 && (
                <CrawlStatus jobs={Array.from(activeCrawls.values())} onCancel={setCrawlToCancel} />
            )}

            <FilterBar
                filterType={filterType}
                setFilterType={handleFilterChange}
                sortBy={sortBy}
                setSortBy={setSortBy}
            />

            {/* JOB LIST */}
            <div className="grid gap-6">
                {jobs.length === 0 && !isCrawling && (
                    <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        <p className="text-slate-400 dark:text-slate-500">{t('systemWaiting')}</p>
                    </div>
                )}

                {sortedJobs.map((job, index) => (
                    <JobCard
                        key={job.id}
                        job={job}
                        isExpanded={expandedJobId === job.id}
                        isGenerating={pendingIds.includes(job.id) || job.status === 'GENERATING'}
                        onToggleExpand={(id) => setExpandedJobId(prev => prev === id ? null : id)}
                        onGenerate={handleGenerate}
                        onDelete={(e, id) => setJobToDelete(id)}
                        onStatusUpdate={handleUpdateStatus}
                        onToggleFavorite={handleToggleFavorite}
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
