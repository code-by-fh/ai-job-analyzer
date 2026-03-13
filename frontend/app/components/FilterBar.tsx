import React from 'react';
import { Search, FileText, X, Building2, Tag, Clock, ChevronDown, LayoutGrid, SlidersHorizontal } from 'lucide-react';
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
    platformFilter: number | undefined;
    setPlatformFilter: (id: number | undefined) => void;
    availablePlatforms: { id: number; name: string }[];
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
    platformFilter,
    setPlatformFilter,
    availablePlatforms = [],
}: FilterBarProps) {
    const { t } = useLanguage();

    const hasActiveFilters = searchText || domainFilter || statusFilter || hasApplication || needsAttention || filterType !== 'all' || platformFilter !== undefined;

    const clearAllFilters = () => {
        setSearchText('');
        setDomainFilter('');
        setStatusFilter('');
        setHasApplication(false);
        setNeedsAttention(false);
        setPlatformFilter(undefined);
        setFilterType('all');
    };

    if (filterType === 'applications') return null;

    return (
        <div className="flex flex-col gap-4">
            {/* Top Row: Navigation Tabs, Search & Sort */}
            <div className="flex flex-col md:flex-row items-center gap-3">
                {/* Segmented Control */}
                <div className="flex bg-slate-100/80 dark:bg-slate-800/50 backdrop-blur-md p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 shadow-sm w-full md:w-auto">
                    {[
                        { id: 'all', label: t('all') },
                        { id: 'favorite', label: t('favorites') },
                        { id: 'no_favorite', label: t('noFavorites') }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setFilterType(tab.id as 'all' | 'favorite' | 'no_favorite')}
                            className={`flex-1 md:flex-none px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 whitespace-nowrap cursor-pointer ${filterType === tab.id
                                ? 'bg-white dark:bg-slate-700 shadow-lg shadow-indigo-500/10 text-indigo-600 dark:text-indigo-400 transform scale-[1.02]'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Primary Search Input */}
                <div className="relative flex-1 group w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                    <input
                        type="text"
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        placeholder={t('filterSearchPlaceholder')}
                        className="w-full pl-12 pr-12 py-3.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-200 placeholder-slate-400 transition-all duration-300 shadow-sm hover:shadow-md"
                    />
                    {searchText && (
                        <button
                            onClick={() => setSearchText('')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Compact Sort Segmented */}
                <div className="flex bg-slate-100/80 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 shadow-sm w-full md:w-auto shrink-0">
                    <button
                        onClick={() => setSortBy('score')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300 cursor-pointer ${sortBy === 'score'
                            ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400 scale-[1.02]'
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                            }`}
                        title={t('relevance')}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        <span className="md:hidden lg:inline">{t('relevance')}</span>
                    </button>
                    <button
                        onClick={() => setSortBy('date')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300 cursor-pointer ${sortBy === 'date'
                            ? 'bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400 scale-[1.02]'
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                            }`}
                        title={t('newest')}
                    >
                        <Clock className="w-4 h-4" />
                        <span className="md:hidden lg:inline">{t('newest')}</span>
                    </button>
                </div>
            </div>

            {/* Bottom Section: Dropdowns & Toggles */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

                {/* Select Group */}
                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Platform Select */}
                    <div className="relative group">
                        <LayoutGrid className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                        <select
                            value={platformFilter || ''}
                            onChange={e => setPlatformFilter(e.target.value ? Number(e.target.value) : undefined)}
                            className="w-full appearance-none pl-10 pr-10 py-3 text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm"
                        >
                            <option value="">{t('allPlatforms')}</option>
                            {availablePlatforms.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                    </div>

                    {/* Domain Select */}
                    <div className="relative group">
                        <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                        <select
                            value={domainFilter}
                            onChange={e => setDomainFilter(e.target.value)}
                            className="w-full appearance-none pl-10 pr-10 py-3 text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm"
                        >
                            <option value="">{t('allDomains')}</option>
                            {availableDomains.map(({ domain, count }) => (
                                <option key={domain} value={domain}>{domain} ({count})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                    </div>

                    {/* Status Select */}
                    <div className="relative group">
                        <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="w-full appearance-none pl-10 pr-10 py-3 text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm"
                        >
                            <option value="">{t('allStatuses')}</option>
                            {JOB_STATUSES.map(s => (
                                <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                    </div>
                </div>

                {/* Toggles */}
                <div className="lg:col-span-4 flex flex-wrap gap-2 items-center lg:justify-end">
                    <button
                        onClick={() => setHasApplication(!hasApplication)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl border transition-all duration-300 cursor-pointer whitespace-nowrap shadow-sm active:scale-95 ${hasApplication
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300 ring-2 ring-indigo-500/10'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                            }`}
                    >
                        <FileText className={`w-4 h-4 ${hasApplication ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                        {t('withApplication')}
                    </button>

                    <button
                        onClick={() => setNeedsAttention(!needsAttention)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl border transition-all duration-300 cursor-pointer whitespace-nowrap shadow-sm active:scale-95 ${needsAttention
                            ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-300 ring-2 ring-amber-500/10'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-amber-200'
                            }`}
                    >
                        <Clock className={`w-4 h-4 ${needsAttention ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                        {t('needsAttention')}
                        {needsAttentionCount > 0 && (
                            <span className={`ml-1 flex items-center justify-center text-[10px] h-5 min-w-[20px] px-1.5 rounded-full font-bold transition-colors ${needsAttention
                                ? 'bg-amber-600 text-white shadow-sm shadow-amber-500/30'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20'
                                }`}>
                                {needsAttentionCount}
                            </span>
                        )}
                    </button>

                    {hasActiveFilters && (
                        <button
                            onClick={clearAllFilters}
                            className="p-3 text-rose-500 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl hover:bg-rose-100 transition-all cursor-pointer shadow-sm active:scale-95"
                            title={t('clearAllFilters')}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
