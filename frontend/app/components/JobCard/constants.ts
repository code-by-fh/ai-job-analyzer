import type { JobStatus } from '../JobStatusBadge';
import type { StatusGuidance } from './types';
import type { TranslationKey } from '../../lib/languages';

export const STATUS_PIPELINE: JobStatus[] = ['OPEN', 'DRAFTED', 'APPLIED', 'INTERVIEW', 'OFFER', 'ACCEPTED'];

export interface StatusMeta { 
    icon: string; 
    label: string; 
    labelKey: TranslationKey;
    pillCls: string; 
    cardBorder: string; 
    stepDone: string; 
    stepActive: string; 
    connectorCls: string; 
}

export const STATUS_META: Record<string, StatusMeta> = {
    OPEN: { 
        icon: 'Search', 
        label: 'Open', 
        labelKey: 'statusOpen',
        pillCls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600', 
        cardBorder: '', 
        stepDone: 'bg-slate-400 border-slate-400 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-400 text-slate-700 dark:text-slate-200 ring-2 ring-slate-300 dark:ring-slate-600 shadow-lg', 
        connectorCls: 'bg-slate-400 dark:bg-slate-500' 
    },
    DRAFTED: { 
        icon: 'FileText', 
        label: 'Draft', 
        labelKey: 'statusDrafted',
        pillCls: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30', 
        cardBorder: 'border-indigo-200 dark:border-indigo-700/50', 
        stepDone: 'bg-indigo-500 border-indigo-500 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-300 dark:ring-indigo-500/50 shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20', 
        connectorCls: 'bg-indigo-400' 
    },
    APPLIED: { 
        icon: 'Mail', 
        label: 'Applied', 
        labelKey: 'statusApplied',
        pillCls: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30', 
        cardBorder: 'border-blue-200 dark:border-blue-700/50', 
        stepDone: 'bg-blue-500 border-blue-500 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-300 dark:ring-blue-500/50 shadow-lg shadow-blue-100 dark:shadow-blue-900/20', 
        connectorCls: 'bg-blue-400' 
    },
    INTERVIEW: { 
        icon: 'Handshake', 
        label: 'Interview', 
        labelKey: 'statusInterview',
        pillCls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30', 
        cardBorder: 'border-amber-200 dark:border-amber-600/50', 
        stepDone: 'bg-amber-500 border-amber-500 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-amber-500 text-amber-700 dark:text-amber-300 ring-2 ring-amber-300 dark:ring-amber-500/50 shadow-lg shadow-amber-100 dark:shadow-amber-900/20', 
        connectorCls: 'bg-amber-400' 
    },
    OFFER: { 
        icon: 'Trophy', 
        label: 'Offer', 
        labelKey: 'statusOffer',
        pillCls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30', 
        cardBorder: 'border-emerald-300 dark:border-emerald-600/50 shadow-emerald-50 dark:shadow-emerald-900/20', 
        stepDone: 'bg-emerald-500 border-emerald-500 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-emerald-500 text-emerald-700 dark:text-indigo-300 ring-2 ring-emerald-300 dark:ring-emerald-500/50 shadow-lg shadow-emerald-100 dark:shadow-emerald-900/20', 
        connectorCls: 'bg-emerald-400' 
    },
    ACCEPTED: { 
        icon: 'PartyPopper', 
        label: 'Accepted', 
        labelKey: 'statusAccepted',
        pillCls: 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-500/30', 
        cardBorder: 'border-teal-300 dark:border-teal-500/60 shadow-lg shadow-teal-50 dark:shadow-teal-900/30', 
        stepDone: 'bg-teal-500 border-teal-500 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-teal-500 text-teal-700 dark:text-teal-300 ring-2 ring-teal-300 dark:ring-teal-500/50 shadow-lg shadow-teal-100 dark:shadow-teal-900/20', 
        connectorCls: 'bg-teal-400' 
    },
    REJECTED: { 
        icon: 'XCircle', 
        label: 'Rejected', 
        labelKey: 'statusRejected',
        pillCls: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30', 
        cardBorder: 'border-rose-200 dark:border-rose-800/40', 
        stepDone: 'bg-rose-500 border-rose-500 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-rose-500 text-rose-700 dark:text-rose-300 ring-2 ring-rose-300 dark:ring-rose-500/50 shadow-lg', 
        connectorCls: 'bg-rose-400' 
    },
    FAILED: { 
        icon: 'AlertTriangle', 
        label: 'Error', 
        labelKey: 'failedRetry',
        pillCls: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30', 
        cardBorder: 'border-rose-200 dark:border-rose-800/40', 
        stepDone: 'bg-rose-400 border-rose-400 text-white', 
        stepActive: 'bg-white dark:bg-slate-900 border-rose-400 text-rose-700 dark:text-rose-300 ring-2 ring-rose-300 dark:ring-rose-500/50 shadow-lg', 
        connectorCls: 'bg-rose-400' 
    },
    GENERATING: { 
        icon: 'Loader2', 
        label: 'Loading...', 
        labelKey: 'processing',
        pillCls: 'bg-indigo-600 text-white border-indigo-500 animate-pulse', 
        cardBorder: '', 
        stepDone: '', 
        stepActive: '', 
        connectorCls: '' 
    },
};


export const STATUS_GUIDANCE: Record<string, StatusGuidance> = {
    OPEN: {
        bgCls: 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50',
        accentCls: 'text-slate-500 dark:text-slate-400',
        nextAction: 'Check the job and decide if you want to apply.',
        nextActionKey: 'guidanceOpenNext',
        items: [
            { text: 'Read AI analysis (Overview tab)', textKey: 'guidanceOpenItem1', tabHint: 'overview' },
            { text: 'Read job description completely', textKey: 'guidanceOpenItem2' },
            { text: 'Short research on the company', textKey: 'guidanceOpenItem3', tabHint: 'company' },
            { text: 'Start application draft', textKey: 'guidanceOpenItem4', tabHint: 'application' },
        ],
        nudge: 'Every process starts with an honest self-assessment.',
        nudgeKey: 'guidanceOpenNudge',
    },
    DRAFTED: {
        bgCls: 'bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/20',
        accentCls: 'text-indigo-600 dark:text-indigo-400',
        nextAction: 'Review your application draft and send it.',
        nextActionKey: 'guidanceDraftedNext',
        items: [
            { id: 'has_draft', text: 'Application draft generated', textKey: 'guidanceDraftedItem1', tabHint: 'application' },
            { text: 'Check draft for completeness and tone', textKey: 'guidanceDraftedItem2' },
            { text: 'Personalize cover letter (name, job reference)', textKey: 'guidanceDraftedItem3' },
            { text: 'Send documents / fill out form', textKey: 'guidanceDraftedItem4' },
        ],
        nudge: 'Perfect is the enemy of good — send it now.',
        nudgeKey: 'guidanceDraftedNudge',
    },
    APPLIED: {
        bgCls: 'bg-blue-50/50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20',
        accentCls: 'text-blue-600 dark:text-blue-400',
        nextAction: 'Document your application and plan your follow-up.',
        nextActionKey: 'guidanceAppliedNext',
        items: [
            { text: 'Received or checked application confirmation', textKey: 'guidanceAppliedItem1' },
            { id: 'has_followup', text: 'Follow-up date set', textKey: 'guidanceAppliedItem2' },
            { id: 'has_prep', text: 'Interview prep prepared', textKey: 'guidanceAppliedItem3', tabHint: 'interview' },
            { text: 'Patience: feedback time is often 2–4 weeks', textKey: 'guidanceAppliedItem4' },
        ],
        nudge: 'You applied — that was the hardest step.',
        nudgeKey: 'guidanceAppliedNudge',
    },
    INTERVIEW: {
        bgCls: 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20',
        accentCls: 'text-amber-600 dark:text-amber-400',
        nextAction: 'Prepare intensively for the interview.',
        nextActionKey: 'guidanceInterviewNext',
        items: [
            { id: 'has_prep', text: 'Interview prep material generated', textKey: 'guidanceInterviewItem1', tabHint: 'interview' },
            { text: '3 own strength examples (STAR method) prepared', textKey: 'guidanceInterviewItem2' },
            { text: 'Questions for the company prepared', textKey: 'guidanceInterviewItem3' },
            { text: 'Logistics cleared (location, time, contact, video link)', textKey: 'guidanceInterviewItem4' },
        ],
        nudge: 'Preparation is the difference between luck and skill.',
        nudgeKey: 'guidanceInterviewNudge',
    },
    OFFER: {
        bgCls: 'bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20',
        accentCls: 'text-emerald-600 dark:text-emerald-400',
        nextAction: 'Analyze the offer carefully before you respond.',
        nextActionKey: 'guidanceOfferNext',
        items: [
            { text: 'Check conditions (salary, vacation, remote share)', textKey: 'guidanceOfferItem1' },
            { text: 'Compared salary benchmark', textKey: 'guidanceOfferItem2', tabHint: 'company' },
            { text: 'Identified negotiation room', textKey: 'guidanceOfferItem3' },
            { text: 'Take 48h to think (professional & common)', textKey: 'guidanceOfferItem4' },
        ],
        nudge: 'An offer is an invitation to talk, not an ultimatum.',
        nudgeKey: 'guidanceOfferNudge',
    },
    ACCEPTED: {
        bgCls: 'bg-teal-50/50 dark:bg-teal-500/5 border-teal-200 dark:border-teal-500/20',
        accentCls: 'text-teal-600 dark:text-teal-400',
        nextAction: 'Congratulations! Prepare your start.',
        nextActionKey: 'guidanceAcceptedNext',
        items: [
            { text: 'Written contract received and checked', textKey: 'guidanceAcceptedItem1' },
            { text: 'Confirmed start date and onboarding info', textKey: 'guidanceAcceptedItem2' },
            { text: 'Politely declined all other applications', textKey: 'guidanceAcceptedItem3' },
            { text: 'Archived open positions here', textKey: 'guidanceAcceptedItem4' },
        ],
        nudge: 'You did it. Now the next chapter begins.',
        nudgeKey: 'guidanceAcceptedNudge',
    },
    REJECTED: {
        bgCls: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20',
        accentCls: 'text-rose-600 dark:text-rose-400',
        nextAction: 'Get feedback and draw learning from the process.',
        nextActionKey: 'guidanceRejectedNext',
        items: [
            { text: 'Read rejection letter carefully', textKey: 'guidanceRejectedItem1' },
            { text: 'Request feedback (for personal contacts)', textKey: 'guidanceRejectedItem2' },
            { text: 'Adjusted application documents for next round', textKey: 'guidanceRejectedItem3' },
            { text: 'Identify next suitable position', textKey: 'guidanceRejectedItem4' },
        ],
        nudge: 'A rejection shows you which door fits better.',
        nudgeKey: 'guidanceRejectedNudge',
    },
    FAILED: {
        bgCls: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20',
        accentCls: 'text-rose-500 dark:text-rose-400',
        nextAction: 'Check if there is a technical problem and start again.',
        nextActionKey: 'guidanceFailedNext',
        items: [
            { text: 'Read error message in overview', textKey: 'guidanceFailedItem1' },
            { text: 'Check application draft manually', textKey: 'guidanceFailedItem2' },
            { text: 'Tried to regenerate', textKey: 'guidanceFailedItem3', tabHint: 'application' },
            { text: 'Contact support if problem persists', textKey: 'guidanceFailedItem4' },
        ],
        nudge: 'Sometimes it hooks technically — no setback, but a hint.',
        nudgeKey: 'guidanceFailedNudge',
    },
};

