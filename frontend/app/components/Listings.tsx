"use client";
import { Loader2, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { logger } from '../lib/logger';

interface ListingsProps {
    initialFilter: 'all' | 'favorite' | 'no_favorite' | 'applications';
    initialPlatformId?: number;
    initialPlatformName?: string;
}

export default function Listings({ initialFilter, initialPlatformId, initialPlatformName }: ListingsProps) {
    const { user, token, logout } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();

    // --- STATE ---
    const [query, setQuery] = useState('');
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'score' | 'date'>('score');
    const [filterType, setFilterType] = useState(initialFilter);
    const [searchText, setSearchText] = useState('');
    const [domainFilter, setDomainFilter] = useState('');
    const [hasApplication, setHasApplication] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [platformIdFilter, setPlatformIdFilter] = useState<number | undefined>(initialPlatformId);
    const [platformNameFilter, setPlatformNameFilter] = useState<string | undefined>(initialPlatformName);
    const [availableDomains, setAvailableDomains] = useState<{ domain: string; count: number }[]>([]);

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
    const [platformToBulkDelete, setPlatformToBulkDelete] = useState<number | null>(null);
    const [companyToBulkDelete, setCompanyToBulkDelete] = useState<string | null>(null);
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const [keepFavorites, setKeepFavorites] = useState(true);
    const [keepApplications, setKeepApplications] = useState(true);
    const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const handleBulkDeleteCompanyJobs = async () => {
        if (!companyToBulkDelete) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs?company=${encodeURIComponent(companyToBulkDelete)}&keep_favorites=${keepFavorites}&keep_applications=${keepApplications}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchJobs(true);
                setSelectedJobIds([]);
            } else {
                setGlobalError('Failed to delete jobs');
                setTimeout(() => setGlobalError(null), 3000);
            }
        } catch (e) {
            setGlobalError('Error deleting jobs');
            setTimeout(() => setGlobalError(null), 3000);
        } finally {
            setCompanyToBulkDelete(null);
            setKeepFavorites(true);
            setKeepApplications(true);
        }
    };

    const handleBulkDeletePlatformJobs = async () => {
        if (!platformToBulkDelete) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platformToBulkDelete}/jobs?keep_favorites=${keepFavorites}&keep_applications=${keepApplications}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchJobs(true);
            } else {
                setGlobalError('Failed to delete jobs');
                setTimeout(() => setGlobalError(null), 3000);
            }
        } catch (e) {
            setGlobalError('Error deleting jobs');
            setTimeout(() => setGlobalError(null), 3000);
        } finally {
            setPlatformToBulkDelete(null);
            setKeepFavorites(true);
            setKeepApplications(true);
        }
    };


    useEffect(() => {
        if (token && !initialDataLoaded && !initialPlatformId) {
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
                .catch(err => logger.error({ err }, "Listings data fetch error"));
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
        bulkDeleteJobs
    } = useJobs({
        token,
        logout,
        filterType,
        sortBy,
        hasApplication,
        statusFilter,
        initialJobs: initialDataLoaded ? initialJobs : undefined,
        platformId: platformIdFilter,
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
            setSelectedJobIds([]); // Clear selections on filter change
        }
    }, [searchParams, filterType]);

    const handleFilterChange = (newFilter: 'all' | 'favorite' | 'no_favorite' | 'applications') => {
        setSelectedJobIds([]); // Clear selections on filter change
        if (newFilter === 'all') {
            router.push('/listings');
        } else {
            router.push(`/listings?filter=${newFilter}`);
        }
        setFilterType(newFilter);
    };

    const handleSelectJob = (jobId: string, selected: boolean) => {
        setSelectedJobIds(prev =>
            selected ? [...prev, jobId] : prev.filter(id => id !== jobId)
        );
    };

    const handleBulkDelete = () => {
        if (!selectedJobIds.length) return;
        setIsBulkDeleteModalOpen(true);
    };

    const confirmBulkDelete = async () => {
        setIsBulkDeleteModalOpen(false);
        setIsBulkDeleting(true);
        const success = await bulkDeleteJobs(selectedJobIds);
        if (success) {
            setSelectedJobIds([]);
        }
        setIsBulkDeleting(false);
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

    const visibleJobs = useMemo(() => {
        return jobs.filter(job => {
            const q = searchText.toLowerCase();
            const matchesSearch = !q ||
                job.title.toLowerCase().includes(q) ||
                job.company.toLowerCase().includes(q);
            const matchesDomain = !domainFilter || job.company === domainFilter;
            return matchesSearch && matchesDomain;
        });
    }, [jobs, searchText, domainFilter]);

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

            <ConfirmModal
                isOpen={!!platformToBulkDelete}
                onClose={() => { setPlatformToBulkDelete(null); setKeepFavorites(true); setKeepApplications(true); }}
                onConfirm={handleBulkDeletePlatformJobs}
                title={t('deleteAllFromPlatform')}
                message={t('areYouCertain')}
                confirmText={t('delete')}
                cancelText={t('cancel')}
                isDestructive={true}
            >
                <div className="mt-2 flex flex-col gap-1.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="keepFavoritesBulkCheckbox"
                            checked={keepFavorites}
                            onChange={(e) => setKeepFavorites(e.target.checked)}
                            className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                        />
                        <label htmlFor="keepFavoritesBulkCheckbox" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                            {t('keepFavorites')}
                        </label>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <input
                            type="checkbox"
                            id="keepApplicationsBulkCheckbox"
                            checked={keepApplications}
                            onChange={(e) => setKeepApplications(e.target.checked)}
                            className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                        />
                        <label htmlFor="keepApplicationsBulkCheckbox" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                            {t('keepApplications')}
                        </label>
                    </div>
                </div>
            </ConfirmModal>

            <ConfirmModal
                isOpen={!!companyToBulkDelete}
                onClose={() => { setCompanyToBulkDelete(null); setKeepFavorites(true); setKeepApplications(true); }}
                onConfirm={handleBulkDeleteCompanyJobs}
                title={t('deleteAllFromCompany').replace('{company}', companyToBulkDelete || '')}
                message={t('areYouCertain')}
                confirmText={t('delete')}
                cancelText={t('cancel')}
                isDestructive={true}
            >
                <div className="mt-2 flex flex-col gap-1.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="keepFavoritesBulkCheckboxCompany"
                            checked={keepFavorites}
                            onChange={(e) => setKeepFavorites(e.target.checked)}
                            className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                        />
                        <label htmlFor="keepFavoritesBulkCheckboxCompany" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                            {t('keepFavorites')}
                        </label>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <input
                            type="checkbox"
                            id="keepApplicationsBulkCheckboxCompany"
                            checked={keepApplications}
                            onChange={(e) => setKeepApplications(e.target.checked)}
                            className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
                        />
                        <label htmlFor="keepApplicationsBulkCheckboxCompany" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                            {t('keepApplications')}
                        </label>
                    </div>
                </div>
            </ConfirmModal>

            <ConfirmModal
                isOpen={isBulkDeleteModalOpen}
                onClose={() => setIsBulkDeleteModalOpen(false)}
                onConfirm={confirmBulkDelete}
                title={t('bulkDelete')}
                message={t('areYouCertain')}
                confirmText={t('delete')}
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

            {platformIdFilter && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl text-sm text-indigo-700 dark:text-indigo-300 flex-wrap">
                    <span className="text-base">🏢</span>
                    <span className="font-semibold whitespace-nowrap">{platformNameFilter || `Platform #${platformIdFilter}`}</span>

                    <div className="ml-auto flex items-center gap-3">
                        <button
                            onClick={() => setPlatformToBulkDelete(platformIdFilter)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            {t('deleteAllFromPlatform')}
                        </button>

                        <button
                            onClick={() => { setPlatformIdFilter(undefined); setPlatformNameFilter(undefined); }}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 transition-colors cursor-pointer border-l border-indigo-200 dark:border-indigo-500/30 pl-3"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            {t('clearAllFilters')}
                        </button>
                    </div>
                </div>
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
            />

            {/* JOB LIST */}
            <div className="grid gap-6">
                {visibleJobs.length > 0 && (
                    <div className="flex justify-start items-center px-1 mb-[-4px]">
                        <label className="group/cb relative flex items-center justify-center cursor-pointer gap-2.5">
                            <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={visibleJobs.length > 0 && visibleJobs.every(job => selectedJobIds.includes(job.id))}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        const visibleIds = visibleJobs.map(j => j.id);
                                        setSelectedJobIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                                    } else {
                                        const visibleIds = visibleJobs.map(j => j.id);
                                        setSelectedJobIds(prev => prev.filter(id => !visibleIds.includes(id)));
                                    }
                                }}
                            />
                            <div className={`w-[22px] h-[22px] rounded-md border-2 transition-all duration-200 flex items-center justify-center
                                ${visibleJobs.length > 0 && visibleJobs.every(job => selectedJobIds.includes(job.id))
                                    ? 'bg-indigo-500 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover/cb:border-indigo-400 dark:group-hover/cb:border-indigo-500 shadow-sm'
                                }`}>
                                <svg className={`w-3.5 h-3.5 text-white transition-transform duration-300 ${visibleJobs.length > 0 && visibleJobs.every(job => selectedJobIds.includes(job.id)) ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 group-hover/cb:text-indigo-600 dark:group-hover/cb:text-indigo-400 transition-colors select-none">
                                {t('selectAllVisible')} ({visibleJobs.length})
                            </span>
                        </label>
                    </div>
                )}

                {visibleJobs.length === 0 && !isCrawling && (
                    <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        <p className="text-slate-400 dark:text-slate-500">{t('systemWaiting')}</p>
                    </div>
                )}

                {visibleJobs.map((job, index) => (
                    <JobCard
                        key={job.id}
                        job={job}
                        isExpanded={expandedJobId === job.id}
                        isGenerating={pendingIds.includes(job.id) || job.status === 'GENERATING'}
                        onToggleExpand={(id) => setExpandedJobId(prev => prev === id ? null : id)}
                        onGenerate={handleGenerate}
                        onStatusUpdate={handleUpdateStatus}
                        onToggleFavorite={handleToggleFavorite}
                        isSelected={selectedJobIds.includes(job.id)}
                        onSelect={handleSelectJob}
                    />
                ))}

                {/* Infinite Scroll Trigger */}
                {hasMore && (
                    <div id="infinite-scroll-trigger" className="h-10 flex justify-center items-center pb-20">
                        {isLoadingMore && <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />}
                    </div>
                )}
            </div>

            {/* Bulk Actions Floating Bar */}
            {selectedJobIds.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
                    <div className="bg-white dark:bg-slate-900 shadow-2xl dark:shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-slate-800 rounded-full px-6 py-3 flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {selectedJobIds.length} {t('selected')}
                        </span>

                        {(() => {
                            const companies = Array.from(new Set(selectedJobIds.map(id => jobs.find(j => j.id === id)?.company).filter(Boolean)));
                            if (companies.length === 1 && companies[0]) {
                                return (
                                    <>
                                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                                        <button
                                            onClick={() => setCompanyToBulkDelete(companies[0] as string)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 cursor-pointer active:scale-95 whitespace-nowrap border border-indigo-200/50 dark:border-indigo-500/30"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            <span className="hidden sm:inline">{t('deleteAllFromCompany').replace('{company}', companies[0] as string)}</span>
                                            <span className="sm:hidden">{t('deleteAllFromCompany').replace(' {company}', '')}</span>
                                        </button>
                                    </>
                                );
                            }
                            return null;
                        })()}

                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                        <button
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className={`
                                flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all
                                ${isBulkDeleting
                                    ? 'bg-rose-100 text-rose-400 dark:bg-rose-900/30'
                                    : 'bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-400 cursor-pointer active:scale-95'
                                }
                            `}
                        >
                            {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            {t('bulkDelete')}
                        </button>
                        <button
                            onClick={() => setSelectedJobIds([])}
                            className="ml-2 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
