"use client";

import React, { useState } from 'react';
import { useLanguage } from './LanguageProvider';
import { TranslationKey } from '../lib/languages';

export type JobStatus = 'OPEN' | 'DRAFTED' | 'APPLIED' | 'INTERVIEW' | 'REJECTED' | 'OFFER' | 'ACCEPTED' | 'GENERATING' | 'FAILED';

interface JobStatusBadgeProps {
    status: string;
    onStatusChange?: (newStatus: JobStatus) => void;
    isReadOnly?: boolean;
}

export default function JobStatusBadge({ status, onStatusChange, isReadOnly = false }: JobStatusBadgeProps) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    const getStatusConfig = (s: string) => {
        switch (s) {
            case 'OPEN':
                return { label: t('statusOpen'), color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: '🔍' };
            case 'DRAFTED':
                return { label: t('statusDrafted'), color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300', icon: '📝' };
            case 'APPLIED':
                return { label: t('statusApplied'), color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300', icon: '✉️' };
            case 'INTERVIEW':
                return { label: t('statusInterview'), color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300', icon: '🤝' };
            case 'OFFER':
                return { label: t('statusOffer'), color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', icon: '🎉' };
            case 'REJECTED':
                return { label: t('statusRejected'), color: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300', icon: '❌' };
            case 'ACCEPTED':
                return { label: t('statusAccepted'), color: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300', icon: '🎊' };
            case 'GENERATING':
                return { label: t('processing'), color: 'bg-indigo-500 text-white animate-pulse', icon: '⚙️' };
            case 'FAILED':
                return { label: t('failedRetry'), color: 'bg-rose-500 text-white', icon: '⚠️' };
            default:
                return { label: s, color: 'bg-slate-100 text-slate-600', icon: '❓' };
        }
    };

    const config = getStatusConfig(status);

    const statuses: JobStatus[] = ['OPEN', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'ACCEPTED'];

    if (isReadOnly || status === 'GENERATING') {
        return (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
                <span>{config.icon}</span>
                <span>{config.label}</span>
            </div>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105 active:scale-95 cursor-pointer ${config.color}`}
            >
                <span>{config.icon}</span>
                <span>{config.label}</span>
                <span className="text-[8px] opacity-50">▼</span>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b border-slate-100 dark:border-slate-800 mb-1">
                            {t('updateStatus')}
                        </div>
                        {statuses.map((s) => {
                            const c = getStatusConfig(s);
                            return (
                                <button
                                    key={s}
                                    onClick={() => {
                                        onStatusChange?.(s);
                                        setIsOpen(false);
                                    }}
                                    className={`
                    w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800
                    ${status === s ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10' : 'text-slate-600 dark:text-slate-400'}
                  `}
                                >
                                    <span>{c.icon}</span>
                                    <span>{c.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
