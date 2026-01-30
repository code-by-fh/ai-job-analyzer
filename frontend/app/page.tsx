"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ApplicationModal from './components/ApplicationModal';
import { useAuth } from './components/AuthProvider';
import { useRouter } from 'next/navigation';
import UserMenu from './components/UserMenu';

// --- TYPEN ---
interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  match_score: number;
  reasoning: string;
  url?: string;
  application_draft?: string;
  created_at?: string;
  status?: string;
}

export default function Home() {
  const { user, token, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  // --- STATE ---
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');
  const [isScrolled, setIsScrolled] = useState(false);

  // Generator & Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [modalJobId, setModalJobId] = useState('');

  const [isCrawling, setIsCrawling] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const [globalError, setGlobalError] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    // Check auth logic is handled inside AuthProvider basically, but double check
    const t = localStorage.getItem('token');
    if (!t) router.push('/login');
  }, [router]);

  // --- API ---
  const fetchJobs = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      setJobs(data);
    } catch (e) { console.error("Fehler beim Laden:", e); }
  };

  useEffect(() => {
    if (token) fetchJobs();
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/status`)
      .then(res => res.json())
      .then(data => { if (data.crawling) setIsCrawling(true); });

    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_API_WS_URL}/ws`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "crawl_started") {
        setIsCrawling(true);
      }
      else if (data.type === "crawl_completed") {
        setIsCrawling(false);
        if (token) fetchJobs();
      }
      else if (data.type === "new_job") {
        // Optionally filter if job doesn't belong to user, but backend sends everything?
        // Backend logic in API sends everything broadcasted? 
        // FIX: Use filtering on client or backend needs to filter WS messages (complex).
        // Actually backend sends payload via Redis -> WS.
        // Pass user_id in payload?
        if (data.job?.user_id === user?.id) {
          setJobs(prevJobs => [data.job, ...prevJobs]);
        }
      }
      else if (data.type === "job_update") {
        // Checking ownership here too
        if (data.user_id === user?.id) {
          setJobs(prev => prev.map(job => (job.id === data.job_id ? { ...job, ...data } : job)));
        }
        setPendingIds(prev => prev.filter(id => id !== data.job_id));
      }
      else if (data.type === "global_error") {
        // Global error might be relevant to all
        setGlobalError(data.message);
        setTimeout(() => setGlobalError(null), 8000);
      }
    };
    return () => ws.close();
  }, [token, user]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- SCROLL TO DETAILS EFFECT ---
  useEffect(() => {
    if (expandedJobId) {
      setTimeout(() => {
        const element = document.getElementById(`job-details-${expandedJobId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [expandedJobId]);

  const startSearch = async () => {
    if (!query) return;
    setIsCrawling(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, location: 'Remote', user_id: user?.id })
      });
    } catch (e) {
      setIsCrawling(false);
    }
  };

  const handleGenerate = async (job: Job) => {
    if (job.application_draft) {
      setModalContent(job.application_draft);
      setModalJobId(job.id);
      setModalOpen(true);
      return;
    }

    setPendingIds(prev => [...prev, job.id]);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      setPendingIds(prev => prev.filter(id => id !== job.id));
    }
  };

  // --- HELPER ---
  const timeAgo = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "T";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    return "now";
  };

  const sortedJobs = [...jobs].sort((a, b) => {
    if (sortBy === 'date') {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    }
    return b.match_score - a.match_score;
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 border-emerald-500';
    if (score >= 50) return 'text-amber-600 border-amber-500';
    return 'text-red-600 border-red-500';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 font-sans pb-20">
      <ApplicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        content={modalContent}
        jobId={modalJobId}
      />

      {/* HEADER */}
      <div
        className={`
          sticky top-0 z-50 transition-all duration-300 border-b
          ${isScrolled
            ? 'bg-white/80 backdrop-blur-md border-gray-200/50 py-2 shadow-sm'
            : 'bg-white border-gray-100 py-5'
          }
        `}
      >
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between transition-all duration-300">

            {/* LOGO AREA (Replaced by User Menu) */}
            <div className="flex items-center gap-4">
              <UserMenu />

              {/* Divider */}
              <div className="h-8 w-px bg-gray-200 hidden sm:block"></div>

              <div className="flex flex-col items-start hidden sm:flex">
                <h1 className={`font-bold tracking-tight text-gray-900 leading-none transition-all ${isScrolled ? 'text-base' : 'text-lg'}`}>
                  Job<span className="text-indigo-600">Agent</span>
                </h1>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">AI Recruiter</span>
              </div>
            </div>

            {/* SEARCH AREA */}
            <div className="flex w-full md:w-auto gap-2 group">
              <div className={`
                flex items-center border rounded-full px-4 transition-all duration-300 bg-slate-50 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/10
                ${isScrolled ? 'py-1.5 shadow-sm border-gray-200' : 'py-2.5 border-transparent'}
                w-full md:w-[28rem]
              `}>
                <span className="text-gray-400 mr-2">🔍</span>
                <input
                  className="w-full bg-transparent focus:outline-none text-sm placeholder:text-gray-400 text-gray-800"
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Traumjob suchen... (z.B. URL oder Keywords)"
                  disabled={isCrawling}
                />
              </div>

              <button
                onClick={startSearch}
                disabled={isCrawling}
                className={`
                  bg-gray-900 hover:bg-black text-white rounded-full font-medium text-sm transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-gray-200
                  ${isScrolled ? 'px-4 py-1.5' : 'px-6 py-2.5'}
                `}
              >
                {isCrawling ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> : <span>Go</span>}
              </button>
            </div>
          </div>

          {/* SECONDARY ROW (Collapses on Scroll) */}
          <div className={`
            flex justify-between items-center text-xs font-medium text-gray-500 overflow-hidden transition-all duration-300 ease-in-out
            ${isScrolled ? 'h-0 opacity-0 mt-0 frame-hidden' : 'h-8 opacity-100 mt-2 frame-visible'}
          `}>
            <div className="flex items-center gap-3 pl-14">
              <span>{jobs.length} Ergebnisse</span>
              {isCrawling && (
                <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full animate-pulse font-bold text-[10px] uppercase tracking-wide">
                  Scanning...
                </span>
              )}
            </div>
            <div className="flex gap-1 bg-gray-100/50 p-1 rounded-lg">
              <button
                onClick={() => setSortBy('score')}
                className={`
                  px-3 py-1 rounded-md transition-all cursor-pointer text-xs font-medium
                  ${sortBy === 'score' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-white/60'}
                `}
              >
                Relevanz
              </button>
              <button
                onClick={() => setSortBy('date')}
                className={`
                  px-3 py-1 rounded-md transition-all cursor-pointer text-xs font-medium
                  ${sortBy === 'date' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-white/60'}
                `}
              >
                Neueste
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* GLOBAL ERROR BANNER */}
      {globalError && (
        <div className="max-w-5xl mx-auto px-4 mt-4 animate-in slide-in-from-top duration-300">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-medium">{globalError}</p>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="text-red-400 hover:text-red-600 font-bold px-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* JOB LISTE */}
      <div className="max-w-5xl mx-auto px-4 mt-8 space-y-6">
        {jobs.length === 0 && !isCrawling && (
          <div className="text-center py-24 border border-dashed border-gray-200 rounded-xl">
            <p className="text-gray-400">Keine Jobs gefunden.</p>
          </div>
        )}

        {sortedJobs.map((job) => {
          const isExpanded = expandedJobId === job.id;
          const isGenerating = pendingIds.includes(job.id) || job.status === 'GENERATING';
          const scoreClass = getScoreColor(job.match_score);

          return (
            <div key={job.id} className={`bg-white rounded-xl border transition-all duration-200 ${isExpanded ? 'border-black shadow-lg' : 'border-gray-200 hover:border-gray-400'}`}>
              <div className="p-6 flex flex-col sm:flex-row gap-6">
                <div className="flex-shrink-0 pt-1">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 text-sm font-bold ${scoreClass}`}>
                    {Math.round(job.match_score)}%
                  </div>
                </div>

                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-lg font-bold text-gray-900 leading-tight pr-4">{job.title}</h2>
                    <span className="text-xs text-gray-400 whitespace-nowrap font-mono">{timeAgo(job.created_at)}</span>
                  </div>
                  <div className="text-sm text-gray-500 font-medium mb-3">{job.company}</div>

                  {/* AI Reasoning - Clean text */}
                  <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">✨</span>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI Analyse</span>
                    </div>
                    <div className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none"><ReactMarkdown>{job.reasoning}</ReactMarkdown></div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center gap-3 mt-auto pt-2">

                    {/* 1. ORIGINAL LINK BUTTON */}
                    {/* WICHTIG: Damit das geht, muss 'url' in der DB sein! */}
                    {job.url ? (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
                          px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-all duration-200 
                          hover:border-gray-300 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2
                        "
                      >
                        <span className="text-gray-400">↗</span>
                        <span>Zum Job</span>
                      </a>
                    ) : (
                      // Fallback, falls kein Link da ist
                      <span className="text-xs text-gray-300 italic px-2 py-2">Kein Link verfügbar</span>
                    )}

                    {/* 2. GENERATE BUTTON */}
                    <button
                      onClick={() => handleGenerate(job)}
                      disabled={isGenerating}
                      className={`
                        px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all duration-200 flex items-center gap-2 cursor-pointer
                        transform hover:-translate-y-0.5 active:translate-y-0
                        ${job.application_draft
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:shadow-emerald-100'
                          : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-indigo-200 hover:shadow-indigo-300 border border-transparent'}
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
                      `}
                    >
                      {isGenerating ? (
                        <>
                          <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></span>
                          <span>Wird erstellt...</span>
                        </>
                      ) : job.application_draft ? (
                        <>
                          <span>✅</span>
                          <span>Anschreiben ansehen</span>
                        </>
                      ) : (
                        <>
                          <span>✨</span>
                          <span>Anschreiben generieren</span>
                        </>
                      )}
                    </button>

                    {/* 3. DETAILS TOGGLE */}
                    {/* 3. DETAILS TOGGLE */}
                    <button
                      onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      className="
                            ml-auto px-4 py-2 
                            text-slate-500 hover:text-slate-800 
                            font-medium text-sm transition-colors cursor-pointer
                            hover:bg-slate-100 rounded-lg
                        "
                    >
                      {isExpanded ? 'Weniger anzeigen' : 'Details & Beschreibung'}
                    </button>
                  </div>
                </div>
              </div>

              {/* DETAILS AREA - Clean White with Separator */}
              {isExpanded && (
                <div
                  id={`job-details-${job.id}`}
                  className="border-t border-gray-100 bg-white rounded-b-xl overflow-hidden animate-in slide-in-from-top-2 duration-300 scroll-mt-24"
                >
                  <div className="p-8 sm:p-12 bg-slate-50/50">

                    {/* Badge & Header */}
                    <div className="flex items-center gap-3 mb-8 not-prose">
                      <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-100">
                        <span className="text-xl">📄</span>
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-widest m-0">
                          Stellenbeschreibung
                        </h3>
                        <p className="text-[10px] text-gray-400 font-mono">Original-Ausschreibung</p>
                      </div>
                    </div>

                    {/* Modernes Markdown Styling */}
                    <article className="
        prose prose-slate max-w-none 
        prose-headings:text-gray-900 prose-headings:font-bold
        prose-h1:text-3xl prose-h1:mb-8
        prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2
        prose-p:text-gray-600 prose-p:leading-relaxed
        prose-li:text-gray-600
        prose-strong:text-gray-900
        prose-ul:list-disc prose-ul:pl-5
      ">
                      <ReactMarkdown>{job.description}</ReactMarkdown>
                    </article>

                    {/* Footer Hinweis */}
                    <div className="mt-12 pt-6 border-t border-gray-100 not-prose">
                      <p className="text-xs text-gray-400 italic">
                        Ende der Stellenbeschreibung. Alle Angaben ohne Gewähr.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}