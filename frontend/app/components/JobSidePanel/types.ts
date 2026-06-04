import type { Job } from "../../lib/types";
import type { JobStatus } from "../JobStatusBadge";

export interface JobSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  isGenerating: boolean;
  onGenerate: (job: Job) => void;
  onRegenerate?: (job: Job, notes: string) => Promise<void>;
  onCancelGenerate?: (jobId: string) => Promise<void>;
  onStatusUpdate: (jobId: string, status: JobStatus) => Promise<any>;
  onToggleFavorite: (jobId: string, currentStatus: boolean) => void;
  onUpdateJob?: (jobId: string, payload: Partial<Job>) => Promise<void>;
  onArchive?: (jobId: string) => void;
}

export interface PipelineTabsProps {
  currentStatus: JobStatus;
  onSelect: (status: JobStatus) => void;
}

export interface StepCardProps {
  job: Job;
  isGenerating: boolean;
  onGenerate: (job: Job) => void;
  onStatusUpdate: (jobId: string, status: JobStatus) => Promise<any>;
  onArchive: (jobId: string) => void;
}
