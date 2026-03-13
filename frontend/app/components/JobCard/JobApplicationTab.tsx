import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy, Download, FileText, Loader2 } from 'lucide-react';
import { useLanguage } from '../LanguageProvider';
import type { Job } from '../../lib/types';
import type { JobStatus } from '../JobStatusBadge';

interface JobApplicationTabProps {
    job: Job;
    isGenerating: boolean;
    onGenerate: (job: Job) => void;
    onStatusUpdate: (jobId: string, status: JobStatus) => void;
    apiBase: string;
}

export default function JobApplicationTab({
    job,
    isGenerating,
    onGenerate,
    onStatusUpdate,
    apiBase,
}: JobApplicationTabProps) {
    const { t } = useLanguage();
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
            a.download = `Bewerbung_${job.company.replace(/\\s+/g, '_')}.pdf`;
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

    return (
        <div className="space-y-6">
            {job.application_draft ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">Bewerbungsschreiben</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={handleCopy}
                                className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                <span className="hidden xs:inline">{copied ? 'Kopiert' : (t('copyText') || 'Kopieren')}</span>
                            </button>
                            <button
                                onClick={handleDownload}
                                className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-sm shadow-indigo-500/20 whitespace-nowrap"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>{t('saveAsPdf') || 'PDF'}</span>
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
    );
}
