import { TranslationKey } from '../../lib/languages';
import { Job } from '../../lib/types';
import type { JobStatus } from '../JobStatusBadge';

export interface GuidanceItem {
    id?: 'has_draft' | 'has_followup' | 'has_prep';
    text: string;
    textKey: TranslationKey;
    done?: boolean;
    tabHint?: 'overview' | 'application' | 'interview' | 'company' | 'status';
    linkHint?: string;
    descHint?: boolean;
}

export interface StatusGuidance {
    bgCls: string;
    accentCls: string;
    nextAction: string;
    nextActionKey: TranslationKey;
    items: GuidanceItem[];
    nudge: string;
    nudgeKey: TranslationKey;
}

export interface JobCardProps {
    job: Job;
    isGenerating: boolean;
    onGenerate: (job: Job) => void;
    onRegenerate?: (job: Job, notes: string) => Promise<void>;
    onCancelGenerate?: (jobId: string) => Promise<void>;
    onStatusUpdate: (jobId: string, status: JobStatus) => void;
    onToggleFavorite: (jobId: string, currentStatus: boolean) => void;
    isSelected?: boolean;
    onSelect?: (jobId: string, selected: boolean) => void;
    onUpdateJob?: (jobId: string, payload: Partial<Job>) => Promise<void>;
    onArchive?: (jobId: string) => void;
    apiBase?: string;
    isModal?: boolean;
}

export type TabType = 'overview' | 'application' | 'interview' | 'company' | 'status' | 'documents' | null;
