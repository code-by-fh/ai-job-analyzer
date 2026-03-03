"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import PasswordInput from '../components/PasswordInput';
import ConfirmModal from '../components/ConfirmModal';
import DynamicList from '../components/DynamicList';
import JobPlatformsManager from '../components/JobPlatformsManager';
import { useLanguage } from '../components/LanguageProvider';
import PasswordChangeForm from '../components/PasswordChangeForm';

export default function Settings() {
  const { user, token, isAuthenticated, refreshUser } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [formData, setFormData] = useState({
    role: '',
    skills: '',
    min_salary: '',
    location: '',
    preferences: '',
    cv_data: {
      experience: [] as any[],
      projects: [] as any[],
      education: ''
    },
    job_urls: [] as string[],
    gmail_address: '',
    gmail_app_password: '',
    pushover_user_key: '',
    pushover_api_token: '',
    active_notification_service: 'NONE'
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [crawling, setCrawling] = useState(false);

  // Confirm Modal State
  const [confirmAction, setConfirmAction] = useState<{
    type: 'DELETE_JOBS' | 'DELETE_PROFILE' | 'FACTORY_RESET';
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  const [initialPlatforms, setInitialPlatforms] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
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

          setFormData({
            role: profileData.role || '',
            skills: profileData.skills || '',
            min_salary: profileData.min_salary || '',
            location: profileData.location || '',
            preferences: profileData.preferences || '',
            cv_data: profileData.cv_data || { experience: [], projects: [], education: '' },
            job_urls: profileData.job_urls || [],
            gmail_address: profileData.gmail_address || '',
            gmail_app_password: profileData.gmail_app_password || '',
            pushover_user_key: profileData.pushover_user_key || '',
            pushover_api_token: profileData.pushover_api_token || '',
            active_notification_service: profileData.active_notification_service || 'NONE'
          });

          if (data.platforms) setInitialPlatforms(data.platforms);

          setLoading(false);
          setDataLoaded(true);
        })
        .catch(e => { console.error(e); setLoading(false); });
    }
  }, [token, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(t('saving'));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      setStatus(t('saved'));
      refreshUser(); // Update global user state (e.g. is_profile_complete)
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      setStatus(t('error'));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploading(true);
    setStatus(t('analyzingPdf'));

    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings/upload-cv`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: uploadData,
      });

      if (!res.ok) throw new Error(t('uploadFailed'));

      const result = await res.json();
      const data = result.data;

      setFormData({
        role: data.role || formData.role || '',
        skills: data.skills || formData.skills || '',
        min_salary: data.min_salary || formData.min_salary || '',
        location: data.location || formData.location || '',
        preferences: formData.preferences || '',
        cv_data: data.cv_data || { experience: [], projects: [], education: '' },
        job_urls: formData.job_urls || [],
        gmail_address: formData.gmail_address,
        gmail_app_password: formData.gmail_app_password,
        pushover_user_key: formData.pushover_user_key,
        pushover_api_token: formData.pushover_api_token,
        active_notification_service: formData.active_notification_service
      });

      setStatus(t('importSuccess'));
    } catch (error) {
      console.error(error);
      setStatus(t('importFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleExpChange = (idx: number, field: string, val: string) => {
    const newExp = [...formData.cv_data.experience];
    newExp[idx] = { ...newExp[idx], [field]: val };
    setFormData({ ...formData, cv_data: { ...formData.cv_data, experience: newExp } });
  };
  const addExp = () => {
    setFormData({
      ...formData,
      cv_data: {
        ...formData.cv_data,
        experience: [...formData.cv_data.experience, { company: '', role: '', duration: '', description: '' }]
      }
    });
  };
  const removeExp = (idx: number) => {
    const newExp = formData.cv_data.experience.filter((_, i) => i !== idx);
    setFormData({ ...formData, cv_data: { ...formData.cv_data, experience: newExp } });
  };

  const handleProjChange = (idx: number, field: string, val: string) => {
    const newProj = [...formData.cv_data.projects];
    newProj[idx] = { ...newProj[idx], [field]: val };
    setFormData({ ...formData, cv_data: { ...formData.cv_data, projects: newProj } });
  };
  const addProj = () => {
    setFormData({
      ...formData,
      cv_data: {
        ...formData.cv_data,
        projects: [...formData.cv_data.projects, { name: '', tech_stack: '', description: '' }]
      }
    });
  };
  const removeProj = (idx: number) => {
    const newProj = formData.cv_data.projects.filter((_, i) => i !== idx);
    setFormData({ ...formData, cv_data: { ...formData.cv_data, projects: newProj } });
  };

  // --- JOB URLS ---
  const addUrl = () => {
    if (!newUrl) return;
    setFormData({ ...formData, job_urls: [...formData.job_urls, newUrl] });
    setNewUrl('');
  };
  const removeUrl = (idx: number) => {
    const newUrls = formData.job_urls.filter((_, i) => i !== idx);
    setFormData({ ...formData, job_urls: newUrls });
  };
  const handleUrlChange = (idx: number, val: string) => {
    const newUrls = [...formData.job_urls];
    newUrls[idx] = val;
    setFormData({ ...formData, job_urls: newUrls });
  };

  const handleCrawlAll = async () => {
    if (formData.job_urls.length === 0) return;
    setCrawling(true);
    setStatus(t('startingCrawler'));

    for (const url of formData.job_urls) {
      if (!url) continue;
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: url, location: formData.location || 'Remote', user_id: user?.id })
        });
      } catch (e) { console.error("Crawler error", e); }
    }
    setStatus(t('crawlJobsDispatched'));
    setCrawling(false);
    setTimeout(() => setStatus(''), 3000);
  };

  // --- ACTIONS ---
  const executeDeleteJobs = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setStatus(`${data.count || 0} jobs deleted.`);
      setTimeout(() => window.location.href = "/", 1000);
    } catch (e) {
      setStatus(t('error'));
    }
  };

  const executeDeleteProfile = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setFormData({
        role: '', skills: '', min_salary: '', location: '', preferences: '',
        cv_data: { experience: [], projects: [], education: '' },
        job_urls: [],
        gmail_address: '', gmail_app_password: '',
        pushover_user_key: '', pushover_api_token: '',
        active_notification_service: 'NONE'
      });
      setStatus(t('saved'));
      refreshUser();
    } catch (e) {
      setStatus(t('error'));
    }
  };

  const executeFactoryReset = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/reset`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setFormData({
        role: '', skills: '', min_salary: '', location: '', preferences: '',
        cv_data: { experience: [], projects: [], education: '' },
        job_urls: [],
        gmail_address: '', gmail_app_password: '',
        pushover_user_key: '', pushover_api_token: '',
        active_notification_service: 'NONE'
      });
      setStatus(t('saved'));
      refreshUser();
      setTimeout(() => window.location.href = "/", 1000);
    } catch (e) {
      setStatus(t('error'));
    }
  };

  // --- HANDLERS (Open Modals) ---
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

  if (loading) return <div className="p-10 text-center text-slate-500 animate-pulse">{t('loadingProfile')}</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction) confirmAction.action();
        }}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        confirmText={t('confirm')}
        isDestructive
      />

      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">{t('profileConfiguration')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('profileSubtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT COLUMN */}
        <div className="space-y-8 lg:col-span-2">

          {/* BASIC SETTINGS CARD */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <span>🎯</span> {t('targetParameters')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t('targetRole')}</label>
                <input
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="e.g. Backend Engineer"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t('skillsComma')}</label>
                <input
                  name="skills"
                  value={formData.skills}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="Python, AWS, React..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t('minSalary')}</label>
                <input
                  name="min_salary"
                  value={formData.min_salary}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t('location')}</label>
                <input
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t('preferencesNatural')}</label>
                <textarea
                  name="preferences"
                  value={formData.preferences}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[80px]"
                  rows={2}
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-4 mt-4">
              {status && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm animate-pulse text-center sm:text-left">{status}</span>}
              <button onClick={handleSubmit} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer">
                {t('saveChanges')}
              </button>
            </div>
          </section>

          {/* EXPERIENCE & PROJECTS (Dynamic List) */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <DynamicList
              title={t('experience')}
              items={formData.cv_data.experience}
              onAdd={addExp}
              onRemove={removeExp}
              onChange={handleExpChange}
              fields={[
                { name: 'company', placeholder: t('company') },
                { name: 'role', placeholder: t('role') },
                { name: 'duration', placeholder: t('duration') },
                { name: 'description', placeholder: t('description'), type: 'textarea' }
              ]}
            />
            <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-4 mt-4">
              {status && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm animate-pulse text-center sm:text-left">{status}</span>}
              <button onClick={handleSubmit} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer">
                {t('saveChanges')}
              </button>
            </div>

          </section>

          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <DynamicList
              title={t('keyProjects')}
              items={formData.cv_data.projects}
              onAdd={addProj}
              onRemove={removeProj}
              onChange={handleProjChange}
              fields={[
                { name: 'name', placeholder: t('projectName') },
                { name: 'tech_stack', placeholder: t('techStack') },
                { name: 'description', placeholder: t('description'), type: 'textarea' }
              ]}
            />
            <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-4 mt-4">
              {status && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm animate-pulse text-center sm:text-left">{status}</span>}
              <button onClick={handleSubmit} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer">
                {t('saveChanges')}
              </button>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <span>🎓</span> {t('education')}
            </h2>
            <textarea
              value={formData.cv_data.education}
              onChange={(e) => setFormData({ ...formData, cv_data: { ...formData.cv_data, education: e.target.value } })}
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[120px]"
              placeholder="University, Degree..."
            />
            <div className="flex flex-col sm:flex-row sm:justify-end items-stretch sm:items-center gap-4 mt-4">
              {status && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm animate-pulse text-center sm:text-left">{status}</span>}
              <button onClick={handleSubmit} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer">
                {t('saveChanges')}
              </button>
            </div>
          </section>

          {/* JOB PLATFORMS */}
          {dataLoaded && <JobPlatformsManager
            token={token}
            user={user}
            initialPlatforms={initialPlatforms}
            configuredAdapters={[
              ...(formData.gmail_address && formData.gmail_app_password ? ['GMAIL'] : []),
              ...(formData.pushover_user_key && formData.pushover_api_token ? ['PUSHOVER'] : []),
            ]}
          />}

          {/* NOTIFICATION SETTINGS */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <span>🔔</span> {t('notifications')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              Configure your notification adapters here. Per-platform activation is done in the Job Platforms section above.
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

        {/* RIGHT COLUMN */}
        <div className="space-y-8">

          {/* UPLOAD CARD */}
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-500/20">
            <div className="relative z-10">
              <h2 className="text-xl font-bold mb-2">{t('uploadCv')}</h2>
              <p className="text-indigo-100 text-sm mb-6">{t('dropPdf')}</p>

              <div className="relative">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                  id="pdf-upload-input"
                />
                <div
                  className={`w-full py-3 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 rounded-xl font-bold transition flex items-center justify-center gap-2 ${uploading ? 'opacity-50' : ''}`}
                >
                  {uploading ? t('analyzing') : `📂 ${t('selectPdf')}`}
                </div>
              </div>
            </div>
            {/* Decorative Circle */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          {/* SECURITY & DANGER */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">{t('security')}</h2>
            <PasswordChangeForm token={token} />
          </section>

          <section className="bg-rose-50 dark:bg-rose-500/5 rounded-2xl border border-rose-100 dark:border-rose-500/10 p-6">
            <h2 className="font-bold text-rose-700 dark:text-rose-400 mb-4">{t('dangerZone')}</h2>
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
    </div >
  );
}