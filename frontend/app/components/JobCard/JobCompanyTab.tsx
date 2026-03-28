import React, { useEffect, useRef, useState } from 'react';
import { Building2, Loader2, RefreshCw, TrendingUp, X } from 'lucide-react';
import type { Job } from '../../lib/types';
import { useNotification } from '../NotificationProvider';
import { fetchWithAuth } from '../AuthProvider';
import CompanyProfileView from '../CompanyProfileView';

interface JobCompanyTabProps {
    job: Job;
    apiBase: string;
}

const formatElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function JobCompanyTab({ job, apiBase }: JobCompanyTabProps) {
    const { showError } = useNotification();
    const [companyData, setCompanyData] = useState<any | null>(null);
    const [companyLoading, setCompanyLoading] = useState(false);
    const [companyQueued, setCompanyQueued] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (job.company_domain && !companyData && !companyLoading) {
            setCompanyLoading(true);
            fetchWithAuth(`${apiBase}/companies/${job.company_domain}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        setCompanyData(data);
                        localStorage.removeItem(`gen_company_${job.id}`);
                    } else {
                        const stored = localStorage.getItem(`gen_company_${job.id}`);
                        if (stored) setCompanyQueued(true);
                    }
                })
                .catch(() => showError(`GET /companies/${job.company_domain} fehlgeschlagen`))
                .finally(() => setCompanyLoading(false));
        } else if (!job.company_domain) {
            const stored = localStorage.getItem(`gen_company_${job.id}`);
            if (stored) setCompanyQueued(true);
        }
    }, []);

    useEffect(() => {
        if (!companyQueued) {
            if (timerRef.current) clearInterval(timerRef.current);
            setElapsed(0);
            return;
        }
        const stored = localStorage.getItem(`gen_company_${job.id}`);
        const startTime = stored ? parseInt(stored) : Date.now();
        if (!stored) localStorage.setItem(`gen_company_${job.id}`, startTime.toString());
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
        timerRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [companyQueued, job.id]);

    useEffect(() => {
        if (!companyQueued || !job.company_domain) return;
        const interval = setInterval(() => {
            fetchWithAuth(`${apiBase}/companies/${job.company_domain}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        setCompanyData(data);
                        setCompanyQueued(false);
                        localStorage.removeItem(`gen_company_${job.id}`);
                    }
                })
                .catch(() => { });
        }, 5000);
        return () => clearInterval(interval);
    }, [companyQueued, job.id, job.company_domain, apiBase]);

    const handleUpdate = () => {
        setCompanyData(null);
        setCompanyQueued(true);
        localStorage.setItem(`gen_company_${job.id}`, Date.now().toString());
        fetchWithAuth(`${apiBase}/companies/${job.company_domain}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_refresh: true }),
        }).then(res => {
            if (!res.ok) throw new Error(`POST /companies/${job.company_domain}/analyze → HTTP ${res.status}`);
        }).catch((e: Error) => {
            setCompanyQueued(false);
            localStorage.removeItem(`gen_company_${job.id}`);
            showError(e.message);
        });
    };

    const handleAnalyze = () => {
        setCompanyQueued(true);
        localStorage.setItem(`gen_company_${job.id}`, Date.now().toString());
        fetchWithAuth(`${apiBase}/companies/${job.company_domain}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_refresh: false }),
        }).then(res => {
            if (!res.ok) throw new Error(`POST /companies/${job.company_domain}/analyze → HTTP ${res.status}`);
        }).catch((e: Error) => {
            setCompanyQueued(false);
            localStorage.removeItem(`gen_company_${job.id}`);
            showError(e.message);
        });
    };

    const handleCancel = () => {
        setCompanyQueued(false);
        localStorage.removeItem(`gen_company_${job.id}`);
    };


    if (companyQueued) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin relative z-10" />
                </div>
                <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-200">Company Research läuft…</p>
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

    if (!companyData) {
        return (
            <div className="group relative flex flex-col items-center justify-center py-16 gap-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl transition-all hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50/50 dark:bg-slate-900/20">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300">
                    <Building2 className="w-8 h-8 text-indigo-500" />
                </div>
                <div className="text-center px-6 max-w-sm space-y-2">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200">Deep Company Intelligence</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Erhalte exklusive Einblicke in SWOT, Kultur, Gehaltsbenchmarks und Marktpositionierung.</p>
                </div>
                <button
                    onClick={handleAnalyze}
                    className="group flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer"
                >
                    Analyse starten
                    <TrendingUp className="w-4 h-4" />
                </button>
            </div>
        );
    }

    const d = companyData;

    return (
        <div className="space-y-6">
            {/* Toolbar */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{job.company_domain || job.company}</span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Unternehmensprofil</p>
                    </div>
                </div>
                <button
                    onClick={handleUpdate}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 dark:text-slate-400 dark:bg-slate-800 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 rounded-xl transition-all cursor-pointer"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Daten aktualisieren
                </button>
            </div>

            <CompanyProfileView data={d} domain={d.domain} fetchWithAuth={fetchWithAuth} />
        </div>
    );
}
