"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import PasswordInput from '../components/PasswordInput';
import { useLanguage } from '../components/LanguageProvider';

export default function Settings() {
  const { user, token } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

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
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/login');
      return;
    }

    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`, {
        headers: { 'Authorization': `Bearer ${token}` }
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
        .catch(e => { console.error(e); setLoading(false); });
    }
  }, [token, router]);

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
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      setSavedData(formData);
      setStatus(t('saved'));
      setTimeout(() => setStatus(''), 2000);
    } catch {
      setStatus(t('error'));
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500 animate-pulse">{t('loading')}</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('settings')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('notificationsSubtitle')}</p>
        </div>
      </div>

      <div className="space-y-8">

        {/* NOTIFICATION SETTINGS */}
        <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <span>🔔</span> {t('notifications')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Configure your notification adapters here. Per-platform activation is done in the Job Platforms section on the Dashboard.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GMAIL CARD */}
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📧</span>
                  <span className="font-bold text-slate-800 dark:text-white">Gmail</span>
                </div>
                {formData.gmail_address && formData.gmail_app_password ? (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded-full">Configured</span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">Not set</span>
                )}
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg text-xs text-amber-800 dark:text-amber-200">
                Use an <b>App Password</b>, not your login password.{' '}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" className="underline font-bold">Create one here</a>.
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">Gmail Address</label>
                <input
                  name="gmail_address"
                  value={formData.gmail_address}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="example@gmail.com"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">App Password</label>
                <PasswordInput
                  name="gmail_app_password"
                  value={formData.gmail_app_password}
                  onChange={handleChange}
                  placeholder="xxxx xxxx xxxx xxxx"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {/* PUSHOVER CARD */}
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📱</span>
                  <span className="font-bold text-slate-800 dark:text-white">Pushover</span>
                </div>
                {formData.pushover_user_key && formData.pushover_api_token ? (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded-full">Configured</span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">Not set</span>
                )}
              </div>
              <div className="p-3 bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30 rounded-lg text-xs text-sky-800 dark:text-sky-200">
                Get your keys from <a href="https://pushover.net/" target="_blank" className="underline font-bold">Pushover.net</a>.
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">User Key</label>
                <PasswordInput
                  name="pushover_user_key"
                  value={formData.pushover_user_key}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5">API Token</label>
                <PasswordInput
                  name="pushover_api_token"
                  value={formData.pushover_api_token}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-4 mt-4">
            {status && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm animate-pulse text-center sm:text-left">{status}</span>}
            <button onClick={handleSubmit} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer">
              {t('saveChanges')}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
