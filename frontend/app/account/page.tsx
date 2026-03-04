"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import ConfirmModal from '../components/ConfirmModal';
import PasswordChangeForm from '../components/PasswordChangeForm';
import { useLanguage } from '../components/LanguageProvider';

export default function Account() {
  const { token, refreshUser } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [status, setStatus] = useState('');
  const [keepFavorites, setKeepFavorites] = useState(true);
  const [keepApplications, setKeepApplications] = useState(true);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'DELETE_JOBS' | 'DELETE_PROFILE' | 'FACTORY_RESET';
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/login');
    }
  }, [router]);

  const executeDeleteJobs = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs?keep_favorites=${keepFavorites}&keep_applications=${keepApplications}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setStatus(`${data.count || 0} jobs deleted.`);
      setTimeout(() => window.location.href = "/", 1000);
    } catch {
      setStatus(t('error'));
    }
  };

  const executeDeleteProfile = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStatus(t('saved'));
      refreshUser();
    } catch {
      setStatus(t('error'));
    }
  };

  const executeFactoryReset = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/reset`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setStatus(t('saved'));
      refreshUser();
      setTimeout(() => window.location.href = "/", 1000);
    } catch {
      setStatus(t('error'));
    }
  };

  const requestDeleteJobs = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setConfirmAction({
      type: 'DELETE_JOBS',
      title: t('deleteAllJobs'),
      message: t('deleteJobsConfirm'),
      action: executeDeleteJobs
    });
  };

  const requestDeleteProfile = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setConfirmAction({
      type: 'DELETE_PROFILE',
      title: t('deleteProfileOnly'),
      message: t('deleteProfileConfirm'),
      action: executeDeleteProfile
    });
  };

  const requestFactoryReset = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setConfirmAction({
      type: 'FACTORY_RESET',
      title: t('factoryReset'),
      message: t('factoryResetConfirm'),
      action: executeFactoryReset
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => { setConfirmAction(null); setKeepFavorites(true); setKeepApplications(true); }}
        onConfirm={() => {
          if (confirmAction) confirmAction.action();
        }}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText={t('confirm')}
        isDestructive
      >
        {confirmAction?.type === 'DELETE_JOBS' && (
          <div className="mt-2 flex flex-col gap-1.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="keepFavoritesCheckbox"
                checked={keepFavorites}
                onChange={(e) => setKeepFavorites(e.target.checked)}
                className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
              />
              <label htmlFor="keepFavoritesCheckbox" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                {t('keepFavorites')}
              </label>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="keepApplicationsCheckbox"
                checked={keepApplications}
                onChange={(e) => setKeepApplications(e.target.checked)}
                className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
              />
              <label htmlFor="keepApplicationsCheckbox" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                {t('keepApplications')}
              </label>
            </div>
          </div>
        )}
      </ConfirmModal>

      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Account</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('security')} &amp; {t('dangerZone')}</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-8">

        {/* SECURITY */}
        <section className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <span>🔒</span> {t('security')}
          </h2>
          <PasswordChangeForm token={token} />
        </section>

        {/* DANGER ZONE */}
        <section className="bg-rose-50/80 dark:bg-rose-500/5 backdrop-blur-xl rounded-2xl border border-rose-200/60 dark:border-rose-500/20 shadow-sm hover:shadow-md transition-all duration-300 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-rose-700 dark:text-rose-400 mb-6 flex items-center gap-2">
            <span>⚠️</span> {t('dangerZone')}
          </h2>
          {status && <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-4">{status}</p>}
          <div className="space-y-3">
            <button
              type="button"
              onClick={requestDeleteJobs}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl font-medium text-sm transition cursor-pointer"
            >
              {t('deleteAllJobs')}
            </button>
            <button
              type="button"
              onClick={requestDeleteProfile}
              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl font-medium text-sm transition cursor-pointer"
            >
              {t('deleteProfileOnly')}
            </button>
            <button
              type="button"
              onClick={requestFactoryReset}
              className="w-full px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm transition cursor-pointer"
            >
              {t('factoryReset')}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
