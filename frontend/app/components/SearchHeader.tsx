import React from 'react';
import { useLanguage } from './LanguageProvider';
import { TranslationKey } from '../lib/languages';

interface SearchHeaderProps {
    jobCount: number;
    query: string;
    setQuery: (query: string) => void;
    onSearch: () => void;
    isCrawling: boolean;
    isProfileComplete?: boolean;
    headlineMsgkey: TranslationKey;
}

export default function SearchHeader({
    jobCount,
    query,
    setQuery,
    onSearch,
    isCrawling,
    isProfileComplete,
    headlineMsgkey
}: SearchHeaderProps) {
    const { t } = useLanguage();

    return (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800/50">
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                    {t(headlineMsgkey)}
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                    {jobCount} {t('opportunitiesDetected')}
                </p>
            </div>

            {/* SEARCH BAR (Deep Intelligence Style) */}
            <div id="search-container" className="flex items-center gap-2 w-full md:w-auto">
                <div className={`
                relative flex-1 md:w-96 flex items-center 
                bg-white dark:bg-slate-900 
                border-2 border-slate-100 dark:border-slate-800 
                rounded-xl px-4 py-3 
                transition-all duration-300
                focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:dark:shadow-[0_0_20px_rgba(99,102,241,0.2)]
              `}>
                    {!isProfileComplete && (
                        <div className="absolute inset-0 z-10 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                            <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 rounded-full border border-rose-200 dark:border-rose-900 shadow-sm flex items-center gap-1.5">
                                ⚠️ {t('completeProfileFirst')}
                            </span>
                        </div>
                    )}
                    <span className="text-slate-400 mr-3">⚡</span>
                    <input
                        className="w-full bg-transparent focus:outline-none text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
                        value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('searchPlaceholder')}
                        disabled={isCrawling || !isProfileComplete}
                        onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                    />
                </div>

                <button
                    onClick={onSearch}
                    disabled={isCrawling || !isProfileComplete}
                    title={!isProfileComplete ? t('completeProfileFirst') : (isCrawling ? t('crawlInProgress') : t('scan'))}
                    className={`
                  h-[50px] px-6 rounded-xl font-bold text-white shadow-lg transition-all duration-300 cursor-pointer
                  ${isCrawling || !isProfileComplete
                            ? 'bg-slate-300 dark:bg-slate-800 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 shadow-indigo-500/30'
                        }
                `}
                >
                    {isCrawling ? <span className="animate-spin text-xl">⚙️</span> : t('scan')}
                </button>
            </div>
        </div>
    );
}
