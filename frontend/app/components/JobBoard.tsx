import { useState, DragEvent } from 'react';
import { Job } from '../lib/types';
import BoardJobCard from './JobCard/BoardJobCard';
import { STATUS_META, STATUS_PIPELINE } from './JobCard/constants';
import { useLanguage } from './LanguageProvider';
import * as LucideIcons from 'lucide-react';
import { JobStatus } from './JobStatusBadge';

const DynamicIcon = ({ name, className }: { name: string; className?: string }) => {
    const IconComponent = (LucideIcons as any)[name];
    if (!IconComponent) return null;
    return <IconComponent className={className} />;
};

interface JobBoardProps {
    jobs: Job[];
    onStatusUpdate: (jobId: string, newStatus: JobStatus) => Promise<any>;
    onArchive?: (jobId: string) => void;
    onOpenDetail?: (job: Job) => void;
    statusCounts?: Record<string, number>;
}

// Columns to render (Pipeline + other statuses)
const BOARD_COLUMNS: (JobStatus | 'ARCHIVE')[] = [
    'OPEN', 'DRAFTED', 'APPLIED', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED', 'ARCHIVE'
];

export default function JobBoard({ jobs, onStatusUpdate, onArchive, onOpenDetail, statusCounts }: JobBoardProps) {
    const { t } = useLanguage();
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    const handleDragOver = (e: DragEvent<HTMLDivElement>, status: JobStatus | 'ARCHIVE') => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverColumn !== status) {
            setDragOverColumn(status);
        }
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOverColumn(null);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>, newStatus: JobStatus | 'ARCHIVE') => {
        e.preventDefault();
        setDragOverColumn(null);
        
        const jobId = e.dataTransfer.getData('text/plain');
        if (!jobId) return;

        const job = jobs.find(j => j.id === jobId);
        if (job) {
            if (newStatus === 'ARCHIVE') {
                if (onArchive) onArchive(jobId);
            } else if (job.status !== newStatus) {
                onStatusUpdate(jobId, newStatus as JobStatus);
            }
        }
    };

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6 w-full">
                {BOARD_COLUMNS.map(status => {
                    const meta = STATUS_META[status];
                    if (!meta) return null;
                    
                    const columnJobs = jobs.filter(j => (j.status || 'OPEN') === status);
                    const isDragOver = dragOverColumn === status;
                    const isArchive = status === 'ARCHIVE';
                    const displayCount = (statusCounts && statusCounts[status] !== undefined) ? statusCounts[status] : columnJobs.length;

                    return (
                        <div 
                            key={status}
                            className={`
                                flex flex-col h-full rounded-2xl border transition-all duration-200
                                ${isDragOver 
                                    ? 'border-indigo-400 dark:border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-900/10 scale-[1.01] shadow-lg' 
                                    : isArchive
                                        ? 'border-slate-300 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-900/10 border-dashed'
                                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/20'
                                }
                            `}
                            onDragOver={(e) => handleDragOver(e, status)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, status)}
                        >
                            {/* Column Header */}
                            <div className={`
                                flex items-center justify-between p-3 border-b 
                                ${isArchive ? 'border-dashed border-slate-300 dark:border-slate-700' : 'border-slate-200/60 dark:border-slate-800/60'}
                            `}>
                                <div className="flex items-center gap-2">
                                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm ${meta.pillCls}`}>
                                        <DynamicIcon name={meta.icon} className="w-4 h-4" />
                                    </span>
                                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                        {t(meta.labelKey) || meta.label}
                                    </h3>
                                </div>
                                {!isArchive && (
                                    <span className="text-xs font-bold bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                        {displayCount}
                                    </span>
                                )}
                            </div>

                            {/* Column Content */}
                            <div className="flex-1 p-3 overflow-y-auto space-y-3 min-h-[150px] flex flex-col">
                                {isArchive ? (
                                    <div className={`
                                        flex-1 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed
                                        transition-all duration-300
                                        ${isDragOver 
                                            ? 'border-indigo-400 bg-white dark:bg-slate-800 shadow-inner' 
                                            : 'border-slate-200 dark:border-slate-800 bg-white/30 dark:bg-slate-900/30'
                                        }
                                    `}>
                                        <div className={`text-4xl font-extrabold ${isDragOver ? 'text-indigo-500 scale-125 animate-pulse' : 'text-slate-400 dark:text-slate-600'}`}>
                                            {displayCount}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                                {t('archived' as any) || 'Archived'}
                                            </p>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                                {isDragOver ? (t('dropToArchive' as any) || 'Release to Archive') : (t('dragToArchive' as any) || 'Drag jobs here')}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {columnJobs.map(job => (
                                            <BoardJobCard 
                                                key={job.id} 
                                                job={job} 
                                                onClick={() => onOpenDetail && onOpenDetail(job)} 
                                            />
                                        ))}
                                        
                                        {columnJobs.length === 0 && (
                                            <div className="h-full min-h-[120px] flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 dark:text-slate-500 text-xs font-medium bg-white/40 dark:bg-slate-900/40">
                                                {t('dragDropHere' as any) || 'Drop jobs here'}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
