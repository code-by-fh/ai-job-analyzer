import React, { useState } from 'react';
import { useLanguage } from './LanguageProvider';
import { Search, FileText, Mail, Handshake, Trophy, XCircle, PartyPopper, Loader2, AlertTriangle, HelpCircle, ChevronDown } from 'lucide-react';

export type JobStatus = 'OPEN' | 'DRAFTED' | 'APPLIED' | 'INTERVIEW' | 'REJECTED' | 'OFFER' | 'ACCEPTED' | 'GENERATING' | 'FAILED';

interface JobStatusBadgeProps {
    status: string;
    onStatusChange?: (newStatus: JobStatus) => void;
    isReadOnly?: boolean;
    size?: 'small' | 'large';
}

export default function JobStatusBadge({ status, onStatusChange, isReadOnly = false, size = 'small' }: JobStatusBadgeProps) {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);

    const getStatusConfig = (s: string) => {
        const isLarge = size === 'large';
        const base = `border font-bold uppercase tracking-wider transition-all duration-300 backdrop-blur-md shadow-sm flex items-center justify-center gap-2 ${isLarge
            ? 'text-[11px] px-4 h-[42px] min-w-[140px] rounded-xl w-full sm:w-auto'
            : 'text-[10px] px-2.5 py-1 rounded-lg'
            }`;
        const iconSize = isLarge ? 18 : 14;

        switch (s) {
            case 'OPEN':
                return {
                    label: t('statusOpen') || 'Open',
                    color: 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800/30 dark:border-slate-700/50 dark:text-slate-400',
                    icon: <Search size={iconSize} />,
                    className: base
                };
            case 'DRAFTED':
                return {
                    label: t('statusDrafted') || 'Draft',
                    color: 'bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-400',
                    icon: <FileText size={iconSize} />,
                    className: base + ' dark:shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                };
            case 'APPLIED':
                return {
                    label: t('statusApplied') || 'Applied',
                    color: 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400',
                    icon: <Mail size={iconSize} />,
                    className: base + ' dark:shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                };
            case 'INTERVIEW':
                return {
                    label: t('statusInterview') || 'Interview',
                    color: 'bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400',
                    icon: <Handshake size={iconSize} />,
                    className: base + ' dark:shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                };
            case 'OFFER':
                return {
                    label: t('statusOffer') || 'Offer',
                    color: 'bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400',
                    icon: <Trophy size={iconSize} />,
                    className: base + ' dark:shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                };
            case 'REJECTED':
                return {
                    label: t('statusRejected') || 'Rejected',
                    color: 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400',
                    icon: <XCircle size={iconSize} />,
                    className: base
                };
            case 'ACCEPTED':
                return {
                    label: t('statusAccepted') || 'Accepted',
                    color: 'bg-teal-50 border-teal-100 text-teal-600 dark:bg-teal-500/10 dark:border-teal-500/20 dark:text-teal-400',
                    icon: <PartyPopper size={iconSize} />,
                    className: base + ' dark:shadow-[0_0_15px_rgba(20,184,166,0.2)]'
                };
            case 'GENERATING':
                return {
                    label: t('processing') || 'Processing...',
                    color: 'bg-indigo-600 text-white border-transparent animate-pulse shadow-indigo-500/20',
                    icon: <Loader2 size={iconSize} className="animate-spin" />,
                    className: base
                };
            case 'FAILED':
                return {
                    label: t('failedRetry') || 'Failed',
                    color: 'bg-rose-600 text-white border-transparent shadow-rose-500/20',
                    icon: <AlertTriangle size={iconSize} />,
                    className: base
                };
            default:
                return {
                    label: s,
                    color: 'bg-slate-100 border-slate-200 text-slate-600',
                    icon: <HelpCircle size={iconSize} />,
                    className: base
                };
        }
    };

    const config = getStatusConfig(status);

    const statuses: JobStatus[] = ['OPEN', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'ACCEPTED'];

    if (isReadOnly || status === 'GENERATING') {
        return (
            <div className={`flex items-center justify-center gap-2 rounded-lg ${config.className} ${config.color}`}>
                {config.icon}
                <span>{config.label}</span>
            </div>
        );
    }

    return (
        <div className={`relative ${size === 'large' ? 'flex-shrink-0 w-full sm:w-auto' : ''}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-center gap-2 rounded-lg shadow-sm ring-1 ring-inset ring-transparent hover:ring-indigo-500/30 active:scale-95 cursor-pointer ${config.className} ${config.color}`}
            >
                {config.icon}
                <span>{config.label}</span>
                <ChevronDown size={10} className={`opacity-40 ml-1 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/5">
                        <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b border-slate-100 dark:border-slate-800 mb-1">
                            {t('updateStatus') || 'Update Status'}
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
