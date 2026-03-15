import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Job } from '../../lib/types';
import type { JobStatus } from '../JobStatusBadge';
import { STATUS_GUIDANCE, STATUS_META, STATUS_PIPELINE } from './constants';
import type { TabType } from './types';
import { fetchWithAuth } from '../AuthProvider';

interface JobStatusTabProps {
    job: Job;
    apiBase: string;
    onStatusUpdate: (jobId: string, status: JobStatus) => void;
    setActiveTab: (tab: TabType) => void;
}

export default function JobStatusTab({ job, apiBase, onStatusUpdate, setActiveTab }: JobStatusTabProps) {
    const [history, setHistory] = useState<any[] | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        let mounted = true;
        if (history === null && !historyLoading) {
            setHistoryLoading(true);
            fetchWithAuth(`${apiBase}/jobs/${job.id}/history`)
                .then(r => r.json())
                .then(data => { if (mounted) setHistory(data); })
                .catch(() => { if (mounted) setHistory([]); })
                .finally(() => { if (mounted) setHistoryLoading(false); });
        }
        return () => { mounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job.id]);

    const currentStatus = job.status || 'OPEN';
    const statusMeta = STATUS_META[currentStatus] || STATUS_META['OPEN'];
    const currentIdx = STATUS_PIPELINE.indexOf(currentStatus as JobStatus);
    const isExitStatus = currentStatus === 'REJECTED' || currentStatus === 'FAILED';
    const guidance = STATUS_GUIDANCE[currentStatus] ?? STATUS_GUIDANCE['OPEN'];

    const dynamicItems = guidance.items.map(item => {
        if (item.id === 'has_draft') return { ...item, done: !!job.application_draft };
        if (item.id === 'has_followup') return { ...item, done: !!job.next_follow_up_at };
        if (item.id === 'has_prep') return { ...item, done: !!job.interview_prep_material };
        return item;
    });

    return (
        <div className="space-y-5">
            {/* Pipeline Stepper */}
            <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-4">Bewerbungs-Pipeline</p>
                <div className="relative flex items-start justify-between">
                    {/* Background connector */}
                    <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-200 dark:bg-slate-700" />
                    {/* Filled connector */}
                    {!isExitStatus && currentIdx > 0 && (
                        <div
                            className={`absolute top-4 left-4 h-0.5 transition-all duration-500 ${statusMeta.connectorCls}`}
                            style={{ width: `calc(${(currentIdx / (STATUS_PIPELINE.length - 1)) * 100}% - 2rem)` }}
                        />
                    )}
                    {STATUS_PIPELINE.map((s, i) => {
                        const meta = STATUS_META[s];
                        const isDone = !isExitStatus && currentIdx > i;
                        const isCurrent = !isExitStatus && currentIdx === i;
                        return (
                            <button
                                key={s}
                                onClick={() => onStatusUpdate(job.id, s)}
                                className="relative flex flex-col items-center gap-1.5 cursor-pointer group/step z-10 flex-1 min-w-0"
                                title={meta.label}
                            >
                                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all duration-300
                                    ${isDone
                                        ? meta.stepDone
                                        : isCurrent
                                            ? meta.stepActive
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 group-hover/step:border-slate-400 dark:group-hover/step:border-slate-500'
                                    }`}
                                >
                                    {isDone ? <span className="text-xs font-bold">✓</span> : <span className="leading-none">{meta.icon}</span>}
                                </div>
                                <span className={`text-[9px] font-semibold text-center leading-tight hidden sm:block transition-colors
                                    ${isCurrent ? 'text-slate-800 dark:text-slate-100 font-bold' : isDone ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300 dark:text-slate-600'}`}
                                >
                                    {meta.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Exit states */}
                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-300 dark:text-slate-600 tracking-widest">Sonstiges:</span>
                    {(['REJECTED', 'FAILED'] as JobStatus[]).map((s) => {
                        const meta = STATUS_META[s];
                        const isActive = job.status === s;
                        return (
                            <button
                                key={s}
                                onClick={() => onStatusUpdate(job.id, s)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer
                                    ${isActive
                                        ? meta.pillCls + ' ring-2 ring-offset-1 ring-rose-300 dark:ring-rose-700'
                                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800/50'
                                    }`}
                            >
                                <span>{meta.icon}</span>
                                <span>{meta.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Was jetzt? Guidance */}
            <div className={`rounded-xl border p-3.5 ${guidance.bgCls}`}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{statusMeta.icon}</span>
                        <p className={`text-[10px] uppercase font-bold tracking-widest ${guidance.accentCls}`}>Was jetzt?</p>
                    </div>
                    {job.next_follow_up_at && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1">
                            ⏰ Follow-up: {new Date(job.next_follow_up_at).toLocaleDateString('de-DE')}
                        </span>
                    )}
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-3 leading-snug">
                    {guidance.nextAction}
                </p>
                <ul className="space-y-1.5 mb-3">
                    {dynamicItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                            <span className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-colors
                                ${item.done
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                }`}
                            >
                                {item.done && '✓'}
                            </span>
                            <span className={`text-xs leading-snug ${item.done
                                ? 'text-slate-400 dark:text-slate-500 line-through'
                                : 'text-slate-600 dark:text-slate-300'
                                }`}>
                                {item.text}
                                {item.tabHint && !item.done && (
                                    <button
                                        onClick={() => setActiveTab(item.tabHint as TabType)}
                                        className="ml-1.5 text-indigo-500 dark:text-indigo-400 font-semibold hover:underline text-[10px] cursor-pointer"
                                    >
                                        → öffnen
                                    </button>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="text-[11px] italic text-slate-400 dark:text-slate-500 leading-relaxed border-t border-slate-200/60 dark:border-slate-700/40 pt-2.5">
                    „{guidance.nudge}&quot;
                </p>
            </div>
        </div>
    );
}
