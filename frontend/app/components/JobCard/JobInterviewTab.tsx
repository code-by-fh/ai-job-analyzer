import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, FileText, Loader2, RefreshCw, Zap, Target, MessageSquare, ChevronDown } from 'lucide-react';
import type { Job } from '../../lib/types';

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
    const colors: Record<string, string> = {
        slate:   'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50',
        indigo:  'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30',
        emerald: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30',
        rose:    'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30',
        amber:   'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',
        sky:     'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30',
        purple:  'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30',
    };
    const titleColors: Record<string, string> = {
        slate:   'text-slate-500 dark:text-slate-400',
        indigo:  'text-indigo-600 dark:text-indigo-400',
        emerald: 'text-emerald-700 dark:text-emerald-400',
        rose:    'text-rose-700 dark:text-rose-400',
        amber:   'text-amber-700 dark:text-amber-400',
        sky:     'text-sky-700 dark:text-sky-400',
        purple:  'text-purple-700 dark:text-purple-400',
    };
    return (
        <div className={`rounded-xl border p-4 ${colors[color]}`}>
            <div className="flex items-center gap-2 mb-3">
                <span className={titleColors[color]}>{icon}</span>
                <h3 className={`text-[10px] font-black uppercase tracking-widest ${titleColors[color]}`}>{title}</h3>
            </div>
            {children}
        </div>
    );
}

export default function JobInterviewTab({ job, apiBase }: JobInterviewTabProps) {
    const [interviewPrep, setInterviewPrep] = useState<any | null>(null);
    const [interviewLoading, setInterviewLoading] = useState(false);
    const [interviewQueued, setInterviewQueued] = useState(false);
    const [reportExpanded, setReportExpanded] = useState(false);

    useEffect(() => {
        if (job.interview_prep_material && !interviewPrep) {
            try { setInterviewPrep(JSON.parse(job.interview_prep_material)); }
            catch { setInterviewPrep({ raw: job.interview_prep_material }); }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (job.interview_prep_material) {
            try { setInterviewPrep(JSON.parse(job.interview_prep_material)); setInterviewQueued(false); }
            catch { setInterviewPrep({ raw: job.interview_prep_material }); }
        }
    }, [job.interview_prep_material]);

    const handleGenerate = () => {
        setInterviewQueued(true);
        fetch(`${apiBase}/jobs/${job.id}/interview-prep`, { method: 'POST', credentials: 'include' }).catch(() => {});
    };

    const p = interviewPrep;
    const gaps        = p?.context?.potential_gaps        || p?.problems_to_solve    || [];
    const success     = p?.core_research?.success_factors  || p?.success_factors      || [];
    const summary     = p?.report_output?.executive_summary || p?.executive_summary;
    const compAnalysis= p?.report_output?.comparative_analysis || p?.comparative_analysis || [];
    const psychQs     = p?.critical_analysis?.psychological_questions || p?.psychological_questions || [];
    const backQs      = p?.report_output?.questions_for_interviewer || p?.questions_for_interviewer || [];
    const fullReport  = p?.report_output?.deep_dive_analysis || p?.full_report || p?.full_prep_guide;
    const pitch       = p?.critical_analysis?.solution_selling_pitch;
    const purpose     = p?.context?.purpose;
    const hypothesis  = p?.core_research?.hypothesis_evaluation;
    const experts     = p?.context?.experts_used || [];
    const specs       = p?.specifications;

    const gapColor = (s: string) =>
        s === 'kein Gap'     ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
        s === 'leichter Gap' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                               'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400';

    // Empty / loading states
    if (interviewQueued || interviewLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Strategische Analyse läuft…</p>
            </div>
        );
    }

    if (!p) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center">
                    <Brain className="w-6 h-6 text-indigo-500" />
                </div>
                <div className="text-center px-6 space-y-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Interview-Vorbereitung</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">KI-basierte Analyse deines Profils vs. Stellenanforderungen</p>
                </div>
                <button
                    onClick={handleGenerate}
                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
                >
                    Analyse starten
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Interview-Analyse</span>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={interviewQueued}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                    <RefreshCw className="w-3 h-3" />
                    Neu generieren
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* LEFT */}
                <div className="space-y-4">
                    {/* Executive Summary */}
                    {summary && (
                        <Section title="Executive Summary" icon={<Zap className="w-3.5 h-3.5" />} color="indigo">
                            <p className="text-sm text-indigo-700 dark:text-indigo-200 leading-relaxed font-medium">{summary}</p>
                        </Section>
                    )}

                    {/* Briefing */}
                    {(purpose || hypothesis || experts.length > 0) && (
                        <Section title="Strategisches Briefing" icon={<Target className="w-3.5 h-3.5" />} color="slate">
                            {purpose && (
                                <div className="mb-3">
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase block mb-1">Missions-Ziel</span>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">{purpose}</p>
                                </div>
                            )}
                            {hypothesis && (
                                <div className="mb-3">
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">Kern-Hypothese</span>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                        {hypothesis}
                                    </p>
                                </div>
                            )}
                            {experts.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-700/50">
                                    {experts.map((e: string, i: number) => (
                                        <span key={i} className="px-2 py-0.5 bg-white dark:bg-slate-800 text-[10px] text-slate-500 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700">
                                            {e}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Pitch */}
                    {pitch && (
                        <div className="rounded-xl p-4 bg-gradient-to-br from-indigo-600 to-purple-600 border border-indigo-500/20 shadow-md">
                            <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-3.5 h-3.5 text-white/80" />
                                <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">Solution Selling Pitch</span>
                            </div>
                            <p className="text-sm text-white leading-relaxed italic border-l-2 border-white/30 pl-3">{pitch}</p>
                        </div>
                    )}

                    {/* Gaps */}
                    {gaps.length > 0 && (
                        <Section title="Potenzielle Gaps" icon={<span className="text-xs">⚠</span>} color="rose">
                            <ul className="space-y-2">
                                {gaps.map((g: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-xs text-rose-700 dark:text-rose-200 leading-snug">
                                        <span className="flex-shrink-0 font-bold mt-0.5">–</span>{g}
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    {/* Success Factors */}
                    {success.length > 0 && (
                        <Section title="Erfolgsfaktoren" icon={<span className="text-xs">✓</span>} color="emerald">
                            <ul className="space-y-2">
                                {success.map((s: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-xs text-emerald-700 dark:text-emerald-200 leading-snug">
                                        <span className="flex-shrink-0 font-bold mt-0.5">✓</span>{s}
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}
                </div>

                {/* RIGHT */}
                <div className="space-y-4">
                    {/* Specs */}
                    {specs && (specs.industry_focus || specs.geographic_location) && (
                        <Section title="Rahmenbedingungen" icon={<Target className="w-3.5 h-3.5" />} color="slate">
                            <div className="grid grid-cols-2 gap-2">
                                {specs.industry_focus && (
                                    <div className="p-2 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Branche</span>
                                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{specs.industry_focus}</span>
                                    </div>
                                )}
                                {specs.geographic_location && (
                                    <div className="p-2 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Lage</span>
                                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{specs.geographic_location}</span>
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* Gap Analysis */}
                    {compAnalysis.length > 0 && (
                        <Section title="Gap-Analyse (CV vs. Job)" icon={<Target className="w-3.5 h-3.5" />} color="slate">
                            <div className="space-y-2">
                                {compAnalysis.map((item: any, i: number) => (
                                    <div key={i} className="p-3 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase truncate">{item.category || 'Fähigkeit'}</span>
                                            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${gapColor(item.gap_evaluation || '')}`}>
                                                {item.gap_evaluation || 'N/A'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                                            <div>
                                                <span className="block text-[9px] text-slate-400 uppercase mb-0.5">Anforderung</span>
                                                <span className="text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">{item.job_requirement || item.requirement}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[9px] text-slate-400 uppercase mb-0.5">Dein Profil</span>
                                                <span className="text-slate-600 dark:text-slate-300 leading-snug line-clamp-2">{item.cv_qualification || item.my_story}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Psychological Questions */}
                    {psychQs.length > 0 && (
                        <Section title="Psychologische Fragen & Taktik" icon={<Brain className="w-3.5 h-3.5" />} color="purple">
                            <div className="space-y-3">
                                {psychQs.map((q: any, i: number) => (
                                    <div key={i} className="space-y-1.5">
                                        <div className="flex gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                                            <span className="text-purple-500 flex-shrink-0">Q</span>
                                            {q.question}
                                        </div>
                                        <div className="flex gap-2 pl-3 border-l-2 border-emerald-400/30">
                                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 italic leading-snug">{q.suggested_answer}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Questions for Interviewer */}
                    {backQs.length > 0 && (
                        <Section title="Eigene Rückfragen" icon={<MessageSquare className="w-3.5 h-3.5" />} color="sky">
                            <ul className="space-y-2">
                                {backQs.map((q: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-xs text-sky-700 dark:text-sky-200 leading-snug">
                                        <span className="flex-shrink-0 font-bold">?</span>{q}
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    {/* Deep Dive */}
                    {fullReport && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                            <button
                                onClick={() => setReportExpanded(v => !v)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                            >
                                <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Deep Dive Analyse</span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${reportExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            {reportExpanded && (
                                <div className="px-4 py-3 prose prose-xs dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 max-h-72 overflow-y-auto">
                                    <ReactMarkdown>{fullReport}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
