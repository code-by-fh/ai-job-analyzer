"use client";
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ApplicationModal from './components/ApplicationModal';
import CrawlStatus, { CrawlJob } from './components/CrawlStatus';
import { useAuth } from './components/AuthProvider';
import { useRouter } from 'next/navigation';

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
  is_favorite?: boolean;
}

export default function Home() {
  const { user, token, logout } = useAuth();
  const router = useRouter();

  // --- STATE ---
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');

  // Generator & Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [modalJobId, setModalJobId] = useState('');

  const [isCrawling, setIsCrawling] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [activeCrawls, setActiveCrawls] = useState<Map<string, CrawlJob>>(new Map());

  // Redirect if not logged in
  useEffect(() => {
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

  const fetchCrawlStatus = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_SCRAPER_URL}/crawl-status?user_id=${user.id}`);
      const data = await res.json();
      if (data.jobs && data.jobs.length > 0) {
        const jobsMap = new Map<string, CrawlJob>();
        data.jobs.forEach((job: CrawlJob) => {
          if (job.status !== 'completed' && !(job.analysis_completed >= job.total && job.total > 0)) {
            jobsMap.set(job.job_id, job);
          }
        });
        setActiveCrawls(jobsMap);
        setIsCrawling(jobsMap.size > 0);
      } else {
        setActiveCrawls(new Map());
        setIsCrawling(false);
      }
    } catch (e) {
      console.error("Fehler beim Laden des Crawl-Status:", e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchJobs();
      fetchCrawlStatus();
    }

    // Check initial status
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/status`)
      .then(res => res.json())
      .then(data => { if (data.crawling) setIsCrawling(true); })
      .catch(() => { });

    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_API_WS_URL}/ws`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('[WebSocket] Received:', data);

      if (data.type === "crawl_job_started") {
        if (data.user_id === user?.id) {
          setActiveCrawls(prev => {
            const existing = prev.get(data.job_id);
            return new Map(prev).set(data.job_id, {
              ...existing,
              job_id: data.job_id,
              platform: data.platform,
              total: existing?.total || 0,
              scraping_completed: existing?.scraping_completed || 0,
              analysis_completed: existing?.analysis_completed || 0,
              status: 'starting'
            });
          });
          setIsCrawling(true);
        }
      }
      else if (data.type === "crawl_job_progress") {
        if (data.user_id === user?.id) {
          setActiveCrawls(prev => {
            const existing = prev.get(data.job_id);
            return new Map(prev).set(data.job_id, {
              ...existing,
              job_id: data.job_id,
              platform: data.platform,
              total: data.total,
              scraping_completed: data.scraping_completed,
              analysis_completed: existing?.analysis_completed || 0,
              status: 'crawling'
            });
          });
        }
      }
      else if (data.type === "job_analysis_started") {
        if (data.user_id === user?.id) {
          setActiveCrawls(prev => {
            const existing = prev.get(data.job_id);
            if (existing) {
              const analyzingJobs = existing.analyzing_jobs || [];
              const allJobTitles = existing.all_job_titles || [];
              console.log('[DEBUG] job_analysis_started:', {
                job_title: data.job_title,
                existing_all_job_titles: allJobTitles,
                will_add: !allJobTitles.includes(data.job_title)
              });
              const newAllJobTitles = allJobTitles.includes(data.job_title)
                ? allJobTitles
                : [...allJobTitles, data.job_title];
              console.log('[DEBUG] Updated all_job_titles:', newAllJobTitles);
              return new Map(prev).set(data.job_id, {
                ...existing,
                current_job_title: data.job_title,
                analysis_completed: data.analysis_completed,
                analyzing_jobs: [...analyzingJobs, data.job_title],
                all_job_titles: newAllJobTitles
              });
            }
            return prev;
          });
        }
      }
      else if (data.type === "job_analysis_finished") {
        if (data.user_id === user?.id) {
          setActiveCrawls(prev => {
            const existing = prev.get(data.job_id);
            if (existing) {
              const analyzingJobs = (existing.analyzing_jobs || []).filter(
                title => title !== data.job_title
              );
              return new Map(prev).set(data.job_id, {
                ...existing,
                analyzing_jobs: analyzingJobs
              });
            }
            return prev;
          });
        }
      }
      else if (data.type === "crawl_job_completed") {
        if (data.user_id === user?.id) {
          // First, show success message
          setActiveCrawls(prev => {
            const existing = prev.get(data.job_id);
            if (existing) {
              return new Map(prev).set(data.job_id, {
                ...existing,
                show_success: true
              });
            }
            return prev;
          });

          // Then remove after 5 seconds
          setTimeout(() => {
            setActiveCrawls(prev => {
              const newMap = new Map(prev);
              newMap.delete(data.job_id);
              if (newMap.size === 0) {
                setIsCrawling(false);
              }
              return newMap;
            });
          }, 5000);

          if (token) fetchJobs();
        }
      }
      else if (data.type === "crawl_completed") {
        setIsCrawling(false);
        setActiveCrawls(new Map());
        if (token) fetchJobs();
      }
      else if (data.type === "new_job") {
        if (data.job?.user_id === user?.id) {
          setJobs(prevJobs => [data.job, ...prevJobs]);

          // Update jobs_saved counter and remove from analyzing_jobs for the crawl job
          if (data.crawl_job_id) {
            setActiveCrawls(prev => {
              const existing = prev.get(data.crawl_job_id);
              if (existing) {
                const analyzingJobs = (existing.analyzing_jobs || []).filter(
                  title => title !== data.job.title
                );
                return new Map(prev).set(data.crawl_job_id, {
                  ...existing,
                  jobs_saved: (existing.jobs_saved || 0) + 1,
                  analyzing_jobs: analyzingJobs
                });
              }
              return prev;
            });
          }
        }
      }
      else if (data.type === "job_update") {
        if (data.user_id === user?.id) {
          setJobs(prev => prev.map(job => (job.id === data.job_id ? { ...job, ...data } : job)));
        }
        setPendingIds(prev => prev.filter(id => id !== data.job_id));
      }
      else if (data.type === "global_error") {
        setGlobalError(data.message);
        setTimeout(() => setGlobalError(null), 8000);
      }
    };
    return () => ws.close();
  }, [token, user]);

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

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Möchten Sie diesen Job wirklich löschen?')) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setJobs(prev => prev.filter(job => job.id !== jobId));
      }
    } catch (e) {
      console.error('Error deleting job:', e);
    }
  };

  const handleToggleFavorite = async (jobId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/favorite`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(prev => prev.map(job =>
          job.id === jobId ? { ...job, is_favorite: data.is_favorite } : job
        ));
      }
    } catch (e) {
      console.error('Error toggling favorite:', e);
    }
  };

  // --- HELPER ---
  const timeAgo = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
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
    if (score >= 80) return 'text-emerald-500 dark:text-emerald-400 border-emerald-500/50';
    if (score >= 50) return 'text-amber-500 dark:text-amber-400 border-amber-500/50';
    return 'text-rose-500 dark:text-rose-400 border-rose-500/50';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <ApplicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        content={modalContent}
        jobId={modalJobId}
      />

      {/* DASHBOARD HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800/50">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
            Job Intelligence
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {jobs.length} Opportunities detected
          </p>
        </div>

        {/* SEARCH BAR (Deep Intelligence Style) */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className={`
                flex-1 md:w-96 flex items-center 
                bg-white dark:bg-slate-900 
                border-2 border-slate-100 dark:border-slate-800 
                rounded-xl px-4 py-3 
                transition-all duration-300
                focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10 focus-within:dark:shadow-[0_0_20px_rgba(99,102,241,0.2)]
             `}>
            <span className="text-slate-400 mr-3">⚡</span>
            <input
              className="w-full bg-transparent focus:outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Analyze new market target..."
              disabled={isCrawling}
              onKeyDown={(e) => e.key === 'Enter' && startSearch()}
            />
          </div>

          <button
            onClick={startSearch}
            disabled={isCrawling}
            className={`
                  h-[50px] px-6 rounded-xl font-bold text-white shadow-lg transition-all duration-300
                  ${isCrawling
                ? 'bg-slate-300 dark:bg-slate-800 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 shadow-indigo-500/30'
              }
                `}
          >
            {isCrawling ? <span className="animate-spin text-xl">⚙️</span> : 'SCAN'}
          </button>
        </div>
      </div>

      {/* GLOBAL ERROR BANNER */}
      {globalError && (
        <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>⚠️ {globalError}</span>
        </div>
      )}

      {/* CRAWL STATUS */}
      {activeCrawls.size > 0 && (
        <CrawlStatus jobs={Array.from(activeCrawls.values())} />
      )}

      {/* FILTER & SORT */}
      <div className="flex justify-end gap-2 text-sm text-slate-500">
        <span className="self-center mr-2">Sort by:</span>
        <button onClick={() => setSortBy('score')} className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${sortBy === 'score' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Relevance</button>
        <button onClick={() => setSortBy('date')} className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${sortBy === 'date' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Newest</button>
      </div>

      {/* JOB LIST */}
      <div className="grid gap-6">
        {jobs.length === 0 && !isCrawling && (
          <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <p className="text-slate-400 dark:text-slate-500">System waiting for input.</p>
          </div>
        )}

        {sortedJobs.map((job) => {
          const isExpanded = expandedJobId === job.id;
          const isGenerating = pendingIds.includes(job.id) || job.status === 'GENERATING';
          const scoreClass = getScoreColor(job.match_score);

          return (
            <div key={job.id}
              className={`
                    group relative overflow-hidden rounded-2xl border transition-all duration-300
                    ${isExpanded
                  ? 'bg-white dark:bg-slate-900 border-indigo-500/30 dark:border-indigo-500/50 shadow-2xl dark:shadow-[0_0_40px_rgba(0,0,0,0.4)]'
                  : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg dark:hover:shadow-none'
                }
                `}
            >
              {/* Glow Effect (Dark Mode) */}
              <div className={`absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none ${isExpanded ? 'opacity-100' : ''}`} />

              <div className="p-6 sm:p-8 flex flex-col sm:flex-row gap-8 relative z-10">
                {/* Match Score Indicator - Enhanced */}
                <div className="flex-shrink-0 pt-1">
                  <div className={`
                        relative w-20 h-20 rounded-2xl flex flex-col items-center justify-center border-2 
                        backdrop-blur-sm transition-all duration-300 group-hover:scale-105
                        ${scoreClass}
                        ${job.match_score >= 80
                      ? 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/20 dark:to-teal-500/20 shadow-lg shadow-emerald-500/20 dark:shadow-emerald-500/40'
                      : job.match_score >= 50
                        ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/20 dark:to-orange-500/20 shadow-lg shadow-amber-500/20 dark:shadow-amber-500/40'
                        : 'bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-500/20 dark:to-pink-500/20 shadow-lg shadow-rose-500/20 dark:shadow-rose-500/40'
                    }
                   `}>
                    <span className="text-2xl font-black tracking-tight">{Math.round(job.match_score)}</span>
                    <span className="text-[9px] uppercase font-bold opacity-80 tracking-wider">match</span>
                    {/* Glow ring effect */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 animate-pulse"
                      style={{
                        boxShadow: job.match_score >= 80
                          ? '0 0 20px rgba(16, 185, 129, 0.4)'
                          : job.match_score >= 50
                            ? '0 0 20px rgba(245, 158, 11, 0.4)'
                            : '0 0 20px rgba(244, 63, 94, 0.4)'
                      }} />
                  </div>
                </div>

                <div className="flex-grow min-w-0">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{job.title}</h2>
                      <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mt-1">{job.company}</div>
                    </div>
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/50 px-2 py-1 rounded">
                      {timeAgo(job.created_at)}
                    </span>
                  </div>

                  {/* AI Reasoning */}
                  <div className="mb-6 bg-slate-50 dark:bg-slate-950/40 p-5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-indigo-500 text-sm">✨</span>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Analysis</span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed">
                      <ReactMarkdown components={{ p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} /> }}>
                        {job.reasoning}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* BUTTON CONTAINER - Modern Responsive Layout */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/30 mt-2">
                    {/* PRIMARY ACTIONS GROUP */}
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      {job.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer"
                          className="group/apply relative min-w-[160px] px-4 py-2.5 bg-white/80 dark:bg-slate-800/40 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold hover:bg-white dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600/80 hover:shadow-lg dark:hover:shadow-slate-900/50 transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 overflow-hidden active:scale-95"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-slate-50/50 to-transparent dark:from-slate-700/20 dark:to-transparent opacity-0 group-hover/apply:opacity-100 transition-opacity duration-300" />
                          <span className="relative text-sm group-hover/apply:rotate-45 transition-transform duration-300">↗</span>
                          <span className="relative">Apply Source</span>
                        </a>
                      )}

                      <button
                        onClick={() => handleGenerate(job)}
                        disabled={isGenerating}
                        className={`
                          group/generate relative min-w-[200px] px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer overflow-hidden
                          ${job.application_draft
                            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/15 dark:to-teal-500/15 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-300/60 dark:border-emerald-500/30 hover:border-emerald-400 dark:hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/25 dark:hover:shadow-emerald-500/30 active:scale-95'
                            : 'bg-gradient-to-r from-indigo-600 to-indigo-500 dark:from-indigo-600 dark:to-purple-600 text-white border-2 border-indigo-500/50 dark:border-indigo-400/30 hover:from-indigo-500 hover:to-indigo-400 dark:hover:from-indigo-500 dark:hover:to-purple-500 shadow-lg shadow-indigo-500/30 dark:shadow-[0_0_20px_rgba(99,102,241,0.5)] hover:shadow-xl hover:shadow-indigo-500/40 dark:hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] active:scale-95'}
                          disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:shadow-lg
                        `}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover/generate:opacity-100 transition-opacity duration-300" />
                        <span className="relative text-base">
                          {isGenerating ? <span className="animate-spin">↻</span> : job.application_draft ? '✓' : '⚡'}
                        </span>
                        <span className="relative">{isGenerating ? 'Processing...' : job.application_draft ? 'View Application' : 'Generate Application'}</span>
                      </button>
                    </div>

                    {/* SECONDARY ACTIONS GROUP */}
                    <div className="flex items-center gap-2 sm:border-l sm:border-slate-200 sm:dark:border-slate-800/50 sm:pl-3">
                      <button
                        onClick={() => handleToggleFavorite(job.id, job.is_favorite || false)}
                        className="px-3 py-2 rounded-lg text-xl transition-all duration-200 hover:scale-110 hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer active:scale-95"
                        title={job.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {job.is_favorite ? '⭐' : '☆'}
                      </button>

                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        className="px-3 py-2 rounded-lg text-lg text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:scale-110 transition-all duration-200 cursor-pointer active:scale-95"
                        title="Delete job"
                      >
                        🗑️
                      </button>

                      <button onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                        className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer active:scale-95 flex items-center gap-1.5"
                      >
                        <span>{isExpanded ? 'Close Details' : 'View Details'}</span>
                        <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* DETAILS PANEL */}
              {isExpanded && (
                <div id={`job-details-${job.id}`} className="border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-black/20 animate-in slide-in-from-top-4 duration-300">
                  <div className="p-8 sm:p-12">
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown>{job.description}</ReactMarkdown>
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