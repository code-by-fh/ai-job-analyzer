import React from 'react';
import { Search, FileText, X, Building2, Tag, Clock, ChevronDown } from 'lucide-react';
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
    needsAttention: boolean;
    setNeedsAttention: (v: boolean) => void;
    needsAttentionCount?: number;
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
    needsAttention,
    setNeedsAttention,
    needsAttentionCount = 0,
}: FilterBarProps) {
    const { t } = useLanguage();

    const hasActiveFilters = searchText || domainFilter || statusFilter || hasApplication || needsAttention || filterType !== 'all';

    const clearAllFilters = () => {
        setSearchText('');
        setDomainFilter('');
        setStatusFilter('');
        setHasApplication(false);
        setNeedsAttention(false);
        setFilterType('all');
        setSortBy('score');
    };

    if (filterType === 'applications') return null;

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl p-4 flex flex-col gap-4 transition-all duration-300">
            {/* Top Row: Tabs + Sort */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
                {/* Segmented Control for Type */}
                <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50 shadow-inner w-full sm:w-auto overflow-x-auto no-scrollbar">
                    {[
                        { id: 'all', label: t('all') },
                        { id: 'favorite', label: t('favorites') },
                        { id: 'no_favorite', label: t('noFavorites') }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterType(tab.id as 'all' | 'favorite' | 'no_favorite')}
                            className={`flex-1 sm:flex-none px-5 py-2 text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer ${filterType === tab.id
                                ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400 transform scale-[1.02]'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Sort Controls */}
                <div id="sort-controls" className="flex items-center gap-2 text-sm w-full sm:w-auto justify-end">
                    <span className="text-slate-400 font-medium mr-1 hidden sm:inline">{t('sortBy')}</span>
                    <div className="flex bg-slate-50 dark:bg-slate-800/40 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner">
                        <button
                            onClick={() => setSortBy('score')}
                            className={`px-4 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer ${sortBy === 'score'
                                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium'
                                }`}
                        >
                            {t('relevance')}
                        </button>
                        <button
                            onClick={() => setSortBy('date')}
                            className={`px-4 py-1.5 rounded-lg transition-all duration-200 whitespace-nowrap cursor-pointer ${sortBy === 'date'
                                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium'
                                }`}
                        >
                            {t('newest')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Search + Domain + Status + Application toggle */}
            <div className="flex flex-col xl:flex-row gap-3 items-stretch xl:items-center">
                {/* Search Input */}
                <div className="relative flex-1 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                    <input
                        type="text"
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        placeholder={t('filterSearchPlaceholder')}
                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-200 placeholder-slate-400 transition-all duration-300 shadow-inner focus:shadow-sm"
                    />
                    {searchText && (
                        <button
                            onClick={() => setSearchText('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2 xl:pb-0 no-scrollbar items-center">
                    {/* Domain Select */}
                    <div className="relative group shrink-0">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                        <select
                            value={domainFilter}
                            onChange={e => setDomainFilter(e.target.value)}
                            className="appearance-none pl-9 pr-10 py-2.5 text-sm font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer transition-all duration-300 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm"
                        >
                            <option value="">{t('allDomains')}</option>
                            {availableDomains.map(({ domain, count }) => (
                                <option key={domain} value={domain}>{domain} ({count})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Status Select */}
                    <div className="relative group shrink-0">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="appearance-none pl-9 pr-10 py-2.5 text-sm font-medium bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer transition-all duration-300 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm"
                        >
                            <option value="">{t('allStatuses')}</option>
                            {JOB_STATUSES.map(s => (
                                <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Toggles */}
                    <div className="flex gap-2 shrink-0">
                        <button
                            onClick={() => setHasApplication(!hasApplication)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all duration-300 cursor-pointer whitespace-nowrap shadow-sm hover:shadow active:scale-95 ${hasApplication
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 dark:hover:bg-slate-800/80'
                                }`}
                        >
                            <FileText className={`w-4 h-4 ${hasApplication ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                            {t('withApplication')}
                        </button>

                        <button
                            onClick={() => setNeedsAttention(!needsAttention)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-all duration-300 cursor-pointer whitespace-nowrap shadow-sm hover:shadow active:scale-95 ${needsAttention
                                ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-300 ring-2 ring-amber-500/20'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:bg-amber-50/30 dark:hover:border-slate-600 dark:hover:bg-slate-800/80'
                                }`}
                        >
                            <Clock className={`w-4 h-4 ${needsAttention ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                            {t('needsAttention')}
                            {needsAttentionCount > 0 && (
                                <span className={`ml-1 flex items-center justify-center text-[11px] h-5 min-w-[20px] px-1.5 rounded-full font-bold transition-colors ${needsAttention
                                    ? 'bg-amber-600 text-white dark:bg-amber-500'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/30 dark:text-amber-400'
                                    }`}>
                                    {needsAttentionCount}
                                </span>
                            )}
                        </button>

                        {hasActiveFilters && (
                            <button
                                onClick={clearAllFilters}
                                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 hover:border-rose-300 dark:hover:bg-rose-500/20 transition-all duration-300 cursor-pointer whitespace-nowrap shadow-sm active:scale-95"
                                title={t('clearAllFilters')}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
