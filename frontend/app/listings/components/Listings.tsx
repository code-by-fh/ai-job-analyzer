"use client";
import {
  Loader2,
  Archive,
  AlertTriangle,
  Trash2,
  RotateCcw,
  X,
  Building2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth, fetchWithAuth } from "../../components/AuthProvider";
import { useLanguage } from "../../components/LanguageProvider";
import { useNotification } from "../../components/NotificationProvider";

// Components
import ApplicationModal from "../../components/ApplicationModal";
import ConfirmModal from "../../components/ConfirmModal";
import FilterBar from "../../components/FilterBar";
import JobCard from "../../components/JobCard/JobCard";
import JobBoard from "../../components/JobBoard";
import JobDetailModal from "../../components/JobDetailModal";
import PageWrapper from "../../components/PageWrapper";
import PageHeader from "../../components/PageHeader";
import SearchHeader from "../../components/SearchHeader";

// Hooks & Types
import { useCrawl } from "../../hooks/useCrawl";
import { useJobs } from "../../hooks/useJobs";
import { Job } from "../../lib/types";
import { logger } from "../../lib/logger";

interface ListingsProps {
  initialFilter: "all" | "favorite" | "no_favorite" | "applications";
  initialPlatformId?: number;
  initialPlatformName?: string;
  isArchived?: boolean;
}

export default function Listings({
  initialFilter,
  initialPlatformId,
  initialPlatformName,
  isArchived = false,
}: ListingsProps) {
  const { user, token, logout } = useAuth();
  const { t } = useLanguage();
  const { showSuccess, showError: showNotificationError } = useNotification();
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- STATE ---
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "date">(
    (searchParams.get("sort") as any) || "date",
  );
  const [filterType, setFilterType] = useState(initialFilter);
  const [searchText, setSearchText] = useState(
    searchParams.get("search") || "",
  );
  const [domainFilter, setDomainFilter] = useState(
    searchParams.get("domain") || "",
  );
  const [hasApplication, setHasApplication] = useState(
    searchParams.get("application") === "true",
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "",
  );
  const [platformIdFilter, setPlatformIdFilter] = useState<number | undefined>(
    initialPlatformId,
  );
  const [platformNameFilter, setPlatformNameFilter] = useState<
    string | undefined
  >(initialPlatformName);
  const [availableDomains, setAvailableDomains] = useState<
    { domain: string; count: number }[]
  >([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  useEffect(() => {
    const stored = localStorage.getItem("jobAgent_viewMode");
    if (stored === "board" || stored === "list") setViewMode(stored);
  }, []);
  const handleViewModeChange = (mode: "list" | "board") => {
    setViewMode(mode);
    localStorage.setItem("jobAgent_viewMode", mode);
  };

  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [initialJobs, setInitialJobs] = useState<Job[]>([]);

  // Generator & Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [modalJobId, setModalJobId] = useState("");
  const [modalJob, setModalJob] = useState<Job | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [companyToBulkDelete, setCompanyToBulkDelete] = useState<string | null>(
    null,
  );
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [keepFavorites, setKeepFavorites] = useState(true);
  const [keepApplications, setKeepApplications] = useState(true);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [platforms, setPlatforms] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [selectedJobForDetail, setSelectedJobForDetail] = useState<Job | null>(
    null,
  );

  useEffect(() => {
    if (token) {
      fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setPlatforms(data.map((p: any) => ({ id: p.id, name: p.name }))),
        )
        .catch((err) => logger.error({ err }, "Failed to fetch platforms"));
    }
  }, [token]);

  const handleBulkDeleteCompanyJobs = async () => {
    if (!companyToBulkDelete) return;
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs?company=${encodeURIComponent(companyToBulkDelete)}&keep_favorites=${keepFavorites}&keep_applications=${keepApplications}&permanent=${isArchived}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        fetchJobs(true);
        setSelectedJobIds([]);
      } else {
        setGlobalError("Failed to delete jobs");
        setTimeout(() => setGlobalError(null), 3000);
      }
    } catch (e) {
      setGlobalError("Error deleting jobs");
      setTimeout(() => setGlobalError(null), 3000);
    } finally {
      setCompanyToBulkDelete(null);
      setKeepFavorites(true);
      setKeepApplications(true);
    }
  };

  useEffect(() => {
    if (token && !initialDataLoaded && !initialPlatformId && !isArchived) {
      fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/dashboard-data?limit=10&offset=0&filter_type=${initialFilter}`,
      )
        .then((res) => {
          if (res.status === 401) {
            logout();
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (data) {
            setInitialJobs(data.jobs || []);
            setInitialDataLoaded(true);
          }
        })
        .catch((err) => logger.error({ err }, "Listings data fetch error"));
    }
  }, [token, initialDataLoaded, initialFilter, logout]);

  const {
    jobs,
    setJobs,
    fetchJobs,
    hasMore,
    isLoadingMore,
    globalError: jobsError,
    setGlobalError: setJobsError,
    jobToDelete,
    setJobToDelete,
    confirmDeleteJob,
    handleToggleFavorite,
    handleUpdateStatus,
    updateJob,
    bulkDeleteJobs,
    bulkRestoreJobs,
  } = useJobs({
    token,
    logout,
    filterType,
    sortBy,
    hasApplication,
    statusFilter,
    initialJobs: initialDataLoaded ? initialJobs : undefined,
    platformId: platformIdFilter,
    isArchived,
  });

  const onJobUpdate = useCallback(
    (data: any) => {
      setJobs((prev) =>
        prev.map((job) => (job.id === data.job_id ? { ...job, ...data } : job)),
      );
      setPendingIds((prev) => prev.filter((id) => id !== data.job_id));
      if (data.job_id) localStorage.removeItem(`gen_app_${data.job_id}`);
    },
    [setJobs],
  );

  const onNewJob = useCallback(
    (job: Job, crawlJobId?: string) => {
      if (job?.user_id === user?.id) {
        let shouldAdd = true;
        // Auto-archived jobs (below matching threshold) never enter the active list
        if (job.is_archived) shouldAdd = false;
        if (filterType === "favorite" && !job.is_favorite) shouldAdd = false;
        if (filterType === "no_favorite" && job.is_favorite) shouldAdd = false;

        if (shouldAdd) {
          setJobs((prevJobs) => {
            if (prevJobs.some((j) => j.id === job.id)) return prevJobs;
            return [job, ...prevJobs];
          });
        }
      }
      if (token) fetchJobs(true);
    },
    [user?.id, filterType, token, fetchJobs, setJobs],
  );

  const refreshJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetchWithAuth(
          `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}`,
        );
        if (!res.ok) return;
        const updatedJob = await res.json();
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, ...updatedJob } : j)),
        );
      } catch {}
    },
    [setJobs],
  );

  const onJobEvent = useCallback(
    (event: { type: string; job_id?: string; domain?: string }) => {
      if (event.type === "interview_prep_ready" && event.job_id) {
        refreshJob(event.job_id);
      }
      if (event.type === "company_profile_ready" && event.domain) {
        jobs
          .filter((j) => j.company_domain === event.domain)
          .forEach((j) => refreshJob(j.id));
      }
    },
    [jobs, refreshJob],
  );

  const { isCrawling, setIsCrawling, activeCrawls } = useCrawl({
    user,
    token,
    onJobUpdate,
    onNewJob,
    onJobEvent,
  });

  const globalError = jobsError;
  const setGlobalError = setJobsError;
  // Sync URL -> State (for back button / browser navigation)
  useEffect(() => {
    const urlParams = {
      filter: searchParams.get("filter") || "all",
      sort: searchParams.get("sort") || "score",
      search: searchParams.get("search") || "",
      domain: searchParams.get("domain") || "",
      status: searchParams.get("status") || "",
      application: searchParams.get("application") === "true",
      attention: searchParams.get("attention") === "true",
    };

    if (urlParams.filter !== filterType) setFilterType(urlParams.filter as any);
    if (urlParams.sort !== sortBy) setSortBy(urlParams.sort as any);
    if (urlParams.search !== searchText) setSearchText(urlParams.search);
    if (urlParams.domain !== domainFilter) setDomainFilter(urlParams.domain);
    if (urlParams.status !== statusFilter) setStatusFilter(urlParams.status);
    if (urlParams.application !== hasApplication)
      setHasApplication(urlParams.application);
  }, [searchParams]);

  // Sync State -> URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("filter", filterType);
      if (sortBy !== "score") params.set("sort", sortBy);
      if (searchText) params.set("search", searchText);
      if (domainFilter) params.set("domain", domainFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (hasApplication) params.set("application", "true");
      if (platformIdFilter) params.set("platform_id", String(platformIdFilter));
      if (platformNameFilter) params.set("platform_name", platformNameFilter);

      const newQuery = params.toString();
      const currentQuery = searchParams.toString();

      if (!isArchived && newQuery !== currentQuery) {
        router.replace(`/listings${newQuery ? `?${newQuery}` : ""}`, {
          scroll: false,
        });
      }
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [
    filterType,
    sortBy,
    searchText,
    domainFilter,
    statusFilter,
    hasApplication,
    platformIdFilter,
    platformNameFilter,
    isArchived,
    router,
    searchParams,
  ]);

  const handleFilterChange = (
    newFilter: "all" | "favorite" | "no_favorite" | "applications",
  ) => {
    setSelectedJobIds([]); // Clear selections on filter change
    setFilterType(newFilter);
  };

  const handleSelectJob = (jobId: string, selected: boolean) => {
    setSelectedJobIds((prev) =>
      selected ? [...prev, jobId] : prev.filter((id) => id !== jobId),
    );
  };

  const handleBulkDelete = () => {
    if (!selectedJobIds.length) return;
    setIsBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    setIsBulkDeleteModalOpen(false);
    setIsBulkDeleting(true);
    const success = await bulkDeleteJobs(selectedJobIds);
    if (success) {
      setSelectedJobIds([]);
    }
    setIsBulkDeleting(false);
  };

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchJobs(false);
        }
      },
      { threshold: 1.0 },
    );

    const trigger = document.getElementById("infinite-scroll-trigger");
    if (trigger) observer.observe(trigger);

    return () => {
      if (trigger) observer.unobserve(trigger);
    };
  }, [hasMore, isLoadingMore, jobs]);

  useEffect(() => {
    if (!importJobId) return;
    const crawl = activeCrawls.get(importJobId);
    if (!crawl) return;

    if (crawl.show_success) {
      const skipped = crawl.jobs_skipped ?? 0;
      const saved = crawl.jobs_saved ?? 0;
      if (saved > 0) {
        showSuccess(t("jobImportSuccess"));
      } else if (skipped > 0) {
        showSuccess(t("jobImportAlreadyExists"));
      }
      setImportJobId(null);
    } else if (crawl.status === "failed") {
      showNotificationError(crawl.error_message || t("jobImportFailed"));
      setImportJobId(null);
    }
  }, [activeCrawls, importJobId, showSuccess, showNotificationError, t]);

  const startSearch = async () => {
    if (!user?.is_profile_complete) {
      setGlobalError(t("completeProfileFirst"));
      setTimeout(() => setGlobalError(null), 3000);
      return;
    }
    if (!query) return;

    try {
      const parsed = new URL(query);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        setGlobalError(t("invalidUrlProtocol"));
        setTimeout(() => setGlobalError(null), 3000);
        return;
      }
    } catch (_) {
      setGlobalError(t("invalidUrl"));
      setTimeout(() => setGlobalError(null), 3000);
      return;
    }

    setIsCrawling(true);
    setSearchError(null);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/scraper/import-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: query, user_id: user?.id }),
      });

      if (!response.ok) {
        const errorMsg = response.status === 401
          ? "Authentifizierung erforderlich. Bitte neu anmelden."
          : `Fehler beim Analysieren der URL (${response.status})`;
        setSearchError(errorMsg);
        setTimeout(() => setSearchError(null), 5000);
        setIsCrawling(false);
        return;
      }

      const result = await response.json();
      if (result.job_id) setImportJobId(result.job_id);
      setQuery("");
    } catch (e) {
      setSearchError("Fehler beim Analysieren der URL. Bitte versuchen Sie es später erneut.");
      setTimeout(() => setSearchError(null), 5000);
      setIsCrawling(false);
    }
  };

  const handleGenerate = async (job: Job) => {
    if (job.application_draft) {
      setModalContent(job.application_draft);
      setModalJobId(job.id);
      setModalJob(job);
      setModalOpen(true);
      return;
    }

    setPendingIds((prev) => [...prev, job.id]);
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/generate`,
        {
          method: "POST",
        },
      );
    } catch (e) {
      setPendingIds((prev) => prev.filter((id) => id !== job.id));
    }
  };

  const handleRegenerate = async (job: Job, notes: string) => {
    setPendingIds((prev) => [...prev, job.id]);
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ improvement_notes: notes || null }),
        },
      );
    } catch (e) {
      setPendingIds((prev) => prev.filter((id) => id !== job.id));
    }
  };

  const handleCancelGenerate = async (jobId: string) => {
    setPendingIds((prev) => prev.filter((id) => id !== jobId));
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/cancel-generation`,
        {
          method: "POST",
        },
      );
    } catch (e) {
      // Silently handle - user is already canceling
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchWithAuth(
      `${process.env.NEXT_PUBLIC_API_URL}/jobs/counts${isArchived ? "?is_archived=true" : ""}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setAvailableDomains(data.domain_counts);
          setStatusCounts(data.status_counts);
        }
      })
      .catch(() => {});
  }, [token, jobs]);

  // Keep the detail modal in sync when the underlying job is updated (e.g. after generation)
  useEffect(() => {
    if (!selectedJobForDetail) return;
    const updated = jobs.find((j) => j.id === selectedJobForDetail.id);
    if (updated && updated !== selectedJobForDetail) {
      setSelectedJobForDetail(updated);
    }
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    return jobs.filter((job) => {
      const q = searchText.toLowerCase();
      const matchesSearch =
        !q ||
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q);
      const matchesDomain = !domainFilter || job.company === domainFilter;
      return matchesSearch && matchesDomain;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, searchText, domainFilter]);

  return (
    <PageWrapper>
      <ApplicationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        content={modalContent}
        jobId={modalJobId}
        currentStatus={modalJob?.status || "OPEN"}
        onStatusUpdate={handleUpdateStatus}
        token={token}
      />

      <JobDetailModal
        isOpen={!!selectedJobForDetail}
        onClose={() => setSelectedJobForDetail(null)}
        job={selectedJobForDetail!}
        isGenerating={
          selectedJobForDetail
            ? pendingIds.includes(selectedJobForDetail.id) ||
              selectedJobForDetail.status === "GENERATING"
            : false
        }
        onGenerate={handleGenerate}
        onRegenerate={handleRegenerate}
        onCancelGenerate={handleCancelGenerate}
        onStatusUpdate={handleUpdateStatus}
        onToggleFavorite={handleToggleFavorite}
        onUpdateJob={updateJob}
        onArchive={setJobToDelete}
      />

      <ConfirmModal
        isOpen={!!jobToDelete}
        onClose={() => setJobToDelete(null)}
        onConfirm={confirmDeleteJob}
        title={isArchived ? t("deletePermanent" as any) : t("archiveJob")}
        message={
          isArchived ? t("deletePermanentConfirm" as any) : t("archiveConfirm")
        }
        confirmText={isArchived ? t("deletePermanent" as any) : t("archiveJob")}
        cancelText={t("cancel")}
        isDestructive={isArchived}
      />

      <ConfirmModal
        isOpen={!!companyToBulkDelete}
        onClose={() => {
          setCompanyToBulkDelete(null);
          setKeepFavorites(true);
          setKeepApplications(true);
        }}
        onConfirm={handleBulkDeleteCompanyJobs}
        title={
          isArchived
            ? t("deleteAllFromCompany").replace(
                "{company}",
                companyToBulkDelete || "",
              )
            : t("archiveAllFromCompany").replace(
                "{company}",
                companyToBulkDelete || "",
              )
        }
        message={
          isArchived ? t("deletePermanentConfirm" as any) : t("areYouCertain")
        }
        confirmText={isArchived ? t("deletePermanent" as any) : t("archiveJob")}
        cancelText={t("cancel")}
        isDestructive={isArchived}
      >
        <div className="mt-2 flex flex-col gap-1.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="keepFavoritesBulkCheckboxCompany"
              checked={keepFavorites}
              onChange={(e) => setKeepFavorites(e.target.checked)}
              className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
            />
            <label
              htmlFor="keepFavoritesBulkCheckboxCompany"
              className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium"
            >
              {t("keepFavorites")}
            </label>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              id="keepApplicationsBulkCheckboxCompany"
              checked={keepApplications}
              onChange={(e) => setKeepApplications(e.target.checked)}
              className="appearance-none w-4 h-4 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 checked:bg-indigo-500 checked:border-indigo-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors"
            />
            <label
              htmlFor="keepApplicationsBulkCheckboxCompany"
              className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer font-medium"
            >
              {t("keepApplications")}
            </label>
          </div>
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        onConfirm={confirmBulkDelete}
        title={isArchived ? t("deletePermanent" as any) : t("archiveSelected")}
        message={
          isArchived ? t("deletePermanentConfirm" as any) : t("areYouCertain")
        }
        confirmText={isArchived ? t("deletePermanent" as any) : t("archiveJob")}
        cancelText={t("cancel")}
        isDestructive={isArchived}
      />

      {!isArchived && (
        <>
          <SearchHeader
            jobCount={jobs.length}
            query={query}
            setQuery={setQuery}
            onSearch={startSearch}
            isCrawling={isCrawling}
            isProfileComplete={!!user?.is_profile_complete}
            headlineMsgkey="jobIntelligence"
            searchError={searchError}
          />
        </>
      )}
      {isArchived && (
        <PageHeader
          title={t("archivePageTitle")}
          subtitle={t("archiveDescription")}
        />
      )}

      {/* GLOBAL ERROR BANNER */}
      {globalError && (
        <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle size={18} /> {globalError}
          </span>
        </div>
      )}

      <FilterBar
        filterType={filterType}
        setFilterType={handleFilterChange}
        sortBy={sortBy}
        setSortBy={setSortBy}
        searchText={searchText}
        setSearchText={setSearchText}
        domainFilter={domainFilter}
        setDomainFilter={setDomainFilter}
        availableDomains={availableDomains}
        hasApplication={hasApplication}
        setHasApplication={setHasApplication}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        statusCounts={statusCounts}
        platformFilter={platformIdFilter}
        setPlatformFilter={(id) => {
          setPlatformIdFilter(id);
          setPlatformNameFilter(
            id ? platforms.find((p) => p.id === id)?.name : undefined,
          );
        }}
        availablePlatforms={platforms}
        viewMode={viewMode}
        setViewMode={isArchived ? undefined : handleViewModeChange}
      />

      {/* JOB LIST */}
      <div className="grid gap-6">
        {visibleJobs.length > 0 && !isArchived && (
          <div className="flex justify-start items-center px-1 mb-[-4px]">
            <label className="group/cb relative flex items-center justify-center cursor-pointer gap-2.5">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={
                  visibleJobs.length > 0 &&
                  visibleJobs.every((job) => selectedJobIds.includes(job.id))
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    const visibleIds = visibleJobs.map((j) => j.id);
                    setSelectedJobIds((prev) =>
                      Array.from(new Set([...prev, ...visibleIds])),
                    );
                  } else {
                    const visibleIds = visibleJobs.map((j) => j.id);
                    setSelectedJobIds((prev) =>
                      prev.filter((id) => !visibleIds.includes(id)),
                    );
                  }
                }}
              />
              <div
                className={`w-[22px] h-[22px] rounded-md border-2 transition-all duration-200 flex items-center justify-center
                                ${
                                  visibleJobs.length > 0 &&
                                  visibleJobs.every((job) =>
                                    selectedJobIds.includes(job.id),
                                  )
                                    ? "bg-indigo-500 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                                    : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover/cb:border-indigo-400 dark:group-hover/cb:border-indigo-500 shadow-sm"
                                }`}
              >
                <svg
                  className={`w-3.5 h-3.5 text-white transition-transform duration-300 ${visibleJobs.length > 0 && visibleJobs.every((job) => selectedJobIds.includes(job.id)) ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 group-hover/cb:text-indigo-600 dark:group-hover/cb:text-indigo-400 transition-colors select-none">
                {t("selectAllVisible")} ({visibleJobs.length})
              </span>
            </label>
          </div>
        )}

        {!isArchived && viewMode === "board" ? (
          <div className="-mx-4 sm:mx-0 pt-2 pb-4">
            <JobBoard
              jobs={visibleJobs}
              onStatusUpdate={handleUpdateStatus}
              onArchive={setJobToDelete}
              onOpenDetail={setSelectedJobForDetail}
              statusCounts={statusCounts}
            />
          </div>
        ) : (
          visibleJobs.map((job, index) => (
            <JobCard
              key={job.id}
              job={job}
              isGenerating={
                pendingIds.includes(job.id) || job.status === "GENERATING"
              }
              onGenerate={handleGenerate}
              onRegenerate={handleRegenerate}
              onCancelGenerate={handleCancelGenerate}
              onStatusUpdate={handleUpdateStatus}
              onToggleFavorite={handleToggleFavorite}
              isSelected={selectedJobIds.includes(job.id)}
              onSelect={handleSelectJob}
              onUpdateJob={updateJob}
              onArchive={setJobToDelete}
            />
          ))
        )}

        {/* Infinite Scroll Trigger */}
        {hasMore && (
          <div
            id="infinite-scroll-trigger"
            className="h-10 flex justify-center items-center pb-20"
          >
            {isLoadingMore && (
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            )}
          </div>
        )}
      </div>
      {/* Bulk Actions Floating Bar */}
      {selectedJobIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-8 duration-500 ease-out w-[calc(100vw-2rem)] sm:w-auto">
          <div className="flex flex-col sm:flex-row items-center gap-1 p-2 sm:p-1 bg-slate-900/95 dark:bg-white/95 backdrop-blur-3xl rounded-3xl sm:rounded-2xl border border-white/10 dark:border-slate-200/80 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)] transition-all duration-300">
            
            {/* Mobile Header */}
            <div className="flex sm:hidden items-center justify-between w-full px-3 py-2 mb-1 border-b border-white/5 dark:border-slate-100/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500 text-[12px] font-black text-white shadow-lg shadow-indigo-500/30">
                  {selectedJobIds.length}
                </div>
                <span className="text-[13px] font-black text-slate-100 dark:text-slate-900 uppercase tracking-widest">
                  {t("selected")}
                </span>
              </div>
              <button
                onClick={() => setSelectedJobIds([])}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 dark:bg-slate-50 text-slate-400 hover:text-rose-500 active:scale-90 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Desktop Selection Info */}
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-r border-white/10 dark:border-slate-100/50 shrink-0">
              <div className="flex shrink-0 h-5 w-5 items-center justify-center rounded-md bg-indigo-500 text-[10px] font-black text-white shadow-lg shadow-indigo-500/20">
                {selectedJobIds.length}
              </div>
              <span className="text-[11px] font-black text-slate-100 dark:text-slate-900 tracking-tight uppercase opacity-90 whitespace-nowrap">
                {t("selected")}
              </span>
            </div>

            {/* Actions Area */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-1 px-1 sm:px-2 w-full sm:w-auto py-1 sm:py-0">
              {(() => {
                const companies = Array.from(
                  new Set(
                    selectedJobIds
                      .map((id) => jobs.find((j) => j.id === id)?.company)
                      .filter(Boolean),
                  ),
                );
                if (companies.length === 1 && companies[0]) {
                  return (
                    <button
                      onClick={() => setCompanyToBulkDelete(companies[0] as string)}
                      className="group flex items-center justify-center sm:justify-start gap-2 px-4 py-2.5 sm:py-1.5 rounded-xl sm:rounded-xl text-[13px] sm:text-[12px] font-bold transition-all text-indigo-400 hover:text-white hover:bg-white/5 dark:text-indigo-600 dark:hover:bg-indigo-50 bg-white/5 sm:bg-transparent dark:bg-slate-50 sm:dark:bg-transparent cursor-pointer active:scale-95 whitespace-nowrap"
                    >
                      <Building2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                      <span className="hidden md:inline">
                        {isArchived
                          ? t("deleteAllFromCompany").replace("{company}", companies[0] as string)
                          : t("archiveAllFromCompany").replace("{company}", companies[0] as string)}
                      </span>
                      <span className="md:hidden">
                        {isArchived
                          ? t("deleteAllFromCompany").replace(" {company}", "")
                          : t("archiveAllFromCompany").replace(" {company}", "")}
                      </span>
                    </button>
                  );
                }
                return null;
              })()}

              {isArchived && (
                <button
                  onClick={async () => {
                    setIsBulkDeleting(true);
                    const success = await bulkRestoreJobs(selectedJobIds);
                    if (success) {
                      setSelectedJobIds([]);
                      fetchJobs(true);
                    }
                    setIsBulkDeleting(false);
                  }}
                  disabled={isBulkDeleting}
                  className="group flex items-center justify-center sm:justify-start gap-2 px-4 py-2.5 sm:py-1.5 rounded-xl sm:rounded-xl text-[13px] sm:text-[12px] font-bold transition-all text-emerald-400 hover:text-white hover:bg-emerald-500/20 dark:text-emerald-700 dark:hover:bg-emerald-50 bg-white/5 sm:bg-transparent dark:bg-slate-50 sm:dark:bg-transparent cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4 sm:w-3.5 sm:h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <span>{t("restoreJob")}</span>
                </button>
              )}
              
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className={`
                  group flex items-center justify-center sm:justify-start gap-2 px-5 py-3 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-xl text-[13px] sm:text-[12px] font-bold transition-all active:scale-95 shadow-sm whitespace-nowrap
                  ${
                    isBulkDeleting
                      ? "text-slate-500 bg-slate-800/50 cursor-not-allowed"
                      : isArchived
                        ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white dark:bg-rose-50 dark:text-rose-600 dark:hover:bg-rose-500 dark:hover:text-white"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30 dark:shadow-none"
                  }
                `}
              >
                {isBulkDeleting ? (
                  <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin" />
                ) : isArchived ? (
                  <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 opacity-90 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <Archive className="w-4 h-4 sm:w-3.5 sm:h-3.5 opacity-90 group-hover:opacity-100 transition-opacity" />
                )}
                <span>
                   <span className="hidden sm:inline">{isArchived ? t("deletePermanent" as any) : t("archiveSelected")}</span>
                   <span className="sm:hidden">{isArchived ? t("deletePermanent" as any) : t("archiveJob")}</span>
                </span>
              </button>
            </div>

            {/* Desktop Clear Button */}
            <div className="hidden sm:flex pl-0.5 border-l border-white/10 dark:border-slate-100/50 shrink-0">
              <button
                onClick={() => setSelectedJobIds([])}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-white/5 dark:hover:bg-slate-50 transition-all cursor-pointer group active:scale-90"
                title={t("close")}
              >
                <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
