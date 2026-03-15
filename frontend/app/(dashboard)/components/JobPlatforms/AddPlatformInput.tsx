"use client";
import { useLanguage } from '../../../components/LanguageProvider';

interface AddPlatformInputProps {
    newUrl: string;
    onUrlChange: (url: string) => void;
    onAdd: () => void;
    isProfileComplete: boolean;
}

export default function AddPlatformInput({ newUrl, onUrlChange, onAdd, isProfileComplete }: AddPlatformInputProps) {
    const { t } = useLanguage();

    return (
        <div className="relative mt-3">
            {!isProfileComplete && (
                <div className="absolute inset-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        {t('completeProfileFirst')}
                    </span>
                </div>
            )}
            <div className="flex items-center gap-2 p-2 pl-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 focus-within:border-indigo-300 dark:focus-within:border-indigo-800 transition-colors">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <input
                    value={newUrl}
                    onChange={(e) => onUrlChange(e.target.value)}
                    className="flex-1 bg-transparent border-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-0 py-1 disabled:opacity-50"
                    placeholder={t('addPlatformPlaceholder')}
                    onKeyDown={(e) => e.key === 'Enter' && onAdd()}
                    disabled={!isProfileComplete}
                />
                <button
                    onClick={onAdd}
                    disabled={!isProfileComplete || !newUrl.trim()}
                    className="flex items-center gap-1.5 px-3 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 dark:disabled:text-slate-600 text-xs font-semibold rounded-lg transition-all shadow-sm shadow-indigo-500/20 cursor-pointer disabled:cursor-not-allowed disabled:shadow-none"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Add</span>
                </button>
            </div>
        </div>
    );
}
