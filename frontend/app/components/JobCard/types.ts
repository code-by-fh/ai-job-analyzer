import { Job } from '../../lib/types';
import type { JobStatus } from '../JobStatusBadge';

export interface GuidanceItem {
    id?: 'has_draft' | 'has_followup' | 'has_prep';
    text: string;
    done?: boolean;
    tabHint?: 'overview' | 'application' | 'interview' | 'company' | 'status';
}

export interface StatusGuidance {
    bgCls: string;
    accentCls: string;
    nextAction: string;
    items: GuidanceItem[];
    nudge: string;
}

export interface JobCardProps {
    job: Job;
    isGenerating: boolean;
    onGenerate: (job: Job) => void;
    onStatusUpdate: (jobId: string, status: JobStatus) => void;
    onToggleFavorite: (jobId: string, currentStatus: boolean) => void;
    isSelected?: boolean;
    onSelect?: (jobId: string, selected: boolean) => void;
    onUpdateJob?: (jobId: string, payload: Partial<Job>) => Promise<void>;
    apiBase?: string;
}

export type TabType = 'overview' | 'application' | 'interview' | 'company' | 'status' | 'documents' | null;
