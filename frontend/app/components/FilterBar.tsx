import React from 'react';
import { useLanguage } from './LanguageProvider';

interface FilterBarProps {
    filterType: 'all' | 'favorite' | 'no_favorite' | 'applications';
    setFilterType: (type: 'all' | 'favorite' | 'no_favorite' | 'applications') => void;
    sortBy: 'score' | 'date';
    setSortBy: (sort: 'score' | 'date') => void;
}

export default function FilterBar({
    filterType,
    setFilterType,
    sortBy,
    setSortBy
}: FilterBarProps) {
    const { t } = useLanguage();

    if (filterType === 'applications') return null;

    return (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Filter Tabs */}
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
    );
}
