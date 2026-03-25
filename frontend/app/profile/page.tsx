"use client";
import { useEffect, useState, useCallback } from 'react';
import { useAuth, fetchWithAuth } from '../components/AuthProvider';
import DynamicList from './components/DynamicList';
import PageWrapper from '../components/PageWrapper';
import PageHeader from '../components/PageHeader';
import AutoResizeTextarea from '../components/AutoResizeTextarea';
import { useLanguage } from '../components/LanguageProvider';
import { useNotification } from '../components/NotificationProvider';
import { logger } from '../lib/logger';

type Tab = 'target' | 'resume';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

import { Target, FileText, Briefcase, Zap, CircleDollarSign, MapPin, Sparkles, CheckCircle2, UploadCloud, GraduationCap } from 'lucide-react';

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all";

export default function Profile() {
  const { token, refreshUser } = useAuth();
  const { t } = useLanguage();
  const { showError } = useNotification();

  const [activeTab, setActiveTab] = useState<Tab>('target');
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
  });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  useEffect(() => {
    if (token) {
      fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`)
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
          });
          setLoading(false);
        })
        .catch(e => { logger.error({ err: e }, "Fetch profile settings errored"); showError(`GET /settings-view failed: ${e?.message || e}`); setLoading(false); });
    }
  }, [token]);

  const completion = useCallback(() => {
    const fields = [formData.role, formData.skills, formData.min_salary, formData.location, formData.preferences];
    const filled = fields.filter(Boolean).length + (formData.cv_data.experience.length > 0 ? 1 : 0);
    return Math.round((filled / 6) * 100);
  }, [formData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setSaveStatus('saving');
    try {
      await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setSaveStatus('saved');
      refreshUser();
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e: any) {
      showError(e?.message || t('error'));
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const processUpload = async (file: File) => {
    setUploading(true);
    setUploadMessage(t('analyzingPdf'));
    const uploadData = new FormData();
    uploadData.append("file", file);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings/upload-cv`, {
        method: 'POST',
        body: uploadData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const result = await res.json();
      const data = result.data;
      setFormData(prev => ({
        role: data.role || prev.role || '',
        skills: data.skills || prev.skills || '',
        min_salary: data.min_salary || prev.min_salary || '',
        location: data.location || prev.location || '',
        preferences: prev.preferences || '',
        cv_data: data.cv_data || { experience: [], projects: [], education: '' },
      }));
      setUploadMessage(t('importSuccess'));
      setTimeout(() => setUploadMessage(''), 3000);
    } catch (error) {
      logger.error({ err: error }, "CV upload failed");
      setUploadMessage(t('importFailed'));
      setTimeout(() => setUploadMessage(''), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processUpload(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') processUpload(file);
  };

  // Experience handlers
  const handleExpChange = (idx: number, field: string, val: string) => {
    const newExp = [...formData.cv_data.experience];
    newExp[idx] = { ...newExp[idx], [field]: val };
    setFormData({ ...formData, cv_data: { ...formData.cv_data, experience: newExp } });
  };
  const addExp = () => setFormData({ ...formData, cv_data: { ...formData.cv_data, experience: [...formData.cv_data.experience, { company: '', role: '', duration: '', description: '' }] } });
  const removeExp = (idx: number) => setFormData({ ...formData, cv_data: { ...formData.cv_data, experience: formData.cv_data.experience.filter((_, i) => i !== idx) } });

  // Project handlers
  const handleProjChange = (idx: number, field: string, val: string) => {
    const newProj = [...formData.cv_data.projects];
    newProj[idx] = { ...newProj[idx], [field]: val };
    setFormData({ ...formData, cv_data: { ...formData.cv_data, projects: newProj } });
  };
  const addProj = () => setFormData({ ...formData, cv_data: { ...formData.cv_data, projects: [...formData.cv_data.projects, { name: '', tech_stack: '', description: '' }] } });
  const removeProj = (idx: number) => setFormData({ ...formData, cv_data: { ...formData.cv_data, projects: formData.cv_data.projects.filter((_, i) => i !== idx) } });

  if (loading) return (
    <PageWrapper>
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">{t('loadingProfile')}</p>
        </div>
      </div>
    </PageWrapper>
  );


  const pct = completion();
  const pctColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  const pctTextColor = pct >= 80 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-rose-500';

  return (
    <PageWrapper>
      <PageHeader title={t('profileAndResume')} subtitle={t('profileDescription')} />

      {/* Profile Completion */}
      <div className="glass-card rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('profileCompletion')}</span>
          <span className={`text-sm font-bold tabular-nums ${pctTextColor}`}>{pct}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${pctColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-8 bg-slate-100/50 dark:bg-slate-800/40 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
        {(['target', 'resume'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer group relative ${
              activeTab === tab
                ? 'bg-white dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-md shadow-indigo-500/5 ring-1 ring-slate-200/50 dark:ring-indigo-500/30'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center justify-center gap-2.5 relative z-10">
              {tab === 'target' ? (
                <Target size={16} className={activeTab === tab ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors'} />
              ) : (
                <FileText size={16} className={activeTab === tab ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors'} />
              )}
              {tab === 'target' ? t('targetJob') : t('resume')}
            </div>
            {activeTab === tab && (
              <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-indigo-500 dark:bg-indigo-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* TAB: Target Job */}
      {activeTab === 'target' && (
        <div className="glass-card rounded-2xl p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">{t('targetParameters')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label={t('targetRole')} icon={<Briefcase size={14} />}>
              <input name="role" value={formData.role} onChange={handleChange} className={inputCls} placeholder="e.g. Backend Engineer" />
            </Field>
            <Field label={t('skillsComma')} icon={<Zap size={14} />}>
              <AutoResizeTextarea name="skills" value={formData.skills} onChange={handleChange} className={inputCls} placeholder="Python, AWS, React..." rows={1} />
            </Field>
            <Field label={t('minSalary')} icon={<CircleDollarSign size={14} />}>
              <input name="min_salary" value={formData.min_salary} onChange={handleChange} className={inputCls} placeholder="70.000 €" />
            </Field>
            <Field label={t('location')} icon={<MapPin size={14} />}>
              <input name="location" value={formData.location} onChange={handleChange} className={inputCls} placeholder="Berlin, Remote..." />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('preferencesNatural')} icon={<Sparkles size={14} />}>
                <AutoResizeTextarea name="preferences" value={formData.preferences} onChange={handleChange} className={inputCls} rows={1} />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Resume */}
      {activeTab === 'resume' && (
        <div className="space-y-6">

          {/* CV Upload Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 ${
              dragOver
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.01]'
                : uploading
                  ? 'border-purple-300 dark:border-purple-500/40 bg-purple-50/30 dark:bg-purple-500/5'
                  : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50 dark:bg-slate-800/20'
            }`}
          >
            <input
              type="file" accept=".pdf" onChange={handleFileUpload} disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
            />
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center pointer-events-none select-none">
              {uploading ? (
                <>
                  <div className="w-12 h-12 border-4 border-purple-400/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                  <p className="font-semibold text-purple-600 dark:text-purple-400">{t('analyzing')}</p>
                  <p className="text-xs text-slate-400 mt-1">{uploadMessage}</p>
                </>
              ) : uploadMessage ? (
                <>
                  <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-3 text-2xl"><CheckCircle2 className="text-emerald-500" /></div>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">{uploadMessage}</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4"><UploadCloud className="text-indigo-500" /></div>
                  <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('uploadCv')}</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs">{t('dropPdf')}</p>
                  <div className="mt-4 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl">
                    {t('selectPdf')}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Experience */}
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <DynamicList
              title={t('experience')}
              items={formData.cv_data.experience}
              onAdd={addExp} onRemove={removeExp} onChange={handleExpChange}
              fields={[
                { name: 'company', placeholder: t('company') },
                { name: 'role', placeholder: t('role') },
                { name: 'duration', placeholder: t('duration') },
                { name: 'description', placeholder: t('description'), type: 'textarea' },
              ]}
            />
          </div>

          {/* Projects */}
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <DynamicList
              title={t('keyProjects')}
              items={formData.cv_data.projects}
              onAdd={addProj} onRemove={removeProj} onChange={handleProjChange}
              fields={[
                { name: 'name', placeholder: t('projectName') },
                { name: 'tech_stack', placeholder: t('techStack'), type: 'textarea' },
                { name: 'description', placeholder: t('description'), type: 'textarea' },
              ]}
            />
          </div>

          {/* Education */}
            <div className="glass-card rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <GraduationCap size={20} className="text-indigo-500" /> {t('education')}
              </h2>
              <AutoResizeTextarea
                value={formData.cv_data.education}
                onChange={(e) => setFormData({ ...formData, cv_data: { ...formData.cv_data, education: e.target.value } })}
                className={inputCls}
                placeholder={t('universityPlaceholder')}
                rows={1}
              />
            </div>
        </div>
      )}

      {/* Sticky Save Bar */}
      <div className="sticky bottom-4 mt-8 flex justify-end pointer-events-none">
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-4 shadow-xl pointer-events-auto">
          {saveStatus !== 'idle' && (
            <span className={`text-sm font-semibold ${
              saveStatus === 'saved' ? 'text-emerald-500' :
              saveStatus === 'error' ? 'text-rose-500' :
              'text-slate-400 animate-pulse'
            }`}>
              {saveStatus === 'saving' ? t('saving') : saveStatus === 'saved' ? t('saved') : t('error')}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={saveStatus === 'saving'}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer text-sm whitespace-nowrap"
          >
            {saveStatus === 'saving' ? '...' : t('saveChanges')}
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
