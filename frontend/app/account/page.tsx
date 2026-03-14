"use client";
import { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import ConfirmModal from '../components/ConfirmModal';
import PageWrapper from '../components/PageWrapper';
import PageHeader from '../components/PageHeader';
import PasswordChangeForm from './components/PasswordChangeForm';
import { useLanguage } from '../components/LanguageProvider';
import { useNotification } from '../components/NotificationProvider';
import { ShieldCheck, AlertTriangle, Trash2, RotateCcw, Lock } from 'lucide-react';
import type { ReactNode } from 'react';

// Reusable Card Component for Premium Look
function AccountCard({ title, subtitle, icon, children, variant = 'default' }: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'danger';
}) {
  const styles = {
    default: {
      card: 'bg-white dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-800/60',
      iconContainer: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
      title: 'text-slate-900 dark:text-white',
    },
    danger: {
      card: 'bg-rose-50/50 dark:bg-rose-500/5 border-rose-200/50 dark:border-rose-500/10',
      iconContainer: 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',
      title: 'text-rose-800 dark:text-rose-400',
    }
  };

  const s = styles[variant];

  return (
    <section className={`rounded-3xl border ${s.card} shadow-sm transition-all duration-300 hover:shadow-md overflow-hidden`}>
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className={`p-3 rounded-2xl ${s.iconContainer}`}>
            {icon}
          </div>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${s.title}`}>{title}</h2>
            {subtitle && <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export default function Account() {
  const { token, refreshUser } = useAuth();
  const { t } = useLanguage();
  const { showError } = useNotification();

  const [status, setStatus] = useState('');
  const [keepFavorites, setKeepFavorites] = useState(true);
  const [keepApplications, setKeepApplications] = useState(true);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'DELETE_JOBS' | 'DELETE_PROFILE' | 'FACTORY_RESET';
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  const executeDeleteJobs = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs?keep_favorites=${keepFavorites}&keep_applications=${keepApplications}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      setStatus(`${data.count || 0} jobs deleted.`);
      setTimeout(() => window.location.href = "/", 1000);
    } catch (e: any) {
      showError(e?.message || t('error'));
    }
  };

  const executeDeleteProfile = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setStatus(t('saved'));
      refreshUser();
    } catch (e: any) {
      showError(e?.message || t('error'));
    }
  };

  const executeFactoryReset = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/reset`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setStatus(t('saved'));
      refreshUser();
      setTimeout(() => window.location.href = "/", 1000);
    } catch (e: any) {
      showError(e?.message || t('error'));
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
    <PageWrapper>
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
          <div className="mt-4 space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="keepFavoritesCheckbox"
                checked={keepFavorites}
                onChange={(e) => setKeepFavorites(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="keepFavoritesCheckbox" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                {t('keepFavorites')}
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="keepApplicationsCheckbox"
                checked={keepApplications}
                onChange={(e) => setKeepApplications(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="keepApplicationsCheckbox" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                {t('keepApplications')}
              </label>
            </div>
          </div>
        )}
      </ConfirmModal>

      <PageHeader
        title="Account"
        subtitle={t('security') + " & " + t('dangerZone')}
      />

      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Account Status Messages */}
        {status && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {status}
          </div>
        )}

        {/* SECURITY */}
        <AccountCard
          title={t('security')}
          subtitle="Passwort & Zugriff"
          icon={<Lock className="w-6 h-6" />}
        >
          <PasswordChangeForm token={token} />
        </AccountCard>

        {/* DANGER ZONE */}
        <AccountCard
          title={t('dangerZone')}
          subtitle="Daten & Konto löschen"
          icon={<AlertTriangle className="w-6 h-6" />}
          variant="danger"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={requestDeleteJobs}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-2xl font-bold text-sm transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              {t('deleteAllJobs')}
            </button>
            <button
              onClick={requestDeleteProfile}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-2xl font-bold text-sm transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              {t('deleteProfileOnly')}
            </button>
            <button
              onClick={requestFactoryReset}
              className="sm:col-span-2 flex items-center justify-center gap-2 px-6 py-5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-rose-500/25 transition-all duration-300 hover:scale-[1.01] active:scale-98 cursor-pointer ring-offset-2 focus:ring-2 ring-rose-500"
            >
              <RotateCcw className="w-5 h-5" />
              {t('factoryReset')}
            </button>
          </div>
          <p className="mt-6 text-center text-xs text-rose-600/60 dark:text-rose-400/40 font-medium">
            Diese Aktionen sind endgültig und können nicht rückgängig gemacht werden.
          </p>
        </AccountCard>
      </div>
    </PageWrapper>
  );
}
