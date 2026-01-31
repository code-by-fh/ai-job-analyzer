import { Loader2, ExternalLink, CheckCircle, Circle, ArrowRight, Pause } from 'lucide-react';
import { useLanguage } from './LanguageProvider';

export interface CrawlJob {
    job_id: string;
    platform: string;
    total: number;
    scraping_completed: number;
    analysis_completed: number;
    jobs_saved?: number;  // Number of jobs that have been saved (new_job events received)
    status: string;
    started_at?: string;
    current_job_title?: string;
    show_success?: boolean;
    analyzing_jobs?: string[];  // List of job titles currently being analyzed
    all_job_titles?: string[];  // List of all job titles that have been analyzed
}

interface CrawlStatusProps {
    jobs: CrawlJob[];
}

export default function CrawlStatus({ jobs }: CrawlStatusProps) {
    const { t } = useLanguage();
    if (jobs.length === 0) return null;

    return (
        <div className="space-y-4">
            {jobs.map((job) => {
                const isSearching = job.total === 0;
                const isFound = job.total > 0;
                const isScraping = job.scraping_completed > 0 && job.scraping_completed < job.total;
                const isScrapingDone = job.scraping_completed >= job.total && job.total > 0;
                const isAnalyzing = (job.analyzing_jobs && job.analyzing_jobs.length > 0) || (job.analysis_completed > 0 && !job.show_success);
                const isAnalysisDone = job.show_success === true;

                return (
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
                            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                                ID: {job.job_id.slice(0, 8)}
                            </div>
                        </div>

                        <div className="space-y-4 relative">
                            {/* Connecting Line */}
                            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-800 -z-10" />

                            {/* Step 1: Suche */}
                            <div className="flex items-center gap-4">
                                <div className={`
                  relative z-10 flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors duration-300
                  ${isSearching
                                        ? 'border-indigo-600 bg-white dark:bg-slate-900'
                                        : 'border-emerald-500 bg-emerald-500'}
                `}>
                                    {isSearching ? (
                                        <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                                    ) : (
                                        <CheckCircle className="w-3 h-3 text-white" />
                                    )}
                                </div>
                                <span className={`text-sm ${isSearching ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-500'}`}>
                                    {t('searchingForJobs')}
                                </span>
                            </div>

                            {/* Step 2: Gefunden */}
                            <div className="flex items-center gap-4">
                                <div className={`
                  relative z-10 flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors duration-300
                  ${!isFound
                                        ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                        : 'border-emerald-500 bg-emerald-500'}
                `}>
                                    {!isFound ? (
                                        <Circle className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                                    ) : (
                                        <CheckCircle className="w-3 h-3 text-white" />
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm ${isFound ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}>
                                        {isFound ? `${job.total} ${t('jobsFound')}` : t('jobsFound')}
                                    </span>
                                    {isFound && (
                                        <span className="text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                                            Match!
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Step 3: Lade Job-Details */}
                            <div className="flex items-center gap-4">
                                <div className={`
                  relative z-10 flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors duration-300
                  ${!isScraping && !isScrapingDone
                                        ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                        : isScrapingDone
                                            ? 'border-emerald-500 bg-emerald-500'
                                            : 'border-indigo-600 bg-white dark:bg-slate-900'}
                `}>
                                    {!isScraping && !isScrapingDone ? (
                                        <Circle className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                                    ) : isScrapingDone ? (
                                        <CheckCircle className="w-3 h-3 text-white" />
                                    ) : (
                                        <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-sm ${isScraping ? 'font-medium text-indigo-600 dark:text-indigo-400' : isScrapingDone ? 'text-slate-500 dark:text-slate-500' : 'text-slate-400 dark:text-slate-600'}`}>
                                        {isScraping || isScrapingDone
                                            ? t('processingJobDetails', { count: job.scraping_completed, total: job.total })
                                            : t('loadJobDetails')}
                                    </span>
                                    {isScraping && (
                                        <span className="text-[10px] text-slate-400">
                                            {t('extractingDescriptions')}
                                        </span>
                                    )}
                                </div>
                            </div>


                            {/* Step 4: Analysiere Jobs */}
                            <div className="flex items-center gap-4">
                                <div className={`
                  relative z-10 flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors duration-300
                  ${!isAnalyzing && !isAnalysisDone
                                        ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                        : isAnalysisDone
                                            ? 'border-emerald-500 bg-emerald-500'
                                            : 'border-amber-600 bg-white dark:bg-slate-900'}
                `}>
                                    {!isAnalyzing && !isAnalysisDone ? (
                                        <Pause className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                                    ) : isAnalysisDone ? (
                                        <CheckCircle className="w-3 h-3 text-white" />
                                    ) : (
                                        <Loader2 className="w-3 h-3 text-amber-600 animate-spin" />
                                    )}
                                </div>
                                <div className="flex flex-col flex-1">
                                    <span className={`text-sm ${isAnalyzing && !isAnalysisDone ? 'font-medium text-amber-600 dark:text-amber-400' : isAnalysisDone ? 'text-slate-500 dark:text-slate-500' : 'text-slate-400 dark:text-slate-600'}`}>
                                        {isAnalyzing && !isAnalysisDone
                                            ? t('analyzingCount', { count: job.jobs_saved || 0, total: job.total })
                                            : isAnalysisDone
                                                ? t('analyzingCount', { count: job.total, total: job.total })
                                                : t('analysis')
                                        }
                                    </span>
                                </div>
                            </div>

                            {/* Success Message */}
                            {job.show_success && (
                                <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        <div>
                                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                                {t('allJobsAnalyzed')}
                                            </p>
                                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                                {t('jobsRatedAndSaved', {
                                                    count: job.total,
                                                    jobs: job.total === 1 ? t('job') : t('jobs')
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                );
            })}
        </div>
    );
}
