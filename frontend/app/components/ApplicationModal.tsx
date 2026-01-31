import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from './LanguageProvider';
import ConfirmModal from './ConfirmModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  jobId: string;
  currentStatus: string;
  onStatusUpdate: (jobId: string, newStatus: any) => void;
  token: string | null;
}

export default function ApplicationModal({ isOpen, onClose, content, jobId, currentStatus, onStatusUpdate, token }: Props) {
  const { t } = useLanguage();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    alert(t('copiedToClipboard'));
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error(t('downloadFailed'));

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bewerbung.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      if (currentStatus === 'OPEN' || currentStatus === 'DRAFTED' || !currentStatus) {
        onStatusUpdate(jobId, 'APPLIED');
      }
    } catch (e) {
      setErrorMessage(t('pdfDownloadError'));
      console.error(e);
    }
  };

  return (
    <>
      <ConfirmModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        onConfirm={() => setErrorMessage(null)}
        title={t('error')}
        message={errorMessage || ''}
        confirmText="OK"
        isDestructive={false}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl dark:shadow-[0_0_40px_rgba(0,0,0,0.6)] w-full max-w-3xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200 border border-slate-100 dark:border-slate-800">

          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 rounded-t-xl">
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">📝 {t('applicationPreview')}</h3>
            <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none cursor-pointer transition-colors">&times;</button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-12 bg-white dark:bg-slate-900">
            <div className="prose prose-slate dark:prose-invert max-w-none prose-p:text-slate-800 dark:prose-p:text-slate-300 prose-headings:text-slate-900 dark:prose-headings:text-slate-100 font-serif">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end bg-slate-50 dark:bg-slate-950/50 rounded-b-xl">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg font-medium cursor-pointer transition-colors">
              {t('close')}
            </button>

            <button onClick={handleCopy} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg font-medium cursor-pointer transition-colors">
              📋 {t('copyText')}
            </button>

            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-500 dark:hover:bg-indigo-500 rounded-lg shadow-sm dark:shadow-indigo-500/30 transition font-medium flex items-center gap-2 cursor-pointer"
            >
              📄 {t('saveAsPdf')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
