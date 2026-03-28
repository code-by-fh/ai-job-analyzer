"use client";

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    AlertTriangle, BarChart2, Brain, ChevronDown, Globe, Lightbulb, TrendingUp, Zap,
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
        Insufficient: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400',
    };
    return (
        <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${map[level] ?? map.Moderate}`}>
            {level}
        </span>
    );
}

function RiskBadge({ level }: { level: string }) {
    const map: Record<string, string> = {
        Low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
        Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
        High: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
    };
    return (
        <span className={`inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${map[level] ?? map.Medium}`}>
            {level}
        </span>
    );
}

function AnalysisArea({ area }: { area: any }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`rounded-xl border overflow-hidden transition-all duration-200 ${open ? 'border-indigo-400 dark:border-indigo-500/50' : 'border-slate-200 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-indigo-500/40'}`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-50/60 dark:bg-slate-800/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition-colors cursor-pointer text-left gap-3"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{area.area}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {area.confidence && <ConfidenceBadge level={area.confidence} />}
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </div>
            </button>
            {open && (
                <div className="px-5 pb-5 pt-4 space-y-3 bg-white/80 dark:bg-slate-900/60 border-t border-slate-100/60 dark:border-slate-700/20 animate-in slide-in-from-top-2 duration-200">
                    {area.assessment && (
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{area.assessment}</p>
                    )}
                    {area.evidence_basis && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/30">
                            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Quellenbasis</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{area.evidence_basis}</p>
                        </div>
                    )}
                    {area.key_uncertainty && (
                        <div className="flex gap-2">
                            <span className="text-amber-500 flex-shrink-0 mt-0.5">⚠</span>
                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed italic">{area.key_uncertainty}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function DeepDiveButton({ btn, index, domain, companyName, fetchWithAuth, language }: {
    btn: any;
    index: number;
    domain: string;
    companyName: string;
    fetchWithAuth: Function;
    language?: string;
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? (window as any).__ENV__?.APP_API_URL : '') || '';

    const handleResearch = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE}/companies/${domain}/deep-dive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    focus: btn.focus,
                    how_to_proceed: btn.how_to_proceed,
                    company_name: companyName,
                    title: btn.title,
                    language: language || 'de',
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
        <div className={`rounded-xl border overflow-hidden transition-all duration-200 ${open ? 'border-indigo-400 dark:border-indigo-500/50 shadow-md' : 'border-indigo-200/70 dark:border-indigo-500/20 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-sm'}`}>
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

                    {!result && (
                        <button
                            onClick={handleResearch}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white text-xs font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                        >
                            <Zap className={`w-3.5 h-3.5 ${loading ? 'animate-pulse' : ''}`} />
                            {loading ? 'Recherchiere…' : 'Jetzt recherchieren'}
                        </button>
                    )}

                    {error && (
                        <p className="text-xs text-rose-500 dark:text-rose-400">{error}</p>
                    )}

                    {result && (
                        <div className="mt-2 rounded-xl border border-indigo-200/60 dark:border-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-500/5 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Recherche-Ergebnis</p>
                                <button
                                    onClick={() => setResult(null)}
                                    className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
                                >
                                    Neu starten
                                </button>
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

// ─── Main export ───────────────────────────────────────────────────────────────

export default function CompanyProfileView({ data, domain, fetchWithAuth }: {
    data: any;
    domain?: string;
    fetchWithAuth?: Function;
}) {
    const d = data;
    const language = d.meta?.language || 'de';

    return (
        <div className="space-y-5">

            {/* ── Executive Summary ─────────────────────────────────────────── */}
            {d.executive_summary && (
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/20 bg-gradient-to-br from-indigo-50/80 to-purple-50/50 dark:from-indigo-500/5 dark:to-purple-500/5 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl">
                                <Brain className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-sm font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Gesamtbewertung</span>
                        </div>
                        {d.executive_summary.confidence && (
                            <ConfidenceBadge level={d.executive_summary.confidence} />
                        )}
                    </div>
                    {d.executive_summary.assessment && (
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">{d.executive_summary.assessment}</p>
                    )}
                    {(d.executive_summary.suitable_for || d.executive_summary.not_suitable_for) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                            {d.executive_summary.suitable_for && (
                                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-500/10 rounded-xl border border-emerald-200/60 dark:border-emerald-500/20">
                                    <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1.5">Geeignet für</p>
                                    <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">{d.executive_summary.suitable_for}</p>
                                </div>
                            )}
                            {d.executive_summary.not_suitable_for && (
                                <div className="p-3 bg-rose-50/60 dark:bg-rose-500/10 rounded-xl border border-rose-200/60 dark:border-rose-500/20">
                                    <p className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1.5">Nicht geeignet für</p>
                                    <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">{d.executive_summary.not_suitable_for}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Analysis Areas ────────────────────────────────────────────── */}
            {d.analysis?.length > 0 && (
                <Section title="Detailanalyse" icon={<TrendingUp className="w-4 h-4" />} color="indigo">
                    <div className="space-y-2">
                        {d.analysis.map((area: any, i: number) => (
                            <AnalysisArea key={i} area={area} />
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Key Insights ──────────────────────────────────────────────── */}
            {d.key_insights && (
                <Section title="Key Insights" icon={<Lightbulb className="w-4 h-4" />} color="amber">
                    <div className="space-y-4">
                        {d.key_insights.facts?.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Fakten</p>
                                <ul className="space-y-1">
                                    {d.key_insights.facts.map((f: any, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                                            <span>{typeof f === 'string' ? f : JSON.stringify(f)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {d.key_insights.interpretations?.length > 0 && (
                            <div className="p-3 bg-amber-100/40 dark:bg-amber-500/10 rounded-xl border border-amber-200/50 dark:border-amber-500/15">
                                <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Interpretationen</p>
                                <ul className="space-y-1">
                                    {d.key_insights.interpretations.map((item: any, i: number) => (
                                        <li key={i} className="text-sm leading-relaxed">{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {d.key_insights.uncertainties?.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Unsicherheiten</p>
                                <ul className="space-y-1">
                                    {d.key_insights.uncertainties.map((u: any, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 italic">
                                            <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0 mt-1.5" />
                                            <span>{typeof u === 'string' ? u : JSON.stringify(u)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ── Risks ─────────────────────────────────────────────────────── */}
            {d.risks?.length > 0 && (
                <Section title="Risiken" icon={<AlertTriangle className="w-4 h-4" />} color="rose">
                    <div className="space-y-3">
                        {d.risks.map((risk: any, i: number) => (
                            <div key={i} className="p-4 bg-white/60 dark:bg-slate-900/40 rounded-xl border border-rose-200/50 dark:border-rose-500/15">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">{risk.title}</p>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {risk.probability && <RiskBadge level={risk.probability} />}
                                        {risk.impact && <RiskBadge level={risk.impact} />}
                                    </div>
                                </div>
                                {risk.description && (
                                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{risk.description}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Market Comparison ─────────────────────────────────────────── */}
            {d.market_comparison && (
                <Section title="Marktvergleich" icon={<BarChart2 className="w-4 h-4" />} color="sky">
                    <div className="space-y-4">
                        {d.market_comparison.summary && (
                            <p className="text-sm leading-relaxed">{d.market_comparison.summary}</p>
                        )}
                        {d.market_comparison.comparison_points?.length > 0 && (
                            <div className="space-y-2">
                                {d.market_comparison.comparison_points.map((cp: any, i: number) => (
                                    <div key={i} className="p-3 bg-sky-50/50 dark:bg-sky-500/5 rounded-xl border border-sky-200/50 dark:border-sky-500/15">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-widest">{cp.dimension}</span>
                                            {cp.relative_position && (
                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">{cp.relative_position}</span>
                                            )}
                                        </div>
                                        {cp.comment && (
                                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{cp.comment}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* ── Deep Dive Buttons ─────────────────────────────────────────── */}
            {d.deep_dive_buttons?.length > 0 && (
                <div className="rounded-2xl border border-indigo-300/60 dark:border-indigo-500/25 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 dark:from-indigo-500/5 dark:to-violet-500/3 shadow-sm overflow-hidden">
                    <div className="px-5 pt-5 pb-4 border-b border-indigo-200/50 dark:border-indigo-500/15">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-600 dark:bg-indigo-500 rounded-xl shadow-sm">
                                <Zap className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">Tiefenrecherche</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Spezifische Aspekte des Unternehmens detailliert recherchieren</p>
                            </div>
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/20 px-2.5 py-1 rounded-full flex-shrink-0">
                                {d.deep_dive_buttons.length}
                            </span>
                        </div>
                    </div>
                    <div className="p-4 space-y-2">
                        {d.deep_dive_buttons.map((btn: any, i: number) => (
                            <DeepDiveButton
                                key={i}
                                btn={btn}
                                index={i}
                                domain={domain || ''}
                                companyName={data.name || domain || ''}
                                fetchWithAuth={fetchWithAuth || (() => {})}
                                language={language}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Online Resources ──────────────────────────────────────────── */}
            {d.online_resources && (() => {
                const res = d.online_resources;
                // Normalise to a flat list of URL strings
                let urls: string[] = [];
                if (typeof res === 'string' && res.startsWith('http')) {
                    urls = [res];
                } else if (Array.isArray(res)) {
                    urls = res.map((r: any) => (typeof r === 'string' ? r : r?.url || r?.speaking_url || JSON.stringify(r))).filter(Boolean);
                } else if (typeof res === 'object') {
                    urls = Object.values(res).filter((v): v is string => typeof v === 'string' && v.startsWith('http'));
                }
                if (!urls.length) return null;
                return (
                    <Section title="Online Ressourcen" icon={<Globe className="w-4 h-4" />} color="slate">
                        <ul className="space-y-2">
                            {urls.map((url, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline break-all">{url}</a>
                                </li>
                            ))}
                        </ul>
                    </Section>
                );
            })()}

        </div>
    );
}
