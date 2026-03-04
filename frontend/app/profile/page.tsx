"use client";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import DynamicList from '../components/DynamicList';
import { useLanguage } from '../components/LanguageProvider';

export default function Profile() {
  const { token, refreshUser } = useAuth();
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
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);

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
      refreshUser();
      setTimeout(() => setStatus(''), 2000);
    } catch {
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

  if (loading) return <div className="p-10 text-center text-slate-500 animate-pulse">{t('loadingProfile')}</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Profil &amp; Lebenslauf</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('profileSubtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT COLUMN */}
        <div className="space-y-8 lg:col-span-2">

          {/* TARGET PARAMETERS CARD */}
          <section className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300 p-6 sm:p-8">
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

          {/* EXPERIENCE */}
          <section className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300 p-6 sm:p-8">
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

          {/* KEY PROJECTS */}
          <section className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300 p-6 sm:p-8">
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

          {/* EDUCATION */}
          <section className="bg-white dark:bg-slate-900/50 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md transition-all duration-300 p-6 sm:p-8">
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

        </div>

        {/* RIGHT COLUMN - CV Upload */}
        <div className="space-y-8">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-500/20 hover:shadow-2xl hover:shadow-indigo-500/40 transition-all duration-300">
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
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
          </div>
        </div>

      </div>
    </div>
  );
}
