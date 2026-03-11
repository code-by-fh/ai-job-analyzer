import {
    AlertTriangle,
    Brain,
    Building2,
    Check,
    CheckCircle2,
    ChevronRight,
    Clock,
    Copy,
    Download,
    ExternalLink,
    FileText,
    Globe,
    Loader2,
    RefreshCw,
    Scale,
    User,
    Users
} from 'lucide-react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Job } from '../lib/types';
import type { JobStatus } from './JobStatusBadge';
import { useLanguage } from './LanguageProvider';

const STATUS_PIPELINE: JobStatus[] = ['OPEN', 'DRAFTED', 'APPLIED', 'INTERVIEW', 'OFFER', 'ACCEPTED'];

interface StatusMeta { icon: string; label: string; pillCls: string; cardBorder: string; stepDone: string; stepActive: string; connectorCls: string; }

const STATUS_META: Record<string, StatusMeta> = {
    OPEN: { icon: '🔍', label: 'Offen', pillCls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600', cardBorder: '', stepDone: 'bg-slate-400 border-slate-400 text-white', stepActive: 'bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-400 text-slate-700 dark:text-slate-200 ring-2 ring-slate-300 dark:ring-slate-600 shadow-lg', connectorCls: 'bg-slate-400 dark:bg-slate-500' },
    DRAFTED: { icon: '📝', label: 'Entwurf', pillCls: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30', cardBorder: 'border-indigo-200 dark:border-indigo-700/50', stepDone: 'bg-indigo-500 border-indigo-500 text-white', stepActive: 'bg-white dark:bg-slate-900 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-300 dark:ring-indigo-500/50 shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20', connectorCls: 'bg-indigo-400' },
    APPLIED: { icon: '✉️', label: 'Beworben', pillCls: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30', cardBorder: 'border-blue-200 dark:border-blue-700/50', stepDone: 'bg-blue-500 border-blue-500 text-white', stepActive: 'bg-white dark:bg-slate-900 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-300 dark:ring-blue-500/50 shadow-lg shadow-blue-100 dark:shadow-blue-900/20', connectorCls: 'bg-blue-400' },
    INTERVIEW: { icon: '🤝', label: 'Interview', pillCls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30', cardBorder: 'border-amber-200 dark:border-amber-600/50', stepDone: 'bg-amber-500 border-amber-500 text-white', stepActive: 'bg-white dark:bg-slate-900 border-amber-500 text-amber-700 dark:text-amber-300 ring-2 ring-amber-300 dark:ring-amber-500/50 shadow-lg shadow-amber-100 dark:shadow-amber-900/20', connectorCls: 'bg-amber-400' },
    OFFER: { icon: '🎉', label: 'Angebot', pillCls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30', cardBorder: 'border-emerald-300 dark:border-emerald-600/50 shadow-emerald-50 dark:shadow-emerald-900/20', stepDone: 'bg-emerald-500 border-emerald-500 text-white', stepActive: 'bg-white dark:bg-slate-900 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-300 dark:ring-emerald-500/50 shadow-lg shadow-emerald-100 dark:shadow-emerald-900/20', connectorCls: 'bg-emerald-400' },
    ACCEPTED: { icon: '🎊', label: 'Angenommen', pillCls: 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/30', cardBorder: 'border-teal-300 dark:border-teal-500/60 shadow-lg shadow-teal-50 dark:shadow-teal-900/30', stepDone: 'bg-teal-500 border-teal-500 text-white', stepActive: 'bg-white dark:bg-slate-900 border-teal-500 text-teal-700 dark:text-teal-300 ring-2 ring-teal-300 dark:ring-teal-500/50 shadow-lg shadow-teal-100 dark:shadow-teal-900/20', connectorCls: 'bg-teal-400' },
    REJECTED: { icon: '❌', label: 'Abgelehnt', pillCls: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30', cardBorder: 'border-rose-200 dark:border-rose-800/40', stepDone: 'bg-rose-500 border-rose-500 text-white', stepActive: 'bg-white dark:bg-slate-900 border-rose-500 text-rose-700 dark:text-rose-300 ring-2 ring-rose-300 dark:ring-rose-500/50 shadow-lg', connectorCls: 'bg-rose-400' },
    FAILED: { icon: '⚠️', label: 'Fehler', pillCls: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30', cardBorder: 'border-rose-200 dark:border-rose-800/40', stepDone: 'bg-rose-400 border-rose-400 text-white', stepActive: 'bg-white dark:bg-slate-900 border-rose-400 text-rose-700 dark:text-rose-300 ring-2 ring-rose-300 dark:ring-rose-500/50 shadow-lg', connectorCls: 'bg-rose-400' },
    GENERATING: { icon: '⚙️', label: 'Lädt…', pillCls: 'bg-indigo-600 text-white border-indigo-500 animate-pulse', cardBorder: '', stepDone: '', stepActive: '', connectorCls: '' },
};

interface GuidanceItem {
    id?: 'has_draft' | 'has_followup' | 'has_prep';
    text: string;
    done?: boolean;
    tabHint?: 'overview' | 'application' | 'interview' | 'company' | 'status';
}

interface StatusGuidance {
    bgCls: string;
    accentCls: string;
    nextAction: string;
    items: GuidanceItem[];
    nudge: string;
}

const STATUS_GUIDANCE: Record<string, StatusGuidance> = {
    OPEN: {
        bgCls: 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50',
        accentCls: 'text-slate-500 dark:text-slate-400',
        nextAction: 'Prüfe die Stelle und entscheide, ob du dich bewerben möchtest.',
        items: [
            { text: 'KI-Analyse gelesen (Übersicht-Tab)', tabHint: 'overview' },
            { text: 'Stellenbeschreibung vollständig gelesen' },
            { text: 'Unternehmen kurz recherchiert', tabHint: 'company' },
            { text: 'Bewerbungsentwurf starten', tabHint: 'application' },
        ],
        nudge: 'Jeder Schritt beginnt mit einer ehrlichen Selbsteinschätzung.',
    },
    DRAFTED: {
        bgCls: 'bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/20',
        accentCls: 'text-indigo-600 dark:text-indigo-400',
        nextAction: 'Überprüfe deinen Bewerbungsentwurf und sende ihn ab.',
        items: [
            { id: 'has_draft', text: 'Bewerbungsentwurf generiert', tabHint: 'application' },
            { text: 'Entwurf auf Vollständigkeit und Ton geprüft' },
            { text: 'Anschreiben personalisiert (Name, Bezug zur Stelle)' },
            { text: 'Unterlagen abgesendet / Formular ausgefüllt' },
        ],
        nudge: 'Perfekt ist der Feind des Guten — sende jetzt ab.',
    },
    APPLIED: {
        bgCls: 'bg-blue-50/50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20',
        accentCls: 'text-blue-600 dark:text-blue-400',
        nextAction: 'Dokumentiere deine Bewerbung und plane deinen Follow-up.',
        items: [
            { text: 'Eingangsbestätigung erhalten oder geprüft' },
            { id: 'has_followup', text: 'Follow-up-Datum gesetzt' },
            { id: 'has_prep', text: 'Interview Prep vorbereitet', tabHint: 'interview' },
            { text: 'Geduld: Rücklaufzeit oft 2–4 Wochen' },
        ],
        nudge: 'Du hast dich beworben — das war der schwerste Schritt.',
    },
    INTERVIEW: {
        bgCls: 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20',
        accentCls: 'text-amber-600 dark:text-amber-400',
        nextAction: 'Bereite dich intensiv auf das Gespräch vor.',
        items: [
            { id: 'has_prep', text: 'Interview Prep Material generiert', tabHint: 'interview' },
            { text: '3 eigene Stärken-Beispiele (STAR-Methode) ausgearbeitet' },
            { text: 'Rückfragen ans Unternehmen vorbereitet' },
            { text: 'Logistik geklärt (Ort, Zeit, Kontakt, Video-Link)' },
        ],
        nudge: 'Vorbereitung ist der Unterschied zwischen Glück und Können.',
    },
    OFFER: {
        bgCls: 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20',
        accentCls: 'text-emerald-600 dark:text-emerald-400',
        nextAction: 'Analysiere das Angebot sorgfältig, bevor du antwortest.',
        items: [
            { text: 'Konditionen geprüft (Gehalt, Urlaub, Remote-Anteil)' },
            { text: 'Gehalts-Benchmark verglichen', tabHint: 'company' },
            { text: 'Verhandlungsspielraum identifiziert' },
            { text: '48h Bedenkzeit genommen (professionell & üblich)' },
        ],
        nudge: 'Ein Angebot ist eine Einladung zum Gespräch, kein Ultimatum.',
    },
    ACCEPTED: {
        bgCls: 'bg-teal-50/50 dark:bg-teal-500/5 border-teal-200 dark:border-teal-500/20',
        accentCls: 'text-teal-600 dark:text-teal-400',
        nextAction: 'Glückwunsch! Bereite deinen Start vor.',
        items: [
            { text: 'Schriftlichen Vertrag erhalten und geprüft' },
            { text: 'Startdatum und Onboarding-Infos bestätigt' },
            { text: 'Alle anderen Bewerbungen höflich abgesagt' },
            { text: 'Offene Stellen hier archiviert' },
        ],
        nudge: 'Du hast es geschafft. Jetzt beginnt das nächste Kapitel.',
    },
    REJECTED: {
        bgCls: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20',
        accentCls: 'text-rose-600 dark:text-rose-400',
        nextAction: 'Hol dir Feedback und ziehe Learnings aus dem Prozess.',
        items: [
            { text: 'Absageschreiben sorgfältig gelesen' },
            { text: 'Feedback angefragt (bei persönlichen Kontakten)' },
            { text: 'Bewerbungsunterlagen für nächste Runde angepasst' },
            { text: 'Nächste passende Stelle identifizieren' },
        ],
        nudge: 'Eine Absage zeigt dir, welche Tür besser passt.',
    },
    FAILED: {
        bgCls: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20',
        accentCls: 'text-rose-500 dark:text-rose-400',
        nextAction: 'Prüfe, ob ein technisches Problem vorliegt, und starte erneut.',
        items: [
            { text: 'Fehlermeldung in der Übersicht gelesen' },
            { text: 'Bewerbungsentwurf manuell kontrolliert' },
            { text: 'Neu generieren versucht', tabHint: 'application' },
            { text: 'Support kontaktiert, falls Problem anhält' },
        ],
        nudge: 'Manchmal hakt es technisch — kein Rückschlag, sondern ein Hinweis.',
    },
};

interface JobCardProps {
    job: Job;
    isGenerating: boolean;
    onGenerate: (job: Job) => void;
    onStatusUpdate: (jobId: string, status: JobStatus) => void;
    onToggleFavorite: (jobId: string, currentStatus: boolean) => void;
    isSelected?: boolean;
    onSelect?: (jobId: string, selected: boolean) => void;
    apiBase?: string;
}

export default function JobCard({
    job,
    isGenerating,
    onGenerate,
    onStatusUpdate,
    onToggleFavorite,
    isSelected = false,
    onSelect,
    apiBase = process.env.NEXT_PUBLIC_API_URL || '',
}: JobCardProps) {
    const { t } = useLanguage();

    const [activeTab, setActiveTab] = useState<'overview' | 'application' | 'interview' | 'company' | 'status' | null>('overview');
    const [history, setHistory] = useState<any[] | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [companyData, setCompanyData] = useState<any | null>(null);
    const [companyLoading, setCompanyLoading] = useState(false);
    const [companyQueued, setCompanyQueued] = useState(false);
    const [interviewPrep, setInterviewPrep] = useState<any | null>(null);
    const [interviewLoading, setInterviewLoading] = useState(false);
    const [interviewQueued, setInterviewQueued] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!job.application_draft) return;
        navigator.clipboard.writeText(job.application_draft);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = async () => {
        try {
            const baseUrl = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
            const res = await fetch(`${baseUrl}/jobs/${encodeURIComponent(job.id)}/download`, {
                credentials: 'include',
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error('Download failed with status:', res.status, errorData);
                throw new Error(errorData.detail || 'Download failed');
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Bewerbung_${job.company.replace(/\s+/g, '_')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            if (job.status === 'OPEN' || job.status === 'DRAFTED' || !job.status) {
                onStatusUpdate(job.id, 'APPLIED');
            }
        } catch (e: any) {
            console.error('PDF download error:', e);
            alert(t('downloadFailed') + ': ' + (e.message || 'Unknown error'));
        }
    };

    const timeAgo = (dateString?: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + t('dayUnit');
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + t('hourUnit');
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + t('minUnit');
        return t('now');
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-emerald-500 dark:text-emerald-400 border-emerald-500/50';
        if (score >= 50) return 'text-amber-500 dark:text-amber-400 border-amber-500/50';
        return 'text-rose-500 dark:text-rose-400 border-rose-500/50';
    };

    const scoreClass = getScoreColor(job.match_score);
    const currentStatus = job.status || 'OPEN';
    const statusMeta = STATUS_META[currentStatus] || STATUS_META['OPEN'];

    // Load data on mount
    useEffect(() => {
        // Auto-load interview prep from existing data (no generation)
        if (job.interview_prep_material && !interviewPrep) {
            try {
                setInterviewPrep(JSON.parse(job.interview_prep_material));
            } catch {
                setInterviewPrep({ raw: job.interview_prep_material });
            }
        }

        // Auto-load company profile (fetch only)
        if (job.company_domain && !companyData && !companyLoading) {
            setCompanyLoading(true);
            fetch(`${apiBase}/companies/${job.company_domain}`, { credentials: 'include' })
                .then(res => {
                    if (res.ok) return res.json();
                    return null;
                })
                .then(data => { if (data) setCompanyData(data); })
                .catch(() => { })
                .finally(() => setCompanyLoading(false));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // nur beim Mount!

    // React to prop updates (e.g. WebSocket-pushed interview_prep_material)
    useEffect(() => {
        if (job.interview_prep_material) {
            try {
                setInterviewPrep(JSON.parse(job.interview_prep_material));
                setInterviewQueued(false);
            } catch {
                setInterviewPrep({ raw: job.interview_prep_material });
            }
        }
    }, [job.interview_prep_material]);

    const prepData = interviewPrep;
    const pProblemsToSolve = prepData?.context?.potential_gaps || prepData?.problems_to_solve || [];
    const pSuccessFactors = prepData?.core_research?.success_factors || prepData?.success_factors || [];
    const pExecSummary = prepData?.report_output?.executive_summary || prepData?.executive_summary;
    const pCompAnalysis = prepData?.report_output?.comparative_analysis || prepData?.comparative_analysis || [];
    const pCaseStudies = prepData?.report_output?.case_studies || prepData?.case_studies || [];
    const pPredictions = prepData?.report_output?.expert_predictions || prepData?.expert_predictions || [];
    const pQForInterviewer = prepData?.report_output?.questions_for_interviewer || prepData?.questions_for_interviewer || [];
    const pPsychQuestions = prepData?.critical_analysis?.psychological_questions || prepData?.psychological_questions || [];
    const pViewpointRisks = prepData?.core_research?.counterfactuals?.risks || prepData?.opposing_viewpoints?.risks || [];
    const pViewpointMitigation = prepData?.core_research?.counterfactuals?.mitigation || prepData?.opposing_viewpoints?.mitigation || [];
    const pFullReport = prepData?.report_output?.deep_dive_analysis || prepData?.full_report || prepData?.full_prep_guide;

    // New mappings
    const pExperts = prepData?.context?.experts_used || [];
    const pPurpose = prepData?.context?.purpose;
    const pHypothesis = prepData?.core_research?.hypothesis_evaluation;
    const pSpecs = prepData?.specifications;
    const pSellingPitch = prepData?.critical_analysis?.solution_selling_pitch;
    const pConnections = prepData?.critical_analysis?.interdisciplinary_connections;

    const gapSeverityColor = (severity: string) => {
        if (severity === "kein Gap") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400";
        if (severity === "leichter Gap") return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400";
        return "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400";
    };
    const vibeColor = (val: string | undefined) => {
        if (val === "positiv" || val === "niedrig") return "text-emerald-500";
        if (val === "gemischt" || val === "normal") return "text-amber-500";
        return "text-rose-500";
    };

    return (
        <div
            className={`
        group relative rounded-2xl border transition-all duration-300 hover:z-30
        ${isSelected
                    ? 'bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 shadow-md'
                    : `bg-white dark:bg-slate-900 hover:shadow-lg dark:hover:shadow-none ${statusMeta.cardBorder || 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`
                }
      `}
        >
            {/* Glow Effect (Dark Mode) */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            {/* 1. HEADER: Score links + Tabs rechts */}
            <div className="flex items-center gap-4 px-4 sm:px-6 pt-4 pb-0">
                {/* Match Score */}
                <div
                    className="flex-shrink-0 cursor-pointer"
                    onClick={() => setActiveTab(activeTab === 'overview' ? null : 'overview')}
                >
                    <div className={`
                        relative w-16 h-16 rounded-xl flex flex-col items-center justify-center border-2
                        transition-all duration-300 group-hover:scale-105
                        ${scoreClass}
                        ${job.match_score >= 80
                            ? 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/20 dark:to-teal-500/20 shadow-md shadow-emerald-500/20 dark:shadow-emerald-500/40'
                            : job.match_score >= 50
                                ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/20 dark:to-orange-500/20 shadow-md shadow-amber-500/20 dark:shadow-amber-500/40'
                                : 'bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-500/20 dark:to-pink-500/20 shadow-md shadow-rose-500/20 dark:shadow-rose-500/40'
                        }`}>
                        <span className="text-xl font-black tracking-tight">{Math.round(job.match_score)}</span>
                        <span className="text-[8px] uppercase font-bold opacity-80 tracking-wider">{t('match')}</span>
                    </div>
                </div>

                {/* Titel + Tabs */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight line-clamp-1" title={job.title}>
                                {job.title}
                            </h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide uppercase">
                                    {job.company_domain || job.company}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {onSelect && (
                                <label className="relative flex items-center justify-center cursor-pointer group/cb">
                                    <input type="checkbox" className="peer sr-only" checked={isSelected} onChange={(e) => onSelect(job.id, e.target.checked)} />
                                    <div className={`w-[20px] h-[20px] rounded-md border-2 transition-all duration-200 flex items-center justify-center
                                        ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}>
                                        <svg className={`w-3 h-3 text-white transition-transform duration-300 ${isSelected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </label>
                            )}
                            <button
                                onClick={() => setActiveTab('status')}
                                className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border transition-all hover:opacity-80 cursor-pointer ${statusMeta.pillCls}`}
                                title="Status ändern"
                            >
                                {statusMeta.icon} {statusMeta.label}
                            </button>
                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/50 px-2 py-0.5 rounded-full border border-slate-200/50 dark:border-slate-700/30 whitespace-nowrap">
                                {timeAgo(job.created_at)}
                            </span>
                            <button
                                onClick={() => onToggleFavorite(job.id, job.is_favorite || false)}
                                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all active:scale-90 cursor-pointer text-base
                                    ${job.is_favorite
                                        ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 border border-amber-200 dark:border-amber-500/30'
                                        : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-transparent hover:border-amber-200 dark:hover:border-amber-500/30'}`}
                                title={job.is_favorite ? t('removeFromFavorites') : t('addToFavorites')}
                            >
                                {job.is_favorite ? '⭐' : '☆'}
                            </button>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex gap-0.5 overflow-x-auto border-b border-slate-100 dark:border-slate-800 -mb-[1px]">
                        {(['overview', 'application', 'interview', 'company', 'status'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => {
                                    setActiveTab(tab);
                                    if (tab === 'status' && history === null && !historyLoading) {
                                        setHistoryLoading(true);
                                        fetch(`${apiBase}/jobs/${job.id}/history`, { credentials: 'include' })
                                            .then(r => r.json()).then(setHistory).catch(() => setHistory([]))
                                            .finally(() => setHistoryLoading(false));
                                    }
                                }}
                                className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border-b-2 ${activeTab === tab
                                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                    : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                                    }`}
                            >
                                {tab === 'overview' && (t('overview') || 'Übersicht')}
                                {tab === 'application' && (t('application') || 'Bewerbung')}
                                {tab === 'interview' && (t('interviewPrep') || 'Interview Prep')}
                                {tab === 'company' && (t('companyProfile') || 'Firma')}
                                {tab === 'status' && 'Status'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 2. TAB INHALT */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800/50">
                {/* OVERVIEW = KI Analyse */}
                {/* OVERVIEW = KI Analyse & Beschreibung */}
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {job.generation_error && (
                            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                                <span className="font-bold">Generierungsfehler:</span> {job.generation_error}
                            </div>
                        )}

                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1 space-y-4">
                                <div className="bg-slate-50 dark:bg-slate-950/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Brain className="w-4 h-4 text-indigo-500" />
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('analysis') || 'KI-Analyse'}</span>
                                    </div>
                                    <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                                        <ReactMarkdown>{job.reasoning}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>

                            <div className="w-full md:w-64 space-y-4">
                                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Job Details</h3>
                                    <div className="space-y-3">
                                        {job.url && (
                                            <div>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Original Anzeige</span>
                                                <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 font-bold hover:underline flex items-center gap-1.5 truncate">
                                                    <ExternalLink className="w-3 h-3" /> {new URL(job.url).hostname.replace('www.', '')}
                                                </a>
                                            </div>
                                        )}
                                        {job.next_follow_up_at && (
                                            <div>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Nächster Follow-up</span>
                                                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1.5">
                                                    <Clock className="w-3 h-3" /> {new Date(job.next_follow_up_at).toLocaleDateString('de-DE')}
                                                </span>
                                            </div>
                                        )}
                                        {job.created_at && (
                                            <div>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Hinzugefügt am</span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                    {new Date(job.created_at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* APPLICATION */}
                {activeTab === 'application' && (
                    <div className="space-y-6">
                        {job.application_draft ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-indigo-500" />
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Bewerbungsschreiben</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleCopy}
                                            className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                        >
                                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                            {copied ? 'Kopiert' : (t('copyText') || 'Kopieren')}
                                        </button>
                                        <button
                                            onClick={handleDownload}
                                            className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-indigo-500/20"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            {t('saveAsPdf') || 'PDF Laden'}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-slate-900/40 p-8 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner font-serif">
                                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-slate-800 dark:prose-p:text-slate-300 prose-headings:text-slate-900 dark:prose-headings:text-slate-100 leading-relaxed italic">
                                        <ReactMarkdown>{job.application_draft}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 gap-4">
                                <p className="text-slate-500 dark:text-slate-400 text-sm">{t('noApplication') || 'Noch keine Bewerbung generiert.'}</p>
                                <button
                                    onClick={() => onGenerate(job)}
                                    disabled={isGenerating}
                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                                >
                                    {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {t('generateApplication') || 'Bewerbung generieren'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* INTERVIEW PREP */}
                {activeTab === 'interview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* LEFT COLUMN: Preparation Material */}
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <User className="w-4 h-4 text-indigo-500" />
                                    Vorbereitungs-Material
                                </h2>
                                {interviewPrep && (
                                    <button
                                        onClick={() => {
                                            setInterviewQueued(true);
                                            fetch(`${apiBase}/jobs/${job.id}/interview-prep`, { method: 'POST', credentials: 'include' }).catch(() => { });
                                        }}
                                        disabled={interviewQueued || interviewLoading}
                                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-colors cursor-pointer"
                                    >
                                        {interviewQueued ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                        Neu generieren
                                    </button>
                                )}
                            </div>
                            {interviewPrep ? (
                                <div className="space-y-6">
                                    {/* === Briefing & Hypothesis === */}
                                    {(pPurpose || pHypothesis || (pExperts && pExperts.length > 0)) && (
                                        <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700/50">
                                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                Strategisches Briefing
                                            </h3>
                                            {pPurpose && (
                                                <div className="mb-3">
                                                    <span className="text-[10px] font-bold text-indigo-500 uppercase block mb-1">Missions-Ziel</span>
                                                    <p className="text-sm text-slate-700 dark:text-slate-200 font-medium">{pPurpose}</p>
                                                </div>
                                            )}
                                            {pHypothesis && (
                                                <div className="mb-3">
                                                    <span className="text-[10px] font-bold text-emerald-500 uppercase block mb-1">Kern-Hypothese</span>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                                        {pHypothesis}
                                                    </p>
                                                </div>
                                            )}
                                            {pExperts && pExperts.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase mr-1 mt-1">Experten:</span>
                                                    {pExperts.map((exp: string, i: number) => (
                                                        <span key={i} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700">
                                                            {exp}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Strategic Research Report Map */}
                                    {pExecSummary && (
                                        <div className="p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-200 dark:border-indigo-500/30">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                                                    Executive Summary
                                                </h3>
                                                {interviewPrep.match_score !== undefined && (
                                                    <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded">
                                                        Score: {interviewPrep.match_score}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-indigo-600 dark:text-indigo-200 leading-relaxed font-medium">
                                                {pExecSummary}
                                            </p>
                                        </div>
                                    )}

                                    {/* Selling Pitch & Connections */}
                                    {(pSellingPitch || pConnections) && (
                                        <div className="space-y-4">
                                            {pSellingPitch && (
                                                <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-md border border-indigo-400/20">
                                                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                                                        <RefreshCw className="w-3.5 h-3.5" />
                                                        Solution Selling Pitch
                                                    </h3>
                                                    <p className="text-indigo-50 text-xs font-medium leading-relaxed italic border-l-2 border-white/30 pl-3 py-0.5">
                                                        {pSellingPitch}
                                                    </p>
                                                </div>
                                            )}
                                            {pConnections && (
                                                <div className="p-3 bg-amber-50 dark:bg-amber-500/5 rounded-xl border border-amber-200 dark:border-amber-500/20">
                                                    <h3 className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">Interdisziplinär</h3>
                                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">
                                                        {pConnections}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {pProblemsToSolve.length > 0 && (
                                        <div className="p-4 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-200 dark:border-rose-500/30">
                                            <h3 className="text-[10px] font-bold text-rose-700 dark:text-rose-300 mb-2 uppercase tracking-wide">
                                                Pain Points
                                            </h3>
                                            <ul className="space-y-2">
                                                {pProblemsToSolve.map((problem: string, i: number) => (
                                                    <li key={i} className="flex gap-2 text-xs text-rose-600 dark:text-rose-200">
                                                        <span className="text-rose-500 flex-shrink-0 font-bold">⚠</span>
                                                        {problem}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {pSuccessFactors.length > 0 && (
                                        <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/30">
                                            <h3 className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mb-2 uppercase tracking-wide">
                                                Erfolgsfaktoren
                                            </h3>
                                            <ul className="space-y-2">
                                                {pSuccessFactors.map((factor: string, i: number) => (
                                                    <li key={i} className="flex gap-2 text-xs text-emerald-600 dark:text-emerald-200">
                                                        <span className="text-emerald-500 flex-shrink-0 font-bold">✓</span>
                                                        {factor}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {pCompAnalysis.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wide">
                                                Gap-Analyse (CV vs. Job)
                                            </h3>
                                            <div className="space-y-3">
                                                {pCompAnalysis.map((item: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-bold text-slate-500 uppercase">{item.category || "Fähigkeit"}</span>
                                                            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${gapSeverityColor(item.gap_evaluation || "")}`}>
                                                                {item.gap_evaluation || "N/A"}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1 text-xs">
                                                            <div>
                                                                <span className="block text-[9px] text-slate-400 mb-0.5 uppercase">Anforderung</span>
                                                                <span className="text-slate-700 dark:text-slate-300 line-clamp-2">{item.job_requirement || item.requirement}</span>
                                                            </div>
                                                            <div>
                                                                <span className="block text-[9px] text-slate-400 mb-0.5 uppercase">Dein Profil</span>
                                                                <span className="text-slate-700 dark:text-slate-300 line-clamp-2">{item.cv_qualification || item.my_story}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {interviewPrep.market_value_jump && (
                                        <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/30">
                                            <h3 className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 mb-1 uppercase tracking-wide">Marktwert</h3>
                                            <p className="text-xs text-emerald-600 dark:text-emerald-200">{interviewPrep.market_value_jump}</p>
                                        </div>
                                    )}
                                </div>
                            ) : interviewQueued || interviewLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Strategische Analyse läuft…</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center text-xl">🧠</div>
                                    <p className="text-slate-500 dark:text-slate-400 text-sm text-center px-6">
                                        Generiere eine tiefgreifende Vorbereitung basierend auf deinem CV und der Stellenbeschreibung.
                                    </p>
                                    <button
                                        onClick={() => {
                                            setInterviewQueued(true);
                                            fetch(`${apiBase}/jobs/${job.id}/interview-prep`, { method: 'POST', credentials: 'include' }).catch(() => { });
                                        }}
                                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-200 dark:shadow-none cursor-pointer"
                                    >
                                        Interview-Analyse starten
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Questions & Tips */}
                        <div className="flex flex-col gap-6">
                            {interviewPrep && (
                                <div className="space-y-6">
                                    {/* Specifications Grid */}
                                    {pSpecs && (
                                        <div className="p-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700/50">
                                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Rahmenbedingungen</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                {pSpecs.industry_focus && (
                                                    <div className="p-2 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Branche</span>
                                                        <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">{pSpecs.industry_focus}</span>
                                                    </div>
                                                )}
                                                {pSpecs.geographic_location && (
                                                    <div className="p-2 bg-white dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Lage</span>
                                                        <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">{pSpecs.geographic_location}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {pPsychQuestions.length > 0 && (
                                        <div>
                                            <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                                                <Brain className="w-4 h-4 text-purple-500" />
                                                Psychologische Fragen & Taktik
                                            </h2>
                                            <div className="space-y-3">
                                                {pPsychQuestions.map((q: any, i: number) => (
                                                    <div key={i} className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                                        <div className="flex gap-2 font-bold text-slate-800 dark:text-slate-100">
                                                            <span className="text-indigo-500">Q:</span>
                                                            {q.question}
                                                        </div>
                                                        <div className="flex gap-2 pl-4 border-l-2 border-emerald-500/20">
                                                            <span className="text-emerald-500 font-bold">A:</span>
                                                            <span className="text-slate-500 dark:text-slate-400 italic">{q.suggested_answer}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {pQForInterviewer.length > 0 && (
                                        <div className="p-4 bg-sky-50 dark:bg-sky-500/10 rounded-xl border border-sky-200 dark:border-sky-500/30">
                                            <h3 className="text-[10px] font-bold text-sky-700 dark:text-sky-300 mb-2 uppercase tracking-wide">
                                                Eigene Rückfragen
                                            </h3>
                                            <ul className="space-y-2">
                                                {pQForInterviewer.map((q: string, i: number) => (
                                                    <li key={i} className="flex gap-2 text-xs text-sky-600 dark:text-sky-200">
                                                        <span className="text-sky-400 font-bold">?</span>
                                                        {q}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {pFullReport && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-3 uppercase tracking-wide flex items-center gap-2">
                                                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                                                Deep Dive Analyse
                                            </h3>
                                            <div className="prose prose-xs dark:prose-invert max-w-none bg-white dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/50 max-h-[300px] overflow-y-auto">
                                                <ReactMarkdown>{pFullReport}</ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* COMPANY */}
                {activeTab === 'company' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* LEFT: Core Analysis */}
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-indigo-500" />
                                    Unternehmensprofil
                                </h2>
                                {companyData && (
                                    <button
                                        onClick={() => {
                                            setCompanyLoading(true);
                                            setCompanyData(null);
                                            fetch(`${apiBase}/companies/${job.company_domain}/analyze`, {
                                                method: 'POST', credentials: 'include',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ force_refresh: true }),
                                            }).then(() => {
                                                setCompanyQueued(true);
                                            }).catch(() => { })
                                                .finally(() => setCompanyLoading(false));
                                        }}
                                        disabled={companyLoading}
                                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 dark:text-slate-400 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${companyLoading ? 'animate-spin' : ''}`} />
                                        Update
                                    </button>
                                )}
                            </div>

                            {companyLoading || companyQueued ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                    <p className="text-slate-500 dark:text-slate-400 text-sm">Company Research läuft…</p>
                                </div>
                            ) : companyData ? (
                                <div className="space-y-6">
                                    {companyData.description && (
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                            {companyData.description}
                                        </div>
                                    )}

                                    {companyData.swot_analysis && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-emerald-50/50 dark:bg-emerald-500/5 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                                                <h4 className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-3 h-3" /> Stärken
                                                </h4>
                                                <ul className="space-y-1">
                                                    {companyData.swot_analysis.strengths.slice(0, 3).map((s: string, i: number) => (
                                                        <li key={i} className="text-[11px] text-emerald-600 dark:text-emerald-300 leading-tight flex gap-1.5">
                                                            <span className="opacity-50 mt-0.5">•</span> {s}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="p-3 bg-rose-50/50 dark:bg-rose-500/5 rounded-xl border border-rose-100 dark:border-rose-500/20">
                                                <h4 className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 mb-2 flex items-center gap-1.5">
                                                    <AlertTriangle className="w-3 h-3" /> Risiken
                                                </h4>
                                                <ul className="space-y-1">
                                                    {companyData.swot_analysis.weaknesses.slice(0, 3).map((w: string, i: number) => (
                                                        <li key={i} className="text-[11px] text-rose-600 dark:text-rose-300 leading-tight flex gap-1.5">
                                                            <span className="opacity-50 mt-0.5">•</span> {w}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )}

                                    {companyData.salary_benchmark && (
                                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <Scale className="w-3.5 h-3.5" /> Gehalts-Benchmark
                                            </h4>
                                            <div className="flex items-end gap-x-6 gap-y-2 flex-wrap">
                                                {companyData.salary_benchmark.min && (
                                                    <div>
                                                        <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Min</span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                            {companyData.salary_benchmark.min.toLocaleString('de-DE')} {companyData.salary_benchmark.currency}
                                                        </span>
                                                    </div>
                                                )}
                                                {companyData.salary_benchmark.max && (
                                                    <div>
                                                        <span className="block text-[9px] text-slate-400 uppercase font-bold mb-0.5">Max</span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                            {companyData.salary_benchmark.max.toLocaleString('de-DE')} {companyData.salary_benchmark.currency}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {companyData.salary_benchmark.is_estimate && (
                                                <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-3 flex items-center gap-1.5 italic font-medium">
                                                    <AlertTriangle className="w-3 h-3" /> Marktschätzung
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                    <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                                    <p className="text-slate-500 dark:text-slate-400 text-sm text-center px-6">
                                        Keine Firmenanalyse vorhanden.
                                    </p>
                                    <button
                                        onClick={() => {
                                            setCompanyQueued(true);
                                            fetch(`${apiBase}/companies/${job.company_domain}/analyze`, {
                                                method: 'POST', credentials: 'include',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ force_refresh: false }),
                                            }).catch(() => { });
                                        }}
                                        className="px-6 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer"
                                    >
                                        Firma jetzt analysieren
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* RIGHT: Culture & Intelligence */}
                        <div className="flex flex-col gap-6">
                            {companyData && (
                                <div className="space-y-6">
                                    {companyData.culture_summary && (
                                        <div className="p-4 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                                            <h4 className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <Users className="w-3.5 h-3.5" /> Kultur & Vibe
                                            </h4>
                                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">
                                                „{companyData.culture_summary}“
                                            </p>
                                        </div>
                                    )}

                                    {companyData.key_artifacts?.length > 0 && (
                                        <div>
                                            <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Key Intelligence</h4>
                                            <div className="space-y-2">
                                                {companyData.key_artifacts.slice(0, 3).map((art: any, i: number) => (
                                                    <div key={i} className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm">
                                                        <h5 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mb-0.5">{art.title}</h5>
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{art.description}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {companyData.comprehensive_report && (
                                        <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 group/report">
                                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                                                <Globe className="w-3.5 h-3.5 text-sky-500" /> Research Report
                                            </h4>
                                            <div className="prose prose-xs dark:prose-invert max-w-none line-clamp-4 text-slate-500 dark:text-slate-400">
                                                <ReactMarkdown>{companyData.comprehensive_report}</ReactMarkdown>
                                            </div>
                                            <button
                                                className="mt-3 text-[10px] font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 opacity-0 group-hover/report:opacity-100 transition-opacity"
                                                onClick={() => {
                                                    // In a modal context this would expand, here we just show the snippet
                                                }}
                                            >
                                                Details im Report lesen <ChevronRight className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* STATUS */}
                {activeTab === 'status' && (() => {
                    const currentIdx = STATUS_PIPELINE.indexOf((job.status as JobStatus) ?? 'OPEN');
                    const isExitStatus = job.status === 'REJECTED' || job.status === 'FAILED';
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
                                                        onClick={() => setActiveTab(item.tabHint as typeof activeTab)}
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
                                    „{guidance.nudge}"
                                </p>
                            </div>

                            {/* Status History */}
                            <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest mb-3">Verlauf</p>
                                {historyLoading ? (
                                    <div className="flex items-center justify-center py-5">
                                        <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                                    </div>
                                ) : history?.length ? (
                                    <div className="space-y-1.5">
                                        {history.map((h: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                                                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                                    {new Date(h.changed_at).toLocaleString('de-DE')}
                                                </span>
                                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                    {h.from_status && (
                                                        <>
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_META[h.from_status]?.pillCls || 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-transparent'}`}>
                                                                {STATUS_META[h.from_status]?.icon}
                                                            </span>
                                                            <span className="text-slate-300 dark:text-slate-600 text-[10px]">→</span>
                                                        </>
                                                    )}
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${STATUS_META[h.to_status]?.pillCls || 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-transparent'}`}>
                                                        {STATUS_META[h.to_status]?.icon} {h.to_status}
                                                    </span>
                                                </div>
                                                {h.note && <span className="text-[10px] text-slate-400 dark:text-slate-500 italic ml-auto truncate max-w-[30%]">{h.note}</span>}
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* 4. STELLENBESCHREIBUNG (collapsible footer) */}
            {job.description && (
                <details className="group border-t border-slate-100 dark:border-slate-800">
                    <summary className="px-4 sm:px-6 py-2.5 text-xs text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none list-none flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <span className="transition-transform duration-200 group-open:rotate-90 inline-block">▶</span>
                        {t('jobDescription') || 'Stellenbeschreibung anzeigen'}
                        <span className="flex-1" />
                        {job.url && (
                            <a href={job.url} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold transition-colors"
                            >
                                <span>↗</span>
                                <span>{t('applySource')}</span>
                            </a>
                        )}
                    </summary>
                    <div className="px-4 sm:px-6 pb-4 pt-3 prose prose-slate dark:prose-invert max-w-none text-sm border-t border-slate-100 dark:border-slate-800/50">
                        <ReactMarkdown>{job.description}</ReactMarkdown>
                    </div>
                </details>
            )}
        </div>
    );
}
