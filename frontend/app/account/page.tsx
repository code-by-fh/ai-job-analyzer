"use client";
import { useState } from 'react';
import { useAuth, fetchWithAuth } from '../components/AuthProvider';
import ConfirmModal from '../components/ConfirmModal';
import PageWrapper from '../components/PageWrapper';
import PageHeader from '../components/PageHeader';
import PasswordChangeForm from './components/PasswordChangeForm';
import PasswordInput from '../components/PasswordInput';
import { useLanguage } from '../components/LanguageProvider';
import { useNotification } from '../components/NotificationProvider';
import { ShieldCheck, AlertTriangle, Trash2, RotateCcw, Lock } from 'lucide-react';
import type { ReactNode } from 'react';

// Reusable Card Component for Premium Look
function AccountCard({ title, subtitle, icon, children, variant = 'default', className = "" }: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'danger';
  className?: string;
}) {
  const isDanger = variant === 'danger';
  
  return (
    <section className={`relative z-10 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border ${isDanger ? 'border-rose-200 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800'} ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        {icon && <div className={isDanger ? 'text-rose-500' : 'text-indigo-500'}>{icon}</div>}
        <div>
          <h3 className={`text-lg font-bold ${isDanger ? 'text-rose-600 dark:text-rose-50' : 'text-slate-800 dark:text-slate-100'}`}>{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium uppercase tracking-wider">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-4">
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
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');

  const [confirmAction, setConfirmAction] = useState<{
    type: 'DELETE_JOBS' | 'DELETE_PROFILE' | 'FACTORY_RESET';
    title: string;
    message: string;
  } | null>(null);

  const executeDeleteJobs = async () => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/jobs?keep_favorites=${keepFavorites}&keep_applications=${keepApplications}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      setStatus(t('jobsDeletedCount', { count: data.count || 0 }));
      setTimeout(() => window.location.href = "/", 1000);
    } catch (e: any) {
      showError(e?.message || t('error'));
    }
  };

  const executeDeleteProfile = async () => {
    try {
      await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'DELETE',
      });
      setStatus(t('saved'));
      refreshUser();
    } catch (e: any) {
      showError(e?.message || t('error'));
    }
  };

  const executeFactoryReset = async () => {
    setResetPasswordError('');
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/user/reset`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 400) {
          setResetPasswordError(t('incorrectPassword'));
          return;
        }
        throw new Error(data.detail || t('error'));
      }
      setResetPassword('');
      setConfirmAction(null);
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
    });
  };

  const requestDeleteProfile = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setConfirmAction({
      type: 'DELETE_PROFILE',
      title: t('deleteProfileOnly'),
      message: t('deleteProfileConfirm'),
    });
  };

  const requestFactoryReset = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setConfirmAction({
      type: 'FACTORY_RESET',
      title: t('factoryReset'),
      message: t('factoryResetConfirm'),
    });
  };

  return (
    <PageWrapper>
      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => { setConfirmAction(null); setKeepFavorites(true); setKeepApplications(true); setResetPassword(''); setResetPasswordError(''); }}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.type === 'DELETE_JOBS') executeDeleteJobs();
          else if (confirmAction.type === 'DELETE_PROFILE') executeDeleteProfile();
          else if (confirmAction.type === 'FACTORY_RESET') executeFactoryReset();
        }}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText={t('confirm')}
        confirmDisabled={confirmAction?.type === 'FACTORY_RESET' && !resetPassword}
        keepOpenOnConfirm={confirmAction?.type === 'FACTORY_RESET'}
        isDestructive
      >
        {confirmAction?.type === 'FACTORY_RESET' && (
          <div className="mt-4 space-y-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {t('enterPasswordToConfirm')}
            </label>
            <PasswordInput
              placeholder="••••••••"
              value={resetPassword}
              onChange={e => { setResetPassword(e.target.value); setResetPasswordError(''); }}
              className="font-mono text-sm"
            />
            {resetPasswordError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{resetPasswordError}</p>
            )}
          </div>
        )}
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
        title={t('account')}
        subtitle={t('accountDescription')}
      />

      {/* Account Status Messages */}
      {status && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          {status}
        </div>
      )}

      {/* SECURITY */}
      <AccountCard
        title={t('security')}
        subtitle={t('passwordAndAccess')}
        icon={<Lock className="w-5 h-5 text-indigo-500" />}
      >
        <PasswordChangeForm token={token} />
      </AccountCard>

      {/* DANGER ZONE */}
      <AccountCard
        title={t('dangerZone')}
        subtitle={t('deleteDataAndAccount')}
        icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
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
        <p className="mt-6 text-center text-xs text-rose-600/60 dark:text-rose-400/40 font-medium font-mono uppercase tracking-wider">
          {t('actionsFinalWarning')}
        </p>
      </AccountCard>

    </PageWrapper>
  );
}
