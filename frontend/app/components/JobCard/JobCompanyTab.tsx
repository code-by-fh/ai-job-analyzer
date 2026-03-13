import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, Globe, Loader2, RefreshCw, Scale, Users } from 'lucide-react';
import type { Job } from '../../lib/types';

interface JobCompanyTabProps {
    job: Job;
    apiBase: string;
}

function Section({ title, icon, children, color = 'slate' }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    color?: 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky';
}) {
    const bg: Record<string, string> = {
        slate:   'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50',
        indigo:  'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30',
        emerald: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30',
        rose:    'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30',
        amber:   'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',
        sky:     'bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/30',
    };
    const tc: Record<string, string> = {
        slate:   'text-slate-500 dark:text-slate-400',
        indigo:  'text-indigo-600 dark:text-indigo-400',
        emerald: 'text-emerald-700 dark:text-emerald-400',
        rose:    'text-rose-700 dark:text-rose-400',
        amber:   'text-amber-700 dark:text-amber-400',
        sky:     'text-sky-700 dark:text-sky-400',
    };
    return (
        <div className={`rounded-xl border p-4 ${bg[color]}`}>
            <div className="flex items-center gap-2 mb-3">
                <span className={tc[color]}>{icon}</span>
                <h3 className={`text-[10px] font-black uppercase tracking-widest ${tc[color]}`}>{title}</h3>
            </div>
            {children}
        </div>
    );
}

export default function JobCompanyTab({ job, apiBase }: JobCompanyTabProps) {
    const [companyData, setCompanyData] = useState<any | null>(null);
    const [companyLoading, setCompanyLoading] = useState(false);
    const [companyQueued, setCompanyQueued] = useState(false);
    const [reportExpanded, setReportExpanded] = useState(false);

    useEffect(() => {
        if (job.company_domain && !companyData && !companyLoading) {
            setCompanyLoading(true);
            fetch(`${apiBase}/companies/${job.company_domain}`, { credentials: 'include' })
                .then(res => res.ok ? res.json() : null)
                .then(data => { if (data) setCompanyData(data); })
                .catch(() => {})
                .finally(() => setCompanyLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleUpdate = () => {
        setCompanyLoading(true);
        setCompanyData(null);
        fetch(`${apiBase}/companies/${job.company_domain}/analyze`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_refresh: true }),
        }).then(() => setCompanyQueued(true))
          .catch(() => {})
          .finally(() => setCompanyLoading(false));
    };

    const handleAnalyze = () => {
        setCompanyQueued(true);
        fetch(`${apiBase}/companies/${job.company_domain}/analyze`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_refresh: false }),
        }).catch(() => {});
    };

    if (companyLoading || companyQueued) {
        return (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Company Research läuft…</p>
            </div>
        );
    }

    if (!companyData) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="text-center px-6 space-y-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Firmenanalyse</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">SWOT, Kultur, Gehaltsdaten und Marktintelligenz</p>
                </div>
                <button
                    onClick={handleAnalyze}
                    className="px-5 py-2.5 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-600 transition-all cursor-pointer"
                >
                    Firma analysieren
                </button>
            </div>
        );
    }

    const d = companyData;

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{job.company_domain || job.company}</span>
                </div>
                <button
                    onClick={handleUpdate}
                    disabled={companyLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                    <RefreshCw className={`w-3 h-3 ${companyLoading ? 'animate-spin' : ''}`} />
                    Aktualisieren
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LEFT */}
                <div className="space-y-4">
                    {/* Description */}
                    {d.description && (
                        <Section title="Über das Unternehmen" icon={<Building2 className="w-3.5 h-3.5" />} color="slate">
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{d.description}</p>
                        </Section>
                    )}

                    {/* SWOT */}
                    {d.swot_analysis && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border p-3 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Stärken</span>
                                </div>
                                <ul className="space-y-1.5">
                                    {d.swot_analysis.strengths?.slice(0, 3).map((s: string, i: number) => (
                                        <li key={i} className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-snug flex gap-1.5">
                                            <span className="opacity-40 flex-shrink-0">•</span>{s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="rounded-xl border p-3 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                    <span className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">Risiken</span>
                                </div>
                                <ul className="space-y-1.5">
                                    {d.swot_analysis.weaknesses?.slice(0, 3).map((w: string, i: number) => (
                                        <li key={i} className="text-[11px] text-rose-700 dark:text-rose-300 leading-snug flex gap-1.5">
                                            <span className="opacity-40 flex-shrink-0">•</span>{w}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Salary */}
                    {d.salary_benchmark && (
                        <Section title="Gehalts-Benchmark" icon={<Scale className="w-3.5 h-3.5" />} color="slate">
                            <div className="flex items-end gap-6 flex-wrap">
                                {d.salary_benchmark.min && (
                                    <div>
                                        <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Min</span>
                                        <span className="text-base font-black text-slate-700 dark:text-slate-200">
                                            {d.salary_benchmark.min.toLocaleString('de-DE')}
                                            <span className="text-xs font-normal ml-1 text-slate-400">{d.salary_benchmark.currency}</span>
                                        </span>
                                    </div>
                                )}
                                {d.salary_benchmark.max && (
                                    <div>
                                        <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Max</span>
                                        <span className="text-base font-black text-slate-700 dark:text-slate-200">
                                            {d.salary_benchmark.max.toLocaleString('de-DE')}
                                            <span className="text-xs font-normal ml-1 text-slate-400">{d.salary_benchmark.currency}</span>
                                        </span>
                                    </div>
                                )}
                            </div>
                            {d.salary_benchmark.is_estimate && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5 italic">
                                    <AlertTriangle className="w-3 h-3" /> Marktschätzung
                                </p>
                            )}
                        </Section>
                    )}
                </div>

                {/* RIGHT */}
                <div className="space-y-4">
                    {/* Culture */}
                    {d.culture_summary && (
                        <Section title="Kultur & Vibe" icon={<Users className="w-3.5 h-3.5" />} color="indigo">
                            <p className="text-xs text-indigo-700 dark:text-indigo-200 leading-relaxed italic">„{d.culture_summary}"</p>
                        </Section>
                    )}

                    {/* Key Intelligence */}
                    {d.key_artifacts?.length > 0 && (
                        <Section title="Key Intelligence" icon={<Globe className="w-3.5 h-3.5" />} color="slate">
                            <div className="space-y-2">
                                {d.key_artifacts.slice(0, 3).map((art: any, i: number) => (
                                    <div key={i} className="p-2.5 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-0.5">{art.title}</p>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{art.description}</p>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Research Report (collapsible) */}
                    {d.comprehensive_report && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                            <button
                                onClick={() => setReportExpanded(v => !v)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
                            >
                                <div className="flex items-center gap-2">
                                    <Globe className="w-3.5 h-3.5 text-sky-500" />
                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Research Report</span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${reportExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            {reportExpanded && (
                                <div className="px-4 py-3 prose prose-xs dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 max-h-72 overflow-y-auto">
                                    <ReactMarkdown>{d.comprehensive_report}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
