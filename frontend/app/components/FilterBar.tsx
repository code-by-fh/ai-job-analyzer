import React from 'react';
import { Search, FileText, X } from 'lucide-react';
import { useLanguage } from './LanguageProvider';

const JOB_STATUSES = [
    { value: 'OPEN', labelKey: 'statusOpen' },
    { value: 'COMPLETED', labelKey: 'statusDrafted' },
    { value: 'APPLIED', labelKey: 'statusApplied' },
    { value: 'INTERVIEW', labelKey: 'statusInterview' },
    { value: 'OFFER', labelKey: 'statusOffer' },
    { value: 'REJECTED', labelKey: 'statusRejected' },
    { value: 'ACCEPTED', labelKey: 'statusAccepted' },
    { value: 'FAILED', labelKey: 'failedRetry' },
] as const;

interface FilterBarProps {
    filterType: 'all' | 'favorite' | 'no_favorite' | 'applications';
    setFilterType: (type: 'all' | 'favorite' | 'no_favorite' | 'applications') => void;
    sortBy: 'score' | 'date';
    setSortBy: (sort: 'score' | 'date') => void;
    searchText: string;
    setSearchText: (text: string) => void;
    domainFilter: string;
    setDomainFilter: (domain: string) => void;
    availableDomains: { domain: string; count: number }[];
    hasApplication: boolean;
    setHasApplication: (v: boolean) => void;
    statusFilter: string;
    setStatusFilter: (v: string) => void;
}

export default function FilterBar({
    filterType,
    setFilterType,
    sortBy,
    setSortBy,
    searchText,
    setSearchText,
    domainFilter,
    setDomainFilter,
    availableDomains,
    hasApplication,
    setHasApplication,
    statusFilter,
    setStatusFilter,
}: FilterBarProps) {
    const { t } = useLanguage();

    const hasActiveFilters = searchText || domainFilter || statusFilter || hasApplication;

    const clearAllFilters = () => {
        setSearchText('');
        setDomainFilter('');
        setStatusFilter('');
        setHasApplication(false);
    };

    if (filterType === 'applications') return null;

    return (
        <div className="flex flex-col gap-3">
            {/* Row 1: Tabs + Sort */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl">
                    <button
                        onClick={() => setFilterType('all')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${filterType === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        {t('all')}
                    </button>
                    <button
                        onClick={() => setFilterType('favorite')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${filterType === 'favorite' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        {t('favorites')}
                    </button>
                    <button
                        onClick={() => setFilterType('no_favorite')}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${filterType === 'no_favorite' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    >
                        {t('noFavorites')}
                    </button>
                </div>

                <div id="sort-controls" className="flex justify-end gap-2 text-sm text-slate-500">
                    <span className="self-center mr-2">{t('sortBy')}</span>
                    <button onClick={() => setSortBy('score')} className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${sortBy === 'score' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{t('relevance')}</button>
                    <button onClick={() => setSortBy('date')} className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${sortBy === 'date' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{t('newest')}</button>
                </div>
            </div>

            {/* Row 2: Search + Domain + Status + Application toggle */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        placeholder={t('filterSearchPlaceholder')}
                        className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder-slate-400"
                    />
                    {searchText && (
                        <button
                            onClick={() => setSearchText('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <select
                    value={domainFilter}
                    onChange={e => setDomainFilter(e.target.value)}
                    className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                    <option value="">{t('allDomains')}</option>
                    {availableDomains.map(({ domain, count }) => (
                        <option key={domain} value={domain}>{domain} ({count})</option>
                    ))}
                </select>

                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                    <option value="">{t('allStatuses')}</option>
                    {JOB_STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                    ))}
                </select>

                <button
                    onClick={() => setHasApplication(!hasApplication)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                        hasApplication
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                >
                    <FileText className="w-4 h-4" />
                    {t('withApplication')}
                </button>

                {hasActiveFilters && (
                    <button
                        onClick={clearAllFilters}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-slate-800 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer whitespace-nowrap"
                    >
                        <X className="w-3.5 h-3.5" />
                        {t('clearAllFilters')}
                    </button>
                )}
            </div>
        </div>
    );
}
