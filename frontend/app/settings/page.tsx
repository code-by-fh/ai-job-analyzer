"use client";
import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import PasswordInput from '../components/PasswordInput';
import PageWrapper from '../components/PageWrapper';
import PageHeader from '../components/PageHeader';
import { useLanguage } from '../components/LanguageProvider';
import { useNotification } from '../components/NotificationProvider';
import { logger } from '../lib/logger';
import { Bell, Mail, Smartphone, Save, ExternalLink, Info, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';

// Reusable Card Component for Premium Look
function SettingsCard({ title, subtitle, icon, children, footer }: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            {icon}
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800/50">
          {footer}
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { user, token } = useAuth();
  const { t } = useLanguage();
  const { showError } = useNotification();

  const [formData, setFormData] = useState({
    gmail_address: '',
    gmail_app_password: '',
    pushover_user_key: '',
    pushover_api_token: '',
  });
  const [savedData, setSavedData] = useState({
    gmail_address: '',
    gmail_app_password: '',
    pushover_user_key: '',
    pushover_api_token: '',
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          const profileData = data.profile || {};
          const loadedData = {
            gmail_address: profileData.gmail_address || '',
            gmail_app_password: profileData.gmail_app_password || '',
            pushover_user_key: profileData.pushover_user_key || '',
            pushover_api_token: profileData.pushover_api_token || '',
          };
          setFormData(loadedData);
          setSavedData(loadedData);
          setLoading(false);
        })
        .catch(e => { logger.error({ err: e }, "Settings load error"); showError(`GET /settings-view fehlgeschlagen: ${e?.message || e}`); setLoading(false); });
    }
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(t('saving'));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notification-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      setSavedData(formData);
      setStatus(t('saved'));
      setTimeout(() => setStatus(''), 2500);
    } catch (e: any) {
      showError(e?.message || t('error'));
      setStatus(t('error'));
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t('loading')}...</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader title={t('settings') || 'Settings'} subtitle={t('notificationsSubtitle')} />

      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <SettingsCard
          title={t('notifications')}
          subtitle="Zustellungs-Methoden"
          icon={<Bell className="w-6 h-6" />}
          footer={
            <div className="flex flex-col sm:flex-row sm:justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                {status === t('saved') ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-bold bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4" />
                    {status}
                  </span>
                ) : status === t('saving') ? (
                  <span className="text-indigo-600 dark:text-indigo-400 text-sm font-bold animate-pulse">{status}...</span>
                ) : status === t('error') ? (
                  <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-sm font-bold">
                    <ShieldAlert className="w-4 h-4" />
                    {status}
                  </span>
                ) : null}
              </div>
              <button
                onClick={handleSubmit}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-white text-white dark:hover:text-slate-900 px-8 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all duration-300 hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {t('saveChanges')}
              </button>
            </div>
          }
        >
          <div className="mb-8 p-4 bg-indigo-50/30 dark:bg-indigo-500/5 rounded-2xl border border-indigo-100/50 dark:border-indigo-500/10 flex gap-4">
            <div className="p-2 bg-white dark:bg-slate-800 rounded-xl h-fit shadow-sm">
              <Info className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Konfiguriere hier deine Benachrichtigungs-Verschlüsselung. Die Aktivierung der Plattformen erfolgt individuell auf dem Dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* GMAIL ADAPTER */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
              <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-100 dark:border-slate-700">
                      <Mail className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">Gmail</h3>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Email Service</p>
                    </div>
                  </div>
                  {formData.gmail_address && formData.gmail_app_password ? (
                    <div className="p-1 px-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-full flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase">Aktiv</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-black text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-full uppercase">Inaktiv</span>
                  )}
                </div>

                <div className="p-4 bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Wichtiger Sicherheitshinweis
                  </div>
                  <p className="text-xs text-amber-800/80 dark:text-amber-300/60 leading-relaxed">
                    Verwende ausschließlich ein <b>App-Passwort</b>. Dein normales Google-Passwort wird aus Sicherheitsgründen abgelehnt.
                  </p>
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" className="flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 transition-colors w-fit">
                    App-Passwort erstellen
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Email Adresse</label>
                    <input
                      name="gmail_address"
                      value={formData.gmail_address}
                      onChange={handleChange}
                      className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
                      placeholder="dein-name@gmail.com"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">App Passwort</label>
                    <PasswordInput
                      name="gmail_app_password"
                      value={formData.gmail_app_password}
                      onChange={handleChange}
                      placeholder="xxxx xxxx xxxx xxxx"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* PUSHOVER ADAPTER */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 rounded-3xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
              <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 space-y-5 transition-all duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-100 dark:border-slate-700">
                      <Smartphone className="w-5 h-5 text-sky-500" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">Pushover</h3>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Push Notifications</p>
                    </div>
                  </div>
                  {formData.pushover_user_key && formData.pushover_api_token ? (
                    <div className="p-1 px-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-full flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                      <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase">Aktiv</span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-black text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-full uppercase">Inaktiv</span>
                  )}
                </div>

                <div className="p-4 bg-sky-50/50 dark:bg-sky-500/5 border border-sky-100 dark:border-sky-500/10 rounded-2xl flex items-center justify-between">
                  <span className="text-xs text-sky-800/80 dark:text-sky-300/60 font-medium">Hol dir deine Keys auf Pushover.net</span>
                  <a href="https://pushover.net/" target="_blank" className="p-2 bg-white dark:bg-slate-800 rounded-lg text-sky-600 hover:text-sky-700 transition shadow-sm border border-sky-100/50 dark:border-sky-800">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">User Key</label>
                    <PasswordInput
                      name="pushover_user_key"
                      value={formData.pushover_user_key}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">API Token</label>
                    <PasswordInput
                      name="pushover_api_token"
                      value={formData.pushover_api_token}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SettingsCard>
      </div>
    </PageWrapper>
  );
}
