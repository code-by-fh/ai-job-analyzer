"use client";
import { Platform } from './types';

type TestStatus = 'idle' | 'sending' | 'ok' | 'error';

interface NotificationAdaptersProps {
    platform: Platform;
    configuredAdapters: string[];
    onToggleAdapter: (platform: Platform, adapter: string) => void;
    onOpenTemplateModal: (platform: Platform) => void;
    pushoverTestStatus: Record<number, TestStatus>;
    pushoverTestError: Record<number, string | null>;
    onSendTestPushover: (platformId: number) => void;
    isAdmin: boolean;
}

const SpinnerIcon = () => (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
);
const CheckIcon = () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
    </svg>
);
const XIcon = () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export default function NotificationAdapters({
    platform,
    configuredAdapters,
    onToggleAdapter,
    onOpenTemplateModal,
    pushoverTestStatus,
    pushoverTestError,
    onSendTestPushover,
    isAdmin,
}: NotificationAdaptersProps) {
    const adapters = (['GMAIL', 'PUSHOVER'] as const).filter(a => configuredAdapters.includes(a));
    if (adapters.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {adapters.map((adapter) => {
                const active = (platform.notification_adapters || []).includes(adapter);
                
                return (
                    <div 
                        key={adapter} 
                        className={`group/adapter flex items-center p-0.5 rounded-xl border transition-all duration-300
                            ${active 
                                ? 'bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200/60 dark:border-indigo-800/40 shadow-sm' 
                                : 'bg-slate-100/30 dark:bg-slate-900/10 border-slate-200/40 dark:border-slate-800/30 border-dashed opacity-60 hover:opacity-100'
                            }`}
                    >
                        {/* Main Toggle Button */}
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleAdapter(platform, adapter); }}
                            title={active ? `Disable ${adapter} notifications` : `Enable ${adapter} notifications`}
                            className={`h-7 flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2.5 rounded-lg text-[10px] font-bold tracking-wide transition-all cursor-pointer whitespace-nowrap
                                ${active
                                    ? 'text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 shadow-sm border border-indigo-100 dark:border-indigo-900/50'
                                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 grayscale'
                                }`}
                        >
                            <div className="relative">
                                {adapter === 'GMAIL' ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <rect x="7" y="2" width="10" height="20" rx="2" ry="2" strokeWidth={1.8} />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 18h.01" />
                                    </svg>
                                )}
                                {!active && (
                                    <div className="absolute inset-0 flex items-center justify-center rotate-45">
                                        <div className="w-full h-0.5 bg-slate-400/50 rounded-full" />
                                    </div>
                                )}
                            </div>
                            <span className={`hidden sm:inline-block ${!active ? 'opacity-50' : ''}`}>
                                {adapter === 'GMAIL' ? 'Mail' : 'Push'}
                            </span>
                            {!active && <span className="text-[8px] font-black opacity-30 ml-0.5 uppercase tracking-tighter">Off</span>}
                        </button>

                        <div className={`w-px h-4 mx-0.5 transition-colors ${active ? 'bg-indigo-200/50 dark:bg-indigo-800/50' : 'bg-slate-200/40 dark:bg-slate-800/40'}`} />

                        {/* Action Area (Settings/Test) */}
                        <div className="flex flex-col items-center">
                            {adapter === 'GMAIL' ? (
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenTemplateModal(platform); }}
                                    title={platform.gmail_template ? 'Edit Gmail template' : 'Add Gmail template'}
                                    className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer
                                        ${platform.gmail_template
                                            ? 'text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
                                            : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                                        }`}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                            ) : (() => {
                                const st = pushoverTestStatus[platform.id] || 'idle';
                                const err = pushoverTestError[platform.id];
                                return (
                                    <div className="relative group/test flex flex-col items-center">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSendTestPushover(platform.id); }}
                                            disabled={st === 'sending'}
                                            title={st === 'ok' ? 'Sent!' : st === 'error' ? (isAdmin && err ? err : 'Failed') : 'Send test notification'}
                                            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer disabled:opacity-50
                                                ${st === 'ok'
                                                    ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                                                    : st === 'error'
                                                        ? 'text-rose-500 bg-rose-50 dark:bg-rose-500/10'
                                                        : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                                                }`}
                                        >
                                            {st === 'sending' && <SpinnerIcon />}
                                            {st === 'ok' && <CheckIcon />}
                                            {st === 'error' && <XIcon />}
                                            {st === 'idle' && (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                            )}
                                        </button>
                                        {st === 'error' && err && isAdmin && (
                                            <div className="absolute top-full mt-1 z-20 pointer-events-none">
                                                <div className="bg-rose-500 text-white text-[8px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap font-mono leading-tight">
                                                    {err}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
