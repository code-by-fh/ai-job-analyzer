import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, ChevronDown, Globe, Loader2, Mic, RefreshCw, Target, TrendingUp, Users, X, Zap } from 'lucide-react';
import RegenBanner from './RegenBanner';
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
            <div className="text-slate-600 dark:text-slate-300">{children}</div>
        </div>
    );
}

function GapSeverityBadge({ level }: { level: string }) {
    const map: Record<string, string> = {
        Low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
        Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
        High: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
    };
    return (
        <span className={`text-xs uppercase font-black px-3 py-1 rounded-lg shadow-sm ${map[level] ?? map.Medium}`}>
            {level}
        </span>
    );
}

function DeepDiveItem({ btn, index, job, apiBase, language }: {
    btn: any;
    index: number;
    job: Job;
    apiBase: string;
    language: string;
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const domain = job.company_domain || '';
    const companyName = job.company || domain;

    const handleResearch = async () => {
        if (!domain) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${apiBase}/companies/${domain}/deep-dive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    focus: btn.focus,
                    how_to_proceed: btn.how_to_proceed,
                    company_name: companyName,
                    title: btn.title,
                    language,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setResult(data.result);
        } catch (e: any) {
            setError(e.message || 'Fehler bei der Recherche');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`rounded-xl border overflow-hidden transition-all duration-200 ${open ? 'border-indigo-400 dark:border-indigo-500/50 shadow-md' : 'border-indigo-200/70 dark:border-indigo-500/20 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-sm cursor-pointer'}`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-indigo-50/60 dark:bg-indigo-500/5 hover:bg-indigo-100/60 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer text-left gap-3"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-sm">
                        {index + 1}
                    </span>
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 truncate">{btn.title}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-indigo-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="px-5 pb-5 pt-4 space-y-4 bg-white/80 dark:bg-slate-900/60 border-t border-indigo-100/60 dark:border-indigo-500/10 animate-in slide-in-from-top-2 duration-200">
                    {btn.focus && (
                        <div className="flex gap-3">
                            <div className="w-1.5 h-auto bg-indigo-400/40 dark:bg-indigo-500/30 rounded-full flex-shrink-0" />
                            <div>
                                <p className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1.5">Focus</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{btn.focus}</p>
                            </div>
                        </div>
                    )}
                    {btn.why_it_matters && (
                        <div className="flex gap-3">
                            <div className="w-1.5 h-auto bg-emerald-400/40 dark:bg-emerald-500/30 rounded-full flex-shrink-0" />
                            <div>
                                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1.5">Warum wichtig</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{btn.why_it_matters}</p>
                            </div>
                        </div>
                    )}
                    {btn.how_to_proceed && (
                        <div className="flex gap-3">
                            <div className="w-1.5 h-auto bg-sky-400/40 dark:bg-sky-500/30 rounded-full flex-shrink-0" />
                            <div>
                                <p className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-1.5">Dein nächster Schritt</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{btn.how_to_proceed}</p>
                            </div>
                        </div>
                    )}
                    {btn.linked_findings && (
                        <div className="flex gap-3 pt-1">
                            <div className="w-1.5 h-auto bg-slate-300/60 dark:bg-slate-600/40 rounded-full flex-shrink-0" />
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Verknüpfte Erkenntnisse</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed">{btn.linked_findings}</p>
                            </div>
                        </div>
                    )}

                    {domain && !result && (
                        <button
                            onClick={handleResearch}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                        >
                            <Zap className={`w-3.5 h-3.5 ${loading ? 'animate-pulse' : ''}`} />
                            {loading ? 'Recherchiere…' : 'Jetzt recherchieren'}
                        </button>
                    )}

                    {error && <p className="text-xs text-rose-500 dark:text-rose-400">{error}</p>}

                    {result && (
                        <div className="mt-2 rounded-xl border border-indigo-200/60 dark:border-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-500/5 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Recherche-Ergebnis</p>
                                <button onClick={() => setResult(null)} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline">Neu starten</button>
                            </div>
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-slate-800 dark:prose-headings:text-slate-200 prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-li:text-slate-700 dark:prose-li:text-slate-300">
                                <ReactMarkdown>{result}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function JobInterviewTab({ job, apiBase }: JobInterviewTabProps) {
    const [interviewPrep, setInterviewPrep] = useState<any | null>(null);
    const { showError } = useNotification();
    const [interviewQueued, setInterviewQueued] = useState(false);
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

    // First-time generation (no existing data) → full spinner
    if (interviewQueued && !interviewPrep) {
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

    // Regeneration banner (shown inline above existing content)
    const regenBanner = interviewQueued && interviewPrep
        ? <RegenBanner label="Interview-Analyse läuft…" icon={<Brain className="w-3 h-3 text-indigo-500" />} elapsed={elapsed} onCancel={handleCancel} />
        : null;

    const p = interviewPrep;

    if (!p) {
        return (
            <div className="group relative flex flex-col items-center justify-center py-16 gap-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl transition-all hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                    <Brain className="w-8 h-8 text-indigo-500" />
                </div>
                <div className="text-center px-6 max-w-sm space-y-2">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200">Interview Strategy Guide</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Erhalte eine personalisierte Vorbereitung basierend auf deinem Profil und den Job-Anforderungen.</p>
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
            {regenBanner}
            {/* Toolbar */}
            <div className={`flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/50 transition-opacity duration-300 ${interviewQueued ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center">
                        <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Interview Strategy Guide</span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Personalisierte Vorbereitung</p>
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

            <div className={`space-y-5 transition-opacity duration-300 ${interviewQueued ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                {/* Executive Summary */}
                {p.report_output?.executive_summary && (
                    <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-indigo-500/5 dark:to-purple-500/5 p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl">
                                <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Deine Ausgangslage</span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{p.report_output.executive_summary}</p>
                    </div>
                )}

                {/* Elevator Pitch */}
                {p.structured_prep?.elevator_pitch && (
                    <div className="rounded-2xl p-6 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 border border-indigo-500/20 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-700">
                            <Mic className="w-24 h-24 text-white" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <Mic className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-xs font-black text-white/90 uppercase tracking-widest">Dein Elevator Pitch</span>
                            </div>
                            <blockquote className="text-base text-white font-medium leading-relaxed italic border-l-4 border-white/30 pl-6">
                                &ldquo;{p.structured_prep.elevator_pitch}&rdquo;
                            </blockquote>
                        </div>
                    </div>
                )}

                {/* Gap Analysis */}
                {p.structured_prep?.gap_analysis?.length > 0 && (
                    <Section title="Gap Analysis" icon={<Target className="w-4 h-4" />} color="amber">
                        <div className="space-y-3">
                            {p.structured_prep.gap_analysis.map((gap: any, i: number) => (
                                <div key={i} className="p-4 bg-white/60 dark:bg-slate-900/40 rounded-xl border border-amber-200/50 dark:border-amber-500/15">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">{gap.requirement}</p>
                                        {gap.gap_severity && <GapSeverityBadge level={gap.gap_severity} />}
                                    </div>
                                    {gap.cv_status && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 italic">{gap.cv_status}</p>
                                    )}
                                    {gap.interview_strategy && (
                                        <div className="flex gap-2 pt-2 border-t border-amber-100/60 dark:border-amber-500/10">
                                            <span className="text-amber-500 flex-shrink-0 mt-0.5">→</span>
                                            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{gap.interview_strategy}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* Deep Dive Analysis */}
                {p.report_output?.deep_dive_analysis && (
                    <Section title="Interview Deep-Dive" icon={<TrendingUp className="w-4 h-4" />} color="purple">
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-slate-600 dark:prose-p:text-slate-300">
                            <ReactMarkdown>{p.report_output.deep_dive_analysis}</ReactMarkdown>
                        </div>
                    </Section>
                )}

                {/* Social Intelligence Research */}
                {p.social_intelligence_research && (
                    <Section title="Social Intelligence" icon={<Users className="w-4 h-4" />} color="sky">
                        <div className="space-y-4">
                            {p.social_intelligence_research.potential_contacts?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-2">Potenzielle Kontakte</p>
                                    <ul className="space-y-1">
                                        {p.social_intelligence_research.potential_contacts.map((c: any, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0 mt-1.5" />
                                                <span>{typeof c === 'string' ? c : JSON.stringify(c)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {p.social_intelligence_research.insights_from_contacts?.length > 0 && (
                                <div className="p-3 bg-sky-100/50 dark:bg-sky-500/10 rounded-xl border border-sky-200/60 dark:border-sky-500/20">
                                    <p className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-2">Insights aus Kontakten</p>
                                    <ul className="space-y-1">
                                        {p.social_intelligence_research.insights_from_contacts.map((c: any, i: number) => (
                                            <li key={i} className="text-sm leading-relaxed">{typeof c === 'string' ? c : JSON.stringify(c)}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {p.social_intelligence_research.research_sources?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-2">Quellen</p>
                                    <ul className="space-y-1">
                                        {p.social_intelligence_research.research_sources.map((src: any, i: number) => (
                                            <li key={i} className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                                                {typeof src === 'string' && src.startsWith('http') ? (
                                                    <a href={src} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline break-all">{src}</a>
                                                ) : (
                                                    <span className="text-sm text-slate-600 dark:text-slate-300">{typeof src === 'string' ? src : JSON.stringify(src)}</span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </Section>
                )}

                {/* Online Resources */}
                {p.online_resources?.speaking_url && (
                    <Section title="Online-Ressourcen" icon={<Globe className="w-4 h-4" />} color="emerald">
                        <a
                            href={p.online_resources.speaking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 hover:underline break-all"
                        >
                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                            {p.online_resources.speaking_url}
                        </a>
                    </Section>
                )}

                {/* Confidence Assessment */}
                {p.confidence_assessment && (
                    <Section title="Konfidenz-Bewertung" icon={<Globe className="w-4 h-4" />} color="slate">
                        <div className="space-y-3">
                            {p.confidence_assessment.overall_confidence && (
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">Gesamt</span>
                                    <GapSeverityBadge level={p.confidence_assessment.overall_confidence} />
                                </div>
                            )}
                            {p.confidence_assessment.uncertainties?.length > 0 && (
                                <ul className="space-y-1 mt-2">
                                    {p.confidence_assessment.uncertainties.map((u: any, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                                            <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                                            <span>{typeof u === 'string' ? u : JSON.stringify(u)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </Section>
                )}

                {/* Deep Dive Buttons */}
                {p.deep_dive_buttons?.length > 0 && (
                    <div className="rounded-2xl border border-indigo-300/60 dark:border-indigo-500/25 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 dark:from-indigo-500/5 dark:to-violet-500/3 shadow-sm overflow-hidden">
                        <div className="px-5 pt-5 pb-4 border-b border-indigo-200/50 dark:border-indigo-500/15">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-indigo-600 dark:bg-indigo-500 rounded-xl shadow-sm">
                                    <Zap className="w-4 h-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">Taktische Deep-Dives</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Spezifische Taktiken & psychologische Manöver für dein Interview</p>
                                </div>
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/20 px-2.5 py-1 rounded-full flex-shrink-0">
                                    {p.deep_dive_buttons.length}
                                </span>
                            </div>
                        </div>
                        <div className="p-4 space-y-2">
                            {p.deep_dive_buttons.map((btn: any, i: number) => (
                                <DeepDiveItem key={i} btn={btn} index={i} job={job} apiBase={apiBase} language={p.meta?.language || 'de'} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
