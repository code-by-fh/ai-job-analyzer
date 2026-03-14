"use client";

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    AlertTriangle, Building2, CheckCircle2, ChevronDown,
    Globe, Loader2, RefreshCw, TrendingUp, Users, Search
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import PageHeader from '../components/PageHeader';
import { useLanguage } from '../components/LanguageProvider';
import { useNotification } from '../components/NotificationProvider';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function Section({ title, icon, children, color = 'slate' }: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    color?: 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'sky';
}) {
    const bg: Record<string, string> = {
        slate: 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50 shadow-sm',
        indigo: 'bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/20 shadow-sm',
        emerald: 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20 shadow-sm',
        rose: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20 shadow-sm',
        amber: 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20 shadow-sm',
        sky: 'bg-sky-50/50 dark:bg-sky-500/5 border-sky-200 dark:border-sky-500/20 shadow-sm',
    };
    const tc: Record<string, string> = {
        slate: 'text-slate-600 dark:text-slate-400',
        indigo: 'text-indigo-600 dark:text-indigo-400',
        emerald: 'text-emerald-700 dark:text-emerald-400',
        rose: 'text-rose-700 dark:text-rose-400',
        amber: 'text-amber-700 dark:text-amber-400',
        sky: 'text-sky-700 dark:text-sky-400',
    };
    return (
        <div className={`rounded-2xl border p-5 ${bg[color]} transition-all hover:shadow-md`}>
            <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${bg[color]} border-none shadow-inner`}>
                    <span className={tc[color]}>{icon}</span>
                </div>
                <h3 className={`text-sm font-bold uppercase tracking-widest ${tc[color]}`}>{title}</h3>
            </div>
            <div className="text-slate-600 dark:text-slate-300">
                {children}
            </div>
        </div>
    );
}

function CompanyCard({ company }: { company: any }) {
    const { showError } = useNotification();
    const [expanded, setExpanded] = useState(false);
    const [reportExpanded, setReportExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [queued, setQueued] = useState(false);
    const [data, setData] = useState<any>(company);

    const handleUpdate = () => {
        setLoading(true);
        fetch(`${API_BASE}/companies/${data.domain}/analyze`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_refresh: true }),
        }).then(res => {
            if (!res.ok) throw new Error(`POST /companies/${data.domain}/analyze → HTTP ${res.status}`);
            setQueued(true);
        }).catch((e: Error) => showError(e.message))
            .finally(() => setLoading(false));
    };

    const d = data;
    const hasProfile = Boolean(d.description || d.swot_analysis || d.culture_summary || d.company_intelligence);

    return (
        <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all hover:shadow-lg">
            {/* Company Header */}
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-6 py-5 bg-white/80 dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <span className="block text-sm font-bold text-slate-800 dark:text-slate-200">
                            {d.name || d.domain}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{d.domain}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {!hasProfile && (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-lg">
                            Kein Profil
                        </span>
                    )}
                    <div className={`p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </div>
                </div>
            </button>

            {/* Expanded Content */}
            {expanded && (
                <div className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-slate-800/50 animate-in slide-in-from-top-2 duration-300">
                    {loading || queued ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse" />
                                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin relative z-10" />
                            </div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Company Research läuft…</p>
                        </div>
                    ) : !hasProfile ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl mt-4 hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all">
                            <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm">
                                <Building2 className="w-6 h-6 text-indigo-500" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-base font-bold text-slate-800 dark:text-slate-200">Deep Company Intelligence</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">SWOT, Kultur, Gehaltsbenchmarks und Marktpositionierung</p>
                            </div>
                            <button
                                onClick={handleUpdate}
                                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer"
                            >
                                Analyse starten <TrendingUp className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-5 mt-4">
                            {/* Toolbar */}
                            <div className="flex items-center justify-end">
                                <button
                                    onClick={handleUpdate}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 dark:text-slate-400 dark:bg-slate-800 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                                    Daten aktualisieren
                                </button>
                            </div>

                            {/* Description */}
                            {d.description && (
                                <Section title="Hintergrund" icon={<Building2 className="w-4 h-4" />} color="slate">
                                    <p className="text-sm leading-relaxed">{d.description}</p>
                                </Section>
                            )}

                            {/* SWOT */}
                            {d.swot_analysis && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="rounded-2xl border p-5 bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20 shadow-sm transition-all hover:shadow-md">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="p-1.5 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                            </div>
                                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Stärken</span>
                                        </div>
                                        <ul className="space-y-2.5">
                                            {d.swot_analysis.strengths?.slice(0, 4).map((s: string, i: number) => (
                                                <li key={i} className="text-xs text-emerald-800 dark:text-emerald-300/90 leading-normal flex gap-2">
                                                    <span className="text-emerald-400 dark:text-emerald-500/50">•</span>{s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="rounded-2xl border p-5 bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20 shadow-sm transition-all hover:shadow-md">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="p-1.5 bg-rose-100 dark:bg-rose-500/20 rounded-lg">
                                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                                            </div>
                                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-widest">Risiken</span>
                                        </div>
                                        <ul className="space-y-2.5">
                                            {d.swot_analysis.weaknesses?.slice(0, 4).map((w: string, i: number) => (
                                                <li key={i} className="text-xs text-rose-800 dark:text-rose-300/90 leading-normal flex gap-2">
                                                    <span className="text-rose-400 dark:text-rose-500/50">•</span>{w}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Strategy & Market */}
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

                            {/* Culture */}
                            {d.culture_summary && (
                                <Section title="Culture & Vibe" icon={<Users className="w-4 h-4" />} color="indigo">
                                    <div className="relative">
                                        <div className="absolute -left-2 top-0 bottom-0 w-1 bg-indigo-500/20 rounded-full" />
                                        <p className="text-sm text-indigo-700 dark:text-indigo-300 leading-relaxed italic pl-4">„{d.culture_summary}"</p>
                                    </div>
                                </Section>
                            )}

                            {/* Key Milestones */}
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

                            {/* Research Report */}
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
                                                <span className="block text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest leading-none mb-1">Markt Research Report</span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Umfassende Zusammenfassung der Marktzusammenhänge</span>
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
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function CompaniesPage() {
    const { t } = useLanguage();
    const { showError } = useNotification();
    const [companies, setCompanies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetch(`${API_BASE}/companies`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : [])
            .then(data => setCompanies(data))
            .catch(() => showError('GET /companies fehlgeschlagen'))
            .finally(() => setLoading(false));
    }, []);

    const filtered = companies.filter(c => {
        const q = search.toLowerCase();
        return !q || (c.name || '').toLowerCase().includes(q) || c.domain.toLowerCase().includes(q);
    });

    return (
        <PageWrapper>
            <PageHeader title={t('companiesPageTitle')} subtitle={t('companiesPageSubtitle')} />

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Firma suchen..."
                    className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
                    <Building2 className="w-12 h-12 opacity-30" />
                    <p className="text-sm font-medium">
                        {search ? 'Keine Treffer.' : 'Noch keine Firmenprofile vorhanden.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
                        {filtered.length} {filtered.length === 1 ? 'Firma' : 'Firmen'}
                    </p>
                    {filtered.map(company => (
                        <CompanyCard key={company.domain} company={company} />
                    ))}
                </div>
            )}
        </PageWrapper>
    );
}
