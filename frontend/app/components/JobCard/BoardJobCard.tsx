import { DragEvent } from 'react';
import { Job } from '../../lib/types';
import { STATUS_META } from './constants';
import { useLanguage } from '../LanguageProvider';
import * as LucideIcons from 'lucide-react';

const DynamicIcon = ({ name, className }: { name: string; className?: string }) => {
    const IconComponent = (LucideIcons as any)[name];
    if (!IconComponent) return null;
    return <IconComponent className={className} />;
};

interface BoardJobCardProps {
    job: Job;
    onClick: () => void;
}

export default function BoardJobCard({ job, onClick }: BoardJobCardProps) {
    const { t } = useLanguage();
    
    const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('text/plain', job.id);
        e.dataTransfer.effectAllowed = 'move';
        
        // Add a class for visual feedback during drag
        setTimeout(() => {
            const target = e.target as HTMLElement;
            target.classList.add('opacity-50');
        }, 0);
    };

    const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        target.classList.remove('opacity-50');
    };

    const statusMeta = STATUS_META[job.status || 'OPEN'] ?? STATUS_META['OPEN'];
    
    // Fallback logic for translation keys
    const matchScoreStr = job.match_score ? `${Math.round(job.match_score)}%` : '--';

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={onClick}
            className={`
                group relative bg-white dark:bg-slate-900 
                border rounded-xl p-3 cursor-grab active:cursor-grabbing
                shadow-sm hover:shadow-md transition-all duration-200
                ${job.status === 'GENERATING' ? 'animate-pulse' : ''}
                ${statusMeta.cardBorder || 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}
            `}
        >
            <div className="flex justify-between items-start gap-2 mb-2">
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight" title={job.title}>
                    {job.title}
                </h4>
                {job.is_favorite && (
                    <LucideIcons.Star className="w-4 h-4 text-amber-500 fill-amber-500 flex-shrink-0" />
                )}
            </div>
            
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 truncate mb-3" title={job.company}>
                {job.company} {job.company_domain ? `(${job.company_domain})` : ''}
            </p>

            <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    (job.match_score || 0) >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                    (job.match_score || 0) >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                    Score: {matchScoreStr}
                </span>

                <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-medium text-slate-500">
                        {statusMeta ? (t(statusMeta.labelKey) || statusMeta.label) : (job.status || 'OPEN')}
                    </span>
                    {statusMeta && <DynamicIcon name={statusMeta.icon} className={`w-3.5 h-3.5 ${statusMeta.pillCls.split(' ')[1]}`} />}
                </div>
            </div>
        </div>
    );
}
