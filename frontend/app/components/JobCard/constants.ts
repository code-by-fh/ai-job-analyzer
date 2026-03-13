import type { JobStatus } from '../JobStatusBadge';
import type { StatusGuidance } from './types';

export const STATUS_PIPELINE: JobStatus[] = ['OPEN', 'DRAFTED', 'APPLIED', 'INTERVIEW', 'OFFER', 'ACCEPTED'];

export interface StatusMeta { icon: string; label: string; pillCls: string; cardBorder: string; stepDone: string; stepActive: string; connectorCls: string; }

export const STATUS_META: Record<string, StatusMeta> = {
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

export const STATUS_GUIDANCE: Record<string, StatusGuidance> = {
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
