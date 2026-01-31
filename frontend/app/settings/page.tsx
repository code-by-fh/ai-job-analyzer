"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import DynamicList from '../components/DynamicList';
import { useAuth } from '../components/AuthProvider';
import { useRouter } from 'next/navigation';
import PasswordChangeForm from '../components/PasswordChangeForm';

export default function Settings() {
  const { user, token, isAuthenticated } = useAuth();
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
    job_urls: [] as string[]
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [crawling, setCrawling] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/login');
      return;
    }

    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setFormData({
            role: data.role || '',
            skills: data.skills || '',
            min_salary: data.min_salary || '',
            location: data.location || '',
            preferences: data.preferences || '',
            cv_data: data.cv_data || { experience: [], projects: [], education: '' },
            job_urls: data.job_urls || []
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
    setStatus('Saving...');
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      setStatus('Saved! ✅');
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      setStatus('Error ❌');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploading(true);
    setStatus("Analyzing PDF... (takes 10-20s)");

    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings/upload-cv`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: uploadData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const result = await res.json();
      const data = result.data;

      setFormData({
        role: data.role || formData.role || '',
        skills: data.skills || formData.skills || '',
        min_salary: data.min_salary || formData.min_salary || '',
        location: data.location || formData.location || '',
        preferences: formData.preferences || '',
        cv_data: data.cv_data || { experience: [], projects: [], education: '' },
        job_urls: formData.job_urls || []
      });

      setStatus("CV imported successfully! 🎉");
    } catch (error) {
      console.error(error);
      setStatus("Import failed ❌");
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
    setStatus('Starting Crawler...');

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
    setStatus('Crawl jobs dispatched! 🕵️‍♂️');
    setCrawling(false);
    setTimeout(() => setStatus(''), 3000);
  };

  const handleDeleteJobs = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure? This will delete all your crawled jobs permanently.")) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      alert(`${data.count || 0} jobs deleted.`);
      window.location.href = "/";
    } catch (e) {
      alert("Error deleting jobs.");
    }
  };

  const handleDeleteProfile = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Are you sure? This will delete your profile and CV data permanently.")) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setFormData({
        role: '', skills: '', min_salary: '', location: '', preferences: '',
        cv_data: { experience: [], projects: [], education: '' },
        job_urls: []
      });
      alert("Profile deleted.");
    } catch (e) {
      alert("Error deleting profile.");
    }
  };

  const handleFactoryReset = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("⚠️ WARNING: This will delete ALL jobs and your entire profile. Everything. Sure?")) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user/reset`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setFormData({
        role: '', skills: '', min_salary: '', location: '', preferences: '',
        cv_data: { experience: [], projects: [], education: '' },
        job_urls: []
      });
      alert("System factory reset complete!");
      window.location.href = "/";
    } catch (e) {
      alert("Reset failed.");
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500 animate-pulse">Loading Profile...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Profile Configuration</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your professional identity and search preferences</p>
        </div>
        <div className="flex items-center gap-4">
          {status && <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm animate-pulse">{status}</span>}
          <button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer">
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT COLUMN */}
        <div className="space-y-8 lg:col-span-2">

          {/* BASIC SETTINGS CARD */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <span>🎯</span> Target Parameters
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Target Role</label>
                <input
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="e.g. Backend Engineer"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Skills (Comma sep.)</label>
                <input
                  name="skills"
                  value={formData.skills}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="Python, AWS, React..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Min Salary</label>
                <input
                  name="min_salary"
                  value={formData.min_salary}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Location</label>
                <input
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Preferences (Natural Language)</label>
                <textarea
                  name="preferences"
                  value={formData.preferences}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[80px]"
                  rows={2}
                />
              </div>
            </div>
          </section>

          {/* EXPERIENCE & PROJECTS (Dynamic List) */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <DynamicList
              title="Experience"
              items={formData.cv_data.experience}
              onAdd={addExp}
              onRemove={removeExp}
              onChange={handleExpChange}
              fields={[
                { name: 'company', placeholder: 'Company' },
                { name: 'role', placeholder: 'Role' },
                { name: 'duration', placeholder: 'Duration' },
                { name: 'description', placeholder: 'Description...', type: 'textarea' }
              ]}
            />
          </section>

          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <DynamicList
              title="Key Projects"
              items={formData.cv_data.projects}
              onAdd={addProj}
              onRemove={removeProj}
              onChange={handleProjChange}
              fields={[
                { name: 'name', placeholder: 'Project Name' },
                { name: 'tech_stack', placeholder: 'Tech Stack' },
                { name: 'description', placeholder: 'Description...', type: 'textarea' }
              ]}
            />
          </section>

          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <span>🎓</span> Education
            </h2>
            <textarea
              value={formData.cv_data.education}
              onChange={(e) => setFormData({ ...formData, cv_data: { ...formData.cv_data, education: e.target.value } })}
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[120px]"
              placeholder="University, Degree..."
            />
          </section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-8">

          {/* UPLOAD CARD */}
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-500/20">
            <div className="relative z-10">
              <h2 className="text-xl font-bold mb-2">Upload CV</h2>
              <p className="text-indigo-100 text-sm mb-6">Drop your PDF to auto-extract skills and experience.</p>

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
                  {uploading ? 'Analyzing...' : '📂 Select PDF'}
                </div>
              </div>
            </div>
            {/* Decorative Circle */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          {/* CRAWLER CONFIG */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold text-slate-900 dark:text-white">📡 Job Sources</h2>
              <button
                onClick={handleCrawlAll}
                disabled={crawling || formData.job_urls.length === 0}
                className="text-xs bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {crawling ? 'Crawling...' : 'Scan Now'}
              </button>
            </div>
            <div className="space-y-3">
              {formData.job_urls.map((url, idx) => (
                <div key={idx} className="flex gap-2">
                  <input value={url} onChange={(e) => handleUrlChange(idx, e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white" />
                  <button onClick={() => removeUrl(idx)} className="text-slate-400 hover:text-rose-500 p-2 transition">✕</button>
                </div>
              ))}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="flex-1 bg-transparent border-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-0 px-0" placeholder="Add URL..." onKeyDown={(e) => e.key === 'Enter' && addUrl()} />
                <button onClick={addUrl} className="text-indigo-600 dark:text-indigo-400 font-bold px-2">+</button>
              </div>
            </div>
          </section>

          {/* SECURITY & DANGER */}
          <section className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-bold text-slate-900 dark:text-white mb-4">Security</h2>
            <PasswordChangeForm token={token} />
          </section>

          <section className="bg-rose-50 dark:bg-rose-500/5 rounded-2xl border border-rose-100 dark:border-rose-500/10 p-6">
            <h2 className="font-bold text-rose-700 dark:text-rose-400 mb-4">Danger Zone</h2>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleDeleteJobs}
                className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl font-medium text-sm transition"
              >
                Delete All Jobs
              </button>
              <button
                type="button"
                onClick={handleDeleteProfile}
                className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl font-medium text-sm transition"
              >
                Delete Profile Only
              </button>
              <button
                type="button"
                onClick={handleFactoryReset}
                className="w-full px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm transition"
              >
                Factory Reset (All Data)
              </button>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}