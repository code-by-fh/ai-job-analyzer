"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import DynamicList from '../components/DynamicList';

export default function Settings() {
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
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`)
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
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('Speichere...');
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      setStatus('Gespeichert! ✅');
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      setStatus('Fehler ❌');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setUploading(true);
    setStatus("Analysiere PDF... (kann 10-20sek dauern)");

    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings/upload-cv`, {
        method: 'POST',
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

      setStatus("CV erfolgreich importiert! 🎉");
    } catch (error) {
      console.error(error);
      setStatus("Fehler beim Import ❌");
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
    setStatus('Starte Crawler...');

    for (const url of formData.job_urls) {
      if (!url) continue;
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: url, location: formData.location || 'Remote' })
        });
      } catch (e) { console.error("Crawler error", e); }
    }
    setStatus('Crawl Auftrag gesendet! 🕵️‍♂️');
    setCrawling(false);
    setTimeout(() => setStatus(''), 3000);
  };

  const handleDeleteProfile = async () => {
    if (!confirm("Bist du sicher? Dein gesamter Lebenslauf und alle Einstellungen werden unwiderruflich gelöscht.")) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, { method: 'DELETE' });
      setFormData({
        role: '', skills: '', min_salary: '', location: '', preferences: '',
        cv_data: { experience: [], projects: [], education: '' },
        job_urls: []
      });
      alert("Profil gelöscht.");
    } catch (e) {
      alert("Fehler beim Löschen.");
    }
  };

  const handleFactoryReset = async () => {
    if (!confirm("⚠️ WARNUNG: Das löscht ALLE Jobs und dein komplettes Profil. Alles weg. Wirklich?")) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/reset`);
      setFormData({
        role: '', skills: '', min_salary: '', location: '', preferences: '',
        cv_data: { experience: [], projects: [], education: '' },
        job_urls: []
      });
      alert("System komplett zurückgesetzt!");
      window.location.href = "/"; // Zurück zur Startseite
    } catch (e) {
      alert("Fehler beim Reset.");
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-600">Lade Profil...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <div className="bg-white border-b border-slate-200 shadow-sm p-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-indigo-600 font-bold hover:underline">← Zurück zu Jobs</Link>
          <h1 className="text-xl font-bold text-slate-800">Mein CV Profil</h1>
          <button onClick={handleSubmit} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 transition shadow-sm cursor-pointer">
            Speichern
          </button>
        </div>
        {status && <div className="text-center text-green-600 font-bold mt-2 text-sm">{status}</div>}
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-8">

        {/* NEU: UPLOAD SECTION */}
        <section className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-indigo-900">🚀 Schnellstart: CV hochladen</h2>
            <p className="text-sm text-indigo-700 mt-1">Lade dein PDF hoch, um dein Profil zu vervollständigen.</p>
          </div>

          <div className="relative">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <button
              disabled={uploading}
              className={`px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed ${uploading ? 'opacity-50' : ''}`}
            >
              {uploading ? '⏳ Analysiere...' : '📂 PDF wählen'}
            </button>
          </div>
        </section>


        {/* BASIS DATEN */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b pb-2">Allgemeine Sucheinstellungen</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold text-slate-700">Gesuchte Rolle</label>
              <input
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full border border-slate-300 p-2 rounded mt-1 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="z.B. Backend Dev"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700">Skills (Kommagetrennt)</label>
              <input
                name="skills"
                value={formData.skills}
                onChange={handleChange}
                className="w-full border border-slate-300 p-2 rounded mt-1 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Python, AWS..."
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700">Min. Gehalt</label>
              <input
                name="min_salary"
                value={formData.min_salary}
                onChange={handleChange}
                className="w-full border border-slate-300 p-2 rounded mt-1 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700">Ort</label>
              <input
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="w-full border border-slate-300 p-2 rounded mt-1 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-slate-700">Präferenzen</label>
            <textarea
              name="preferences"
              value={formData.preferences}
              onChange={handleChange}
              className="w-full border border-slate-300 p-2 rounded mt-1 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
              rows={2}
            />
          </div>
        </section>

        {/* JOB QUELLEN (CRAWLER) */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900">📡 Job Quellen (Crawler)</h2>
            <button
              onClick={handleCrawlAll}
              disabled={crawling || formData.job_urls.length === 0}
              className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              {crawling ? 'Crawle...' : '▶ Jetzt Crawlen'}
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Hinterlege hier URLs von Karriereseiten. Diese werden regelmäßig nach neuen Jobs durchsucht.
          </p>

          <div className="space-y-3">
            {formData.job_urls.map((url, idx) => (
              <div key={idx} className="flex gap-2">
                <input value={url} onChange={(e) => handleUrlChange(idx, e.target.value)} className="flex-1 border border-slate-300 p-2 rounded text-slate-900 text-sm" placeholder="https://..." />
                <button onClick={() => removeUrl(idx)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition cursor-pointer">🗑️</button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="flex-1 border border-slate-300 p-2 rounded text-slate-900 text-sm" placeholder="Neue URL hinzufügen..." onKeyDown={(e) => e.key === 'Enter' && addUrl()} />
              <button onClick={addUrl} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 font-bold transition shadow-sm cursor-pointer">+</button>
            </div>
          </div>
        </section>

        {/* BERUFSERFAHRUNG */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <DynamicList
            title="Berufserfahrung"
            items={formData.cv_data.experience}
            onAdd={addExp}
            onRemove={removeExp}
            onChange={handleExpChange}
            fields={[
              { name: 'company', placeholder: 'Firma (z.B. Google)' },
              { name: 'role', placeholder: 'Job Titel' },
              { name: 'duration', placeholder: 'Zeitraum (z.B. 2020-2023)' },
              { name: 'description', placeholder: 'Aufgaben & Erfolge (Was hast du erreicht?)', type: 'textarea' }
            ]}
          />
        </section>

        {/* PROJEKTE */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <DynamicList
            title="Wichtige Projekte"
            items={formData.cv_data.projects}
            onAdd={addProj}
            onRemove={removeProj}
            onChange={handleProjChange}
            fields={[
              { name: 'name', placeholder: 'Projektname' },
              { name: 'tech_stack', placeholder: 'Tech Stack (z.B. React, Node.js)' },
              { name: 'description', placeholder: 'Projektbeschreibung', type: 'textarea' }
            ]}
          />
        </section>

        {/* AUSBILDUNG */}
        <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-slate-800 mb-4">Ausbildung</h2>
          <textarea
            value={formData.cv_data.education}
            onChange={(e) => setFormData({ ...formData, cv_data: { ...formData.cv_data, education: e.target.value } })}
            className="w-full border border-slate-300 p-2 rounded text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
            rows={4}
            placeholder="Studium, Universität, Abschluss..."
          />
        </section>

        {/* DANGER ZONE */}
        <section className="mt-12 pt-8 border-t border-red-200">
          <h2 className="text-lg font-bold text-red-600 mb-4">☠️ Gefahrenzone</h2>

          <div className="flex flex-col md:flex-row gap-4">
            <button
              type="button"
              onClick={handleDeleteProfile}
              className="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium transition shadow-sm cursor-pointer"
            >
              🗑️ Nur Profil & CV löschen
            </button>

            <button
              type="button"
              onClick={handleFactoryReset}
              className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-bold transition shadow-sm cursor-pointer"
            >
              💥 Alles löschen (Factory Reset)
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            "Factory Reset" löscht auch alle gefundenen Jobs aus der Datenbank.
          </p>
        </section>

      </div>
    </div>
  );
}