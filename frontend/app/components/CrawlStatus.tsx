import { Loader2, ExternalLink, CheckCircle, Circle, Pause } from 'lucide-react';
import { useLanguage } from './LanguageProvider';

export interface CrawlJob {
    job_id: string;
    platform: string;
    total: number;
    scraping_completed: number;
    analysis_completed: number;
    jobs_saved?: number;
    jobs_skipped?: number;
    status: string;
    error_message?: string;
    started_at?: string;
    current_job_title?: string;
    show_success?: boolean;
    analyzing_jobs?: string[];
    all_job_titles?: string[];
}

interface CrawlStatusProps {
    jobs: CrawlJob[];
    onCancel?: (jobId: string) => void;
}

export function CrawlSteps({ job, compact = false, onCancel }: {
    job: CrawlJob;
    compact?: boolean;
    onCancel?: (jobId: string) => void;
}) {
    const { t } = useLanguage();
    const isFailed = job.status === 'failed';
    const isSearching = job.total === 0 && !isFailed;
    const isFound = job.total > 0;
    const isScraping = job.scraping_completed > 0 && job.scraping_completed < job.total && !isFailed;
    const isScrapingDone = job.scraping_completed >= job.total && job.total > 0;
    const isAnalyzing = (job.analyzing_jobs && job.analyzing_jobs.length > 0) || (job.analysis_completed > 0 && !job.show_success && !isFailed);
    const isAnalysisDone = job.show_success === true;

    const ic = compact ? 'w-4 h-4' : 'w-6 h-6';
    const ii = compact ? 'w-2.5 h-2.5' : 'w-3 h-3';
    const tc = compact ? 'text-xs' : 'text-sm';
    const gap = compact ? 'gap-2.5' : 'gap-4';

    return (
        <div className={`${compact ? 'space-y-2.5' : 'space-y-4'} relative`}>
            <div className={`absolute ${compact ? 'left-[7px]' : 'left-[11px]'} top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-800 -z-10`} />

            {/* Step 1: Suche */}
            <div className={`flex items-center ${gap}`}>
                <div className={`relative z-10 flex items-center justify-center ${ic} rounded-full border-2 transition-colors duration-300 ${
                    isSearching ? 'border-indigo-600 bg-white dark:bg-slate-900'
                    : isFailed && job.total === 0 ? 'border-rose-500 bg-rose-500'
                    : 'border-emerald-500 bg-emerald-500'
                }`}>
                    {isSearching ? (
                        <Loader2 className={`${ii} text-indigo-600 animate-spin`} />
                    ) : isFailed && job.total === 0 ? (
                        <svg className={`${ii} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <CheckCircle className={`${ii} text-white`} />
                    )}
                </div>
                <span className={`${tc} ${isSearching ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-500'}`}>
                    {t('searchingForJobs')}
                </span>
            </div>

            {/* Step 2: Gefunden */}
            <div className={`flex items-center ${gap}`}>
                <div className={`relative z-10 flex items-center justify-center ${ic} rounded-full border-2 transition-colors duration-300 ${
                    !isFound ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    : 'border-emerald-500 bg-emerald-500'
                }`}>
                    {!isFound ? (
                        <Circle className={`${ii} text-slate-300 dark:text-slate-600`} />
                    ) : (
                        <CheckCircle className={`${ii} text-white`} />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span className={`${tc} ${isFound ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}>
                        {isFound ? `${job.total} ${t('jobsFound')}` : t('jobsFound')}
                    </span>
                    {isFound && !compact && (
                        <span className="text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">Match!</span>
                    )}
                </div>
            </div>

            {/* Step 3: Details laden */}
            <div className={`flex items-center ${gap}`}>
                <div className={`relative z-10 flex items-center justify-center ${ic} rounded-full border-2 transition-colors duration-300 ${
                    !isScraping && !isScrapingDone ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    : isScrapingDone ? 'border-emerald-500 bg-emerald-500'
                    : 'border-indigo-600 bg-white dark:bg-slate-900'
                }`}>
                    {!isScraping && !isScrapingDone ? (
                        <Circle className={`${ii} text-slate-300 dark:text-slate-600`} />
                    ) : isScrapingDone ? (
                        <CheckCircle className={`${ii} text-white`} />
                    ) : (
                        <Loader2 className={`${ii} text-indigo-600 animate-spin`} />
                    )}
                </div>
                <div className="flex flex-col">
                    <span className={`${tc} ${isScraping ? 'font-medium text-indigo-600 dark:text-indigo-400' : isScrapingDone ? 'text-slate-500 dark:text-slate-500' : 'text-slate-400 dark:text-slate-600'}`}>
                        {isScraping || isScrapingDone
                            ? t('processingJobDetails', { count: job.scraping_completed, total: job.total })
                            : t('loadJobDetails')}
                    </span>
                    {isScraping && !compact && (
                        <span className="text-[10px] text-slate-400">{t('extractingDescriptions')}</span>
                    )}
                </div>
            </div>

            {/* Step 4: Analyse */}
            <div className={`flex items-center ${gap}`}>
                <div className={`relative z-10 flex items-center justify-center ${ic} rounded-full border-2 transition-colors duration-300 ${
                    !isAnalyzing && !isAnalysisDone ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                    : isAnalysisDone ? 'border-emerald-500 bg-emerald-500'
                    : 'border-amber-600 bg-white dark:bg-slate-900'
                }`}>
                    {!isAnalyzing && !isAnalysisDone ? (
                        <Pause className={`${ii} text-slate-300 dark:text-slate-600`} />
                    ) : isAnalysisDone ? (
                        <CheckCircle className={`${ii} text-white`} />
                    ) : (
                        <Loader2 className={`${ii} text-amber-600 animate-spin`} />
                    )}
                </div>
                <div className="flex flex-col flex-1">
                    <span className={`${tc} ${isAnalyzing && !isAnalysisDone ? 'font-medium text-amber-600 dark:text-amber-400' : isAnalysisDone ? 'text-slate-500 dark:text-slate-500' : 'text-slate-400 dark:text-slate-600'}`}>
                        {isAnalyzing && !isAnalysisDone
                            ? t('analyzingCount', { count: (job?.jobs_saved ?? 0) + (job?.jobs_skipped ?? 0), total: job.total })
                            : isAnalysisDone
                                ? t('analyzingCount', { count: job.total, total: job.total })
                                : t('analysis')}
                    </span>
                    {(job?.jobs_skipped ?? 0) > 0 && !compact && (
                        <span className="text-xs text-slate-400 ml-1">({job.jobs_skipped} Skipped)</span>
                    )}
                </div>
            </div>

            {/* Success */}
            {job.show_success && (
                <div className={`${compact ? 'mt-2 p-2' : 'mt-4 p-4'} bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg`}>
                    <div className="flex items-center gap-2">
                        <CheckCircle className={`${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-emerald-600 dark:text-emerald-400`} />
                        <div>
                            <p className={`${tc} font-semibold text-emerald-700 dark:text-emerald-300`}>
                                {t('allJobsAnalyzed')}
                            </p>
                            {!compact && (
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    {t('jobsRatedAndSaved', { count: job.total, jobs: job.total === 1 ? t('job') : t('jobs') })}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Error */}
            {isFailed && (
                <div className={`${compact ? 'mt-2 p-2.5' : 'mt-4 p-4'} bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg`}>
                    <div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-3'}`}>
                        <div className="flex items-start gap-2">
                            <svg className={`${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} text-rose-600 dark:text-rose-400 shrink-0 mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                {!compact && <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Ein Fehler ist aufgetreten</p>}
                                <p className={`${compact ? 'text-xs' : 'text-xs mt-1'} text-rose-600 dark:text-rose-400 break-words`}>
                                    {job.error_message || 'Unbekannter Fehler'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function CrawlStatus({ jobs, onCancel }: CrawlStatusProps) {
    const { t } = useLanguage();
    if (jobs.length === 0) return null;

    return (
        <div className="space-y-4">
            {jobs.map((job) => (
                <div
                    key={job.job_id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm animate-in fade-in duration-300"
                >
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
                                <ExternalLink className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                    {t('jobSearch')}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono" title={job.platform}>
                                    {job.platform}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                                ID: {job.job_id.slice(0, 8)}
                            </div>
                            {onCancel && !job.show_success && (
                                <button
                                    onClick={() => onCancel(job.job_id)}
                                    className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors cursor-pointer"
                                    title={t('cancelCrawl')}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                    <CrawlSteps job={job} onCancel={onCancel} />
                </div>
            ))}
        </div>
    );
}
