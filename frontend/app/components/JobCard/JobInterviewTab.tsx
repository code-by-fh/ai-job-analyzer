import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, FileText, Loader2, RefreshCw, Zap, Target, MessageSquare, ChevronDown, AlertTriangle, X } from 'lucide-react';
import type { Job } from '../../lib/types';
import { useNotification } from '../NotificationProvider';
import { fetchWithAuth } from '../AuthProvider';

interface JobInterviewTabProps {
    job: Job;
    apiBase: string;
}

function Section({ title, icon, children, color = 'slate' }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    color?: 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky' | 'purple';
}) {
    const bg: Record<string, string> = {
        slate: 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50 shadow-sm',
        indigo: 'bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/20 shadow-sm',
        emerald: 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20 shadow-sm',
        rose: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20 shadow-sm',
        amber: 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20 shadow-sm',
        sky: 'bg-sky-50/50 dark:bg-sky-500/5 border-sky-200 dark:border-sky-500/20 shadow-sm',
        purple: 'bg-purple-50/50 dark:bg-purple-500/5 border-purple-200 dark:border-purple-500/20 shadow-sm',
    };
    const tc: Record<string, string> = {
        slate: 'text-slate-600 dark:text-slate-400',
        indigo: 'text-indigo-600 dark:text-indigo-400',
        emerald: 'text-emerald-700 dark:text-emerald-400',
        rose: 'text-rose-700 dark:text-rose-400',
        amber: 'text-amber-700 dark:text-amber-400',
        sky: 'text-sky-700 dark:text-sky-400',
        purple: 'text-purple-700 dark:text-purple-400',
    };
    return (
        <div className={`rounded-2xl border p-5 ${bg[color]} transition-all hover:shadow-md`}>
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${bg[color]} border-none shadow-inner`}>
                    <span className={tc[color]}>{icon}</span>
                </div>
                <h3 className={`text-base font-bold uppercase tracking-widest ${tc[color]}`}>{title}</h3>
            </div>
            <div className="text-slate-600 dark:text-slate-300">
                {children}
            </div>
        </div>
    );
}

const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function JobInterviewTab({ job, apiBase }: JobInterviewTabProps) {
    const [interviewPrep, setInterviewPrep] = useState<any | null>(null);
    const { showError } = useNotification();
    const [interviewQueued, setInterviewQueued] = useState(false);
    const [reportExpanded, setReportExpanded] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (job.interview_prep_material && !interviewPrep) {
            try { setInterviewPrep(JSON.parse(job.interview_prep_material)); }
            catch { setInterviewPrep({ raw: job.interview_prep_material }); }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!job.interview_prep_material) {
            const stored = localStorage.getItem(`gen_interview_${job.id}`);
            if (stored) setInterviewQueued(true);
        }
    }, [job.id, job.interview_prep_material]);

    useEffect(() => {
        if (!interviewQueued) {
            if (timerRef.current) clearInterval(timerRef.current);
            setElapsed(0);
            return;
        }
        const stored = localStorage.getItem(`gen_interview_${job.id}`);
        const startTime = stored ? parseInt(stored) : Date.now();
        if (!stored) localStorage.setItem(`gen_interview_${job.id}`, startTime.toString());
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
        timerRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [interviewQueued, job.id]);

    useEffect(() => {
        if (job.interview_prep_material) {
            try { setInterviewPrep(JSON.parse(job.interview_prep_material)); setInterviewQueued(false); }
            catch { setInterviewPrep({ raw: job.interview_prep_material }); }
            localStorage.removeItem(`gen_interview_${job.id}`);
        }
    }, [job.interview_prep_material, job.id]);

    useEffect(() => {
        if (!interviewQueued) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetchWithAuth(`${apiBase}/jobs/${job.id}`);
                if (!res.ok) return;
                const updatedJob = await res.json();
                if (updatedJob.interview_prep_material) {
                    try { setInterviewPrep(JSON.parse(updatedJob.interview_prep_material)); }
                    catch { setInterviewPrep({ raw: updatedJob.interview_prep_material }); }
                    setInterviewQueued(false);
                    localStorage.removeItem(`gen_interview_${job.id}`);
                }
            } catch { }
        }, 5000);
        return () => clearInterval(interval);
    }, [interviewQueued, job.id, apiBase]);

    const handleGenerate = (force = false) => {
        setInterviewQueued(true);
        localStorage.setItem(`gen_interview_${job.id}`, Date.now().toString());
        const endpoint = force
            ? `${apiBase}/jobs/${job.id}/interview-prep/regenerate`
            : `${apiBase}/jobs/${job.id}/interview-prep`;
        fetchWithAuth(endpoint, { method: 'POST' })
            .then(res => { if (!res.ok) throw new Error(`POST ${endpoint} → HTTP ${res.status}`); })
            .catch((e: Error) => {
                setInterviewQueued(false);
                localStorage.removeItem(`gen_interview_${job.id}`);
                showError(e.message);
            });
    };

    const handleCancel = () => {
        setInterviewQueued(false);
        localStorage.removeItem(`gen_interview_${job.id}`);
    };

    const p = interviewPrep;
    const gaps = p?.context?.potential_gaps || p?.problems_to_solve || [];
    const success = p?.core_research?.success_factors || p?.success_factors || [];
    const summary = p?.report_output?.executive_summary || p?.executive_summary;
    const compAnalysis = p?.report_output?.comparative_analysis || p?.comparative_analysis || p?.structured_prep?.gap_analysis || [];
    const psychQs = p?.critical_analysis?.psychological_questions || p?.psychological_questions || [];
    const backQs = p?.report_output?.questions_for_interviewer || p?.questions_for_interviewer || [];
    const fullReport = p?.report_output?.deep_dive_analysis || p?.full_report || p?.full_prep_guide;
    const pitch = p?.critical_analysis?.solution_selling_pitch || p?.structured_prep?.elevator_pitch;

    const gapColor = (s: string) =>
        s === 'no gap' || s === 'kein Gap' || s === 'No Gap' || s === 'Low' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
            s === 'slight gap' || s === 'leichter Gap' || s === 'Slight Gap' || s === 'Medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400';

    if (interviewQueued) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin relative z-10" />
                </div>
                <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-200">Interview-Analyse läuft…</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">{formatElapsed(elapsed)}</p>
                </div>
                <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-xl transition-all cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                    Abbrechen
                </button>
            </div>
        );
    }

    if (!p) {
        return (
            <div className="group relative flex flex-col items-center justify-center py-16 gap-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl transition-all hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                    <Brain className="w-8 h-8 text-indigo-500" />
                </div>
                <div className="text-center px-6 max-w-sm space-y-2">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200">Interview Strategy Guide</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Get a tailored preparation based on your profile and the job requirements.</p>
                </div>
                <button
                    onClick={() => handleGenerate(false)}
                    className="group flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                    Analyse starten
                    <Zap className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center">
                        <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Interview Analysis</span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Strategic Guide</p>
                    </div>
                </div>
                <button
                    onClick={() => handleGenerate(true)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-xl transition-all cursor-pointer"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                </button>
            </div>

            <div className="space-y-6">
                {/* Executive Summary */}
                {summary && (
                    <Section title="Executive Summary" icon={<Zap className="w-4 h-4" />} color="indigo">
                        <p className="text-base leading-relaxed font-medium">{summary}</p>
                    </Section>
                )}

                {/* Pitch */}
                {pitch && (
                    <div className="rounded-2xl p-6 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 border border-indigo-500/20 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-700">
                            <Zap className="w-24 h-24 text-white" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <Zap className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-xs font-black text-white/90 uppercase tracking-widest">Solution Selling Pitch</span>
                            </div>
                            <blockquote className="text-lg text-white font-medium leading-relaxed italic border-l-4 border-white/30 pl-6">
                                &ldquo;{pitch}&rdquo;
                            </blockquote>
                        </div>
                    </div>
                )}

                {/* Strengths & Gaps */}
                {(gaps.length > 0 || success.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {success.length > 0 && (
                            <div className="rounded-2xl border p-6 bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20 shadow-sm">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl">
                                        <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <span className="text-base font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Success Factors</span>
                                </div>
                                <ul className="space-y-4">
                                    {success.map((s: string, i: number) => (
                                        <li key={i} className="flex gap-3 text-base text-emerald-800 dark:text-emerald-300 leading-normal">
                                            <span className="text-emerald-500 font-bold">✓</span>{s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {gaps.length > 0 && (
                            <div className="rounded-2xl border p-6 bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20 shadow-sm">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2 bg-rose-100 dark:bg-rose-500/20 rounded-xl">
                                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                    </div>
                                    <span className="text-base font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">Potential Gaps</span>
                                </div>
                                <ul className="space-y-4">
                                    {gaps.map((g: string, i: number) => (
                                        <li key={i} className="flex gap-3 text-base text-rose-800 dark:text-rose-300 leading-normal">
                                            <span className="text-rose-500 font-bold">!</span>{g}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Gap Analysis Detail */}
                {compAnalysis.length > 0 && (
                    <Section title="Suitability Check" icon={<Target className="w-4 h-4" />} color="slate">
                        <div className="grid grid-cols-1 gap-4">
                            {compAnalysis.map((item: any, i: number) => (
                                <div key={i} className="p-5 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4 hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest truncate">{item.category || 'Skillset'}</span>
                                        <span className={`text-xs uppercase font-black px-3 py-1 rounded-lg shadow-sm ${gapColor(item.gap_evaluation || item.gap_severity || '')}`}>
                                            {item.gap_evaluation || item.gap_severity || 'N/A'}
                                        </span>
                                    </div>
                                    <div className="space-y-3 pt-2">
                                        <div>
                                            <span className="block text-xs font-bold text-slate-400 uppercase mb-1">Job Requirement</span>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{item.job_requirement || item.requirement}</p>
                                        </div>
                                        <div className="pt-2 border-t border-slate-50 dark:border-slate-800">
                                            <span className="block text-xs font-bold text-indigo-400 uppercase mb-1">Your CV Match</span>
                                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed italic">{item.cv_qualification || item.my_story || item.cv_status}</p>
                                        </div>
                                        {item.interview_strategy && (
                                            <div className="pt-2 border-t border-slate-50 dark:border-slate-800">
                                                <span className="block text-xs font-bold text-purple-400 uppercase mb-1">Interview Strategy</span>
                                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.interview_strategy}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* Psychological Questions */}
                {psychQs.length > 0 && (
                    <Section title="Psychological Questions & Tactics" icon={<Brain className="w-4 h-4" />} color="purple">
                        <div className="grid grid-cols-1 gap-4">
                            {psychQs.map((q: any, i: number) => (
                                <div key={i} className="p-5 bg-white/40 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-500/10 space-y-3">
                                    <div className="flex gap-4">
                                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-xs font-black text-purple-600">Q</div>
                                        <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight pt-1">{q.question}</p>
                                    </div>
                                    <div className="ml-12 p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/10 border-l-4 border-emerald-400">
                                        <p className="text-base text-slate-700 dark:text-slate-300 italic leading-relaxed font-medium">
                                            <span className="text-emerald-600 font-bold not-italic mr-2">Tactic:</span>
                                            {q.suggested_answer}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* Questions for Interviewer */}
                {backQs.length > 0 && (
                    <Section title="Own Questions" icon={<MessageSquare className="w-4 h-4" />} color="sky">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {backQs.map((q: string, i: number) => (
                                <div key={i} className="flex gap-4 p-4 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-sky-100/50 dark:border-sky-500/10">
                                    <span className="text-sky-500 font-black">?</span>
                                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200">{q}</p>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
            </div>

            {/* Deep Dive (Full Width) */}
            {fullReport && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/40 shadow-sm transition-all hover:shadow-md">
                    <button
                        onClick={() => setReportExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-6 py-5 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center">
                                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="text-left">
                                <span className="block text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest leading-none mb-1">Deep Dive Analysis</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Full Interview Prep Guide</span>
                            </div>
                        </div>
                        <div className={`p-2 rounded-full bg-slate-200/50 dark:bg-slate-700/50 transition-transform duration-300 ${reportExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                        </div>
                    </button>
                    {reportExpanded && (
                        <div className="px-8 py-8 prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 animate-in slide-in-from-top-4 duration-500">
                            <ReactMarkdown
                                components={{
                                    h1: ({ node, ...props }) => <h1 className="text-2xl font-black mb-6 text-slate-900 dark:text-white" {...props} />,
                                    h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-8 mb-4 border-b pb-2 border-slate-100 dark:border-slate-800" {...props} />,
                                    h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-6 mb-3 text-indigo-600 dark:text-indigo-400" {...props} />,
                                    p: ({ node, ...props }) => <p className="mb-4 leading-relaxed text-base" {...props} />,
                                    li: ({ node, ...props }) => <li className="mb-2 list-disc ml-4" {...props} />,
                                }}
                            >
                                {fullReport}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
