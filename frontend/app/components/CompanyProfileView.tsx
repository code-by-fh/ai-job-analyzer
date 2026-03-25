"use client";

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    AlertTriangle, BarChart2, BookOpen, Building2, CheckCircle2,
    ChevronDown, Globe, Lightbulb, Search, TrendingUp, Users, Zap,
} from 'lucide-react';

// ─── Shared sub-components ─────────────────────────────────────────────────────

function Section({ title, icon, children, color = 'slate' }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    color?: 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky' | 'purple' | 'violet';
}) {
    const bg: Record<string, string> = {
        slate: 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50',
        indigo: 'bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/20',
        emerald: 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20',
        rose: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20',
        amber: 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20',
        sky: 'bg-sky-50/50 dark:bg-sky-500/5 border-sky-200 dark:border-sky-500/20',
        purple: 'bg-purple-50/50 dark:bg-purple-500/5 border-purple-200 dark:border-purple-500/20',
        violet: 'bg-violet-50/50 dark:bg-violet-500/5 border-violet-200 dark:border-violet-500/20',
    };
    const tc: Record<string, string> = {
        slate: 'text-slate-600 dark:text-slate-400',
        indigo: 'text-indigo-600 dark:text-indigo-400',
        emerald: 'text-emerald-700 dark:text-emerald-400',
        rose: 'text-rose-700 dark:text-rose-400',
        amber: 'text-amber-700 dark:text-amber-400',
        sky: 'text-sky-700 dark:text-sky-400',
        purple: 'text-purple-700 dark:text-purple-400',
        violet: 'text-violet-700 dark:text-violet-400',
    };
    return (
        <div className={`rounded-2xl border p-5 shadow-sm ${bg[color]} transition-all hover:shadow-md`}>
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${bg[color]} border-none shadow-inner`}>
                    <span className={tc[color]}>{icon}</span>
                </div>
                <h3 className={`text-sm font-bold uppercase tracking-widest ${tc[color]}`}>{title}</h3>
            </div>
            <div className="text-slate-600 dark:text-slate-300">{children}</div>
        </div>
    );
}

function ConfidenceBadge({ level }: { level: string }) {
    const map: Record<string, string> = {
        High: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
        Moderate: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
        Low: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
        Insufficient: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    };
    return (
        <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${map[level] ?? map.Insufficient}`}>
            {level}
        </span>
    );
}

function InsightTypeBadge({ type }: { type: string }) {
    const map: Record<string, string> = {
        fact: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400',
        interpretation: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
        speculation: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    };
    return (
        <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${map[type] ?? map.fact}`}>
            {type}
        </span>
    );
}

function RiskBadge({ level, label }: { level: string; label: string }) {
    const map: Record<string, string> = {
        High: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
        Moderate: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
        Low: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    };
    return (
        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${map[level] ?? map.Low}`}>
            {label}: {level}
        </span>
    );
}

function DeepDiveButton({ btn, index }: { btn: any; index: number }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-xl border border-indigo-200/70 dark:border-indigo-500/20 overflow-hidden transition-all hover:border-indigo-400 dark:hover:border-indigo-500/40 hover:shadow-sm">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50/60 dark:bg-indigo-500/5 hover:bg-indigo-100/60 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer text-left gap-3"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-sm">
                        {index + 1}
                    </span>
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 truncate">{btn.title}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-indigo-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="px-5 pb-5 pt-3 space-y-3 bg-white/60 dark:bg-slate-900/40 border-t border-indigo-100/60 dark:border-indigo-500/10 animate-in slide-in-from-top-2 duration-200">
                    {btn.focus && (
                        <div>
                            <p className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1">Focus</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{btn.focus}</p>
                        </div>
                    )}
                    {btn.why_it_matters && (
                        <div>
                            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Why it matters</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{btn.why_it_matters}</p>
                        </div>
                    )}
                    {btn.how_to_proceed && (
                        <div>
                            <p className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-1">How to proceed</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{btn.how_to_proceed}</p>
                        </div>
                    )}
                    {btn.linked_findings && (
                        <div className="pt-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Linked findings</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed">{btn.linked_findings}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const ANALYSIS_LABELS: Record<string, string> = {
    geschaeftsmodell_marktposition: 'Geschäftsmodell & Marktposition',
    arbeitsbedingungen_kultur: 'Arbeitsbedingungen & Kultur',
    gehaelter_benefits: 'Gehälter & Benefits',
    karriere_entwicklung: 'Karriere & Entwicklung',
    stabilitaet_zukunft: 'Stabilität & Zukunft',
};

// ─── Main export ───────────────────────────────────────────────────────────────

export default function CompanyProfileView({ data }: { data: any }) {
    const [reportExpanded, setReportExpanded] = useState(false);
    const [analysisExpanded, setAnalysisExpanded] = useState<Record<string, boolean>>({});

    const toggleAnalysis = (key: string) =>
        setAnalysisExpanded(prev => ({ ...prev, [key]: !prev[key] }));

    const d = data;

    // Normalize red_flags: support both string[] (legacy) and {flag, probability, impact}[]
    const redFlags: Array<{ flag: string; probability?: string; impact?: string }> =
        (d.red_flags || []).map((r: any) =>
            typeof r === 'string' ? { flag: r } : r
        );

    return (
        <div className="space-y-5">

            {/* ── Executive Summary ─────────────────────────────────────────── */}
            {d.executive_summary && (
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-indigo-500/5 dark:to-purple-500/5 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl">
                                <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Executive Summary</span>
                        </div>
                        {d.executive_summary.gesamt_confidence && (
                            <ConfidenceBadge level={d.executive_summary.gesamt_confidence} />
                        )}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
                        {d.executive_summary.gesamtbewertung}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {d.executive_summary.geeignet_fuer?.length > 0 && (
                            <div className="p-3 bg-white/70 dark:bg-slate-900/40 rounded-xl border border-emerald-200/60 dark:border-emerald-500/15">
                                <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Geeignet für</p>
                                <ul className="space-y-1">
                                    {d.executive_summary.geeignet_fuer.map((t: string, i: number) => (
                                        <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300 flex gap-2">
                                            <span className="text-emerald-400">✓</span>{t}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {d.executive_summary.weniger_geeignet?.length > 0 && (
                            <div className="p-3 bg-white/70 dark:bg-slate-900/40 rounded-xl border border-rose-200/60 dark:border-rose-500/15">
                                <p className="text-[9px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-2">Weniger geeignet für</p>
                                <ul className="space-y-1">
                                    {d.executive_summary.weniger_geeignet.map((t: string, i: number) => (
                                        <li key={i} className="text-xs text-rose-800 dark:text-rose-300 flex gap-2">
                                            <span className="text-rose-400">–</span>{t}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Structured Analysis ───────────────────────────────────────── */}
            {d.structured_analysis && (
                <Section title="Strukturierte Analyse" icon={<BarChart2 className="w-4 h-4" />} color="slate">
                    <div className="space-y-2">
                        {Object.entries(d.structured_analysis).map(([key, val]: [string, any]) => (
                            <div key={key} className="rounded-xl border border-slate-200/60 dark:border-slate-700/40 overflow-hidden">
                                <button
                                    onClick={() => toggleAnalysis(key)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-white/60 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                            {ANALYSIS_LABELS[key] ?? key}
                                        </span>
                                        {val.confidence_level && <ConfidenceBadge level={val.confidence_level} />}
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${analysisExpanded[key] ? 'rotate-180' : ''}`} />
                                </button>
                                {analysisExpanded[key] && val && (
                                    <div className="px-4 pb-4 pt-2 space-y-3 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-2 duration-200">
                                        {val.assessment && (
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Assessment</p>
                                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{val.assessment}</p>
                                            </div>
                                        )}
                                        {val.evidence_basis && (
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Evidence Basis</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 italic">{val.evidence_basis}</p>
                                            </div>
                                        )}
                                        {val.key_uncertainty && (
                                            <div className="p-3 bg-amber-50/60 dark:bg-amber-500/5 rounded-lg border border-amber-200/60 dark:border-amber-500/15">
                                                <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">Key Uncertainty</p>
                                                <p className="text-xs text-amber-800 dark:text-amber-300">{val.key_uncertainty}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Description ───────────────────────────────────────────────── */}
            {d.description && !d.executive_summary && (
                <Section title="Hintergrund" icon={<Building2 className="w-4 h-4" />} color="slate">
                    <p className="text-sm leading-relaxed">{d.description}</p>
                </Section>
            )}

            {/* ── SWOT ──────────────────────────────────────────────────────── */}
            {d.swot_analysis && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border p-5 bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Stärken</span>
                        </div>
                        <ul className="space-y-2.5">
                            {d.swot_analysis.strengths?.slice(0, 4).map((s: string, i: number) => (
                                <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300/90 leading-normal flex gap-2">
                                    <span className="text-emerald-400 dark:text-emerald-500/50 flex-shrink-0">•</span>{s}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="rounded-2xl border p-5 bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-rose-100 dark:bg-rose-500/20 rounded-lg">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            </div>
                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-widest">Risiken</span>
                        </div>
                        <ul className="space-y-2.5">
                            {d.swot_analysis.weaknesses?.slice(0, 4).map((w: string, i: number) => (
                                <li key={i} className="text-xs text-rose-800 dark:text-rose-300/90 leading-normal flex gap-2">
                                    <span className="text-rose-400 dark:text-rose-500/50 flex-shrink-0">•</span>{w}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {/* ── Strategy & Market ─────────────────────────────────────────── */}
            {d.company_intelligence && (
                <Section title="Strategie & Markt" icon={<TrendingUp className="w-4 h-4" />} color="sky">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {d.company_intelligence.wirtschaftliche_lage && (
                            <div className="p-4 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-sky-100/50 dark:border-sky-500/10">
                                <p className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-2">Wirtschaftliche Lage</p>
                                <p className="text-sm leading-relaxed">{d.company_intelligence.wirtschaftliche_lage}</p>
                            </div>
                        )}
                        {d.company_intelligence.marktposition && (
                            <div className="p-4 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-sky-100/50 dark:border-sky-500/10">
                                <p className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-2">Marktposition & USP</p>
                                <p className="text-sm leading-relaxed mb-3">{d.company_intelligence.marktposition.usp}</p>
                                {d.company_intelligence.marktposition.hauptwettbewerber?.length > 0 && (
                                    <div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-2">Wettbewerber</p>
                                        <div className="flex flex-wrap gap-2">
                                            {d.company_intelligence.marktposition.hauptwettbewerber.map((c: string, i: number) => (
                                                <span key={i} className="px-2.5 py-1 bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 rounded-lg text-xs font-bold">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ── Culture ───────────────────────────────────────────────────── */}
            {d.culture_summary && (
                <Section title="Culture & Vibe" icon={<Users className="w-4 h-4" />} color="indigo">
                    <div className="relative">
                        <div className="absolute -left-2 top-0 bottom-0 w-1 bg-indigo-500/20 rounded-full" />
                        <p className="text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed italic pl-4">&bdquo;{d.culture_summary}&ldquo;</p>
                    </div>
                </Section>
            )}

            {/* ── Key Insights ──────────────────────────────────────────────── */}
            {d.key_insights?.length > 0 && (
                <Section title="Key Insights" icon={<Lightbulb className="w-4 h-4" />} color="amber">
                    <div className="space-y-3">
                        {d.key_insights.map((item: any, i: number) => (
                            <div key={i} className="flex gap-3 items-start">
                                <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{item.insight}</p>
                                </div>
                                {item.type && <InsightTypeBadge type={item.type} />}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Red Flags (enhanced) ──────────────────────────────────────── */}
            {redFlags.length > 0 && (
                <Section title="Red Flags" icon={<AlertTriangle className="w-4 h-4" />} color="rose">
                    <div className="space-y-3">
                        {redFlags.map((r, i) => (
                            <div key={i} className="flex gap-3 items-start">
                                <span className="text-rose-400 dark:text-rose-500/70 flex-shrink-0 mt-0.5">⚑</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-rose-800 dark:text-rose-300 leading-relaxed mb-1.5">{r.flag}</p>
                                    {(r.probability || r.impact) && (
                                        <div className="flex gap-1.5 flex-wrap">
                                            {r.probability && <RiskBadge level={r.probability} label="Probability" />}
                                            {r.impact && <RiskBadge level={r.impact} label="Impact" />}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Market Comparison ─────────────────────────────────────────── */}
            {d.market_comparison && (
                <Section title="Marktvergleich" icon={<BarChart2 className="w-4 h-4" />} color="purple">
                    <div className="space-y-4">
                        {d.market_comparison.competitors?.length > 0 && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr>
                                            <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest pb-2 pr-4">Wettbewerber</th>
                                            <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest pb-2 pr-4">Gehalt</th>
                                            <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest pb-2 pr-4">Karriere</th>
                                            <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest pb-2">Stabilität</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {d.market_comparison.competitors.map((c: any, i: number) => (
                                            <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                                                <td className="py-2.5 pr-4">
                                                    <span className="font-bold text-purple-700 dark:text-purple-400">{c.name}</span>
                                                </td>
                                                <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-400">{c.salary_comparison}</td>
                                                <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-400">{c.career_paths}</td>
                                                <td className="py-2.5 text-slate-600 dark:text-slate-400">{c.stability}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {(d.market_comparison.relative_strengths?.length > 0 || d.market_comparison.relative_weaknesses?.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                {d.market_comparison.relative_strengths?.length > 0 && (
                                    <div className="p-3 bg-emerald-50/60 dark:bg-emerald-500/5 rounded-xl border border-emerald-200/60 dark:border-emerald-500/15">
                                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Stärken vs. Markt</p>
                                        <ul className="space-y-1">
                                            {d.market_comparison.relative_strengths.map((s: string, i: number) => (
                                                <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300 flex gap-2">
                                                    <span className="text-emerald-400 flex-shrink-0">+</span>{s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {d.market_comparison.relative_weaknesses?.length > 0 && (
                                    <div className="p-3 bg-rose-50/60 dark:bg-rose-500/5 rounded-xl border border-rose-200/60 dark:border-rose-500/15">
                                        <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-2">Schwächen vs. Markt</p>
                                        <ul className="space-y-1">
                                            {d.market_comparison.relative_weaknesses.map((w: string, i: number) => (
                                                <li key={i} className="text-xs text-rose-800 dark:text-rose-300 flex gap-2">
                                                    <span className="text-rose-400 flex-shrink-0">–</span>{w}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ── Key Milestones ────────────────────────────────────────────── */}
            {d.key_artifacts?.length > 0 && (
                <Section title="Meilensteine" icon={<Globe className="w-4 h-4" />} color="slate">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {d.key_artifacts.slice(0, 4).map((art: any, i: number) => (
                            <div key={i} className="group p-4 bg-white dark:bg-slate-900/30 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all hover:border-indigo-500/30">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1 group-hover:text-indigo-500 transition-colors">{art.title}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">{art.description}</p>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Comprehensive Report ──────────────────────────────────────── */}
            {d.comprehensive_report && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900/40 shadow-sm transition-all hover:shadow-md">
                    <button
                        onClick={() => setReportExpanded(v => !v)}
                        className="w-full flex items-center justify-between px-6 py-5 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center">
                                <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="text-left">
                                <span className="block text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest leading-none mb-1">Research Report</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Vollständige Markt- & Unternehmensanalyse</span>
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
                                {d.comprehensive_report}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            )}

            {/* ── Deep Dive Buttons ─────────────────────────────────────────── */}
            {d.deep_dive_buttons?.length > 0 && (
                <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-500/15 bg-indigo-50/30 dark:bg-indigo-500/3 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl">
                            <Search className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Deep Dive Actions</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Gezielte Recherche-Aktionen für fundierte Entscheidungen</p>
                        </div>
                        <span className="ml-auto text-xs font-bold text-indigo-500 bg-indigo-100 dark:bg-indigo-500/20 px-2 py-0.5 rounded-full">
                            {d.deep_dive_buttons.length}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {d.deep_dive_buttons.map((btn: any, i: number) => (
                            <DeepDiveButton key={i} btn={btn} index={i} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
