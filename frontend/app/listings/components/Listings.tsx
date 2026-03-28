"use client";
import {
  Loader2,
  Archive,
  AlertTriangle,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth, fetchWithAuth } from "../../components/AuthProvider";
import { useLanguage } from "../../components/LanguageProvider";

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
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- STATE ---
  const [query, setQuery] = useState("");
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

  const { isCrawling, setIsCrawling } = useCrawl({
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
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/scraper/import-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: query, user_id: user?.id }),
      });
      setQuery("");
    } catch (e) {
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
          />
          <p className="text-sm text-slate-500 dark:text-slate-400 -mt-2 mb-2 px-1">
            {t("listingsDescription")}
          </p>
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

        {visibleJobs.length === 0 && !isCrawling && (
          <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <p className="text-slate-400 dark:text-slate-500">
              {isArchived ? t("archiveEmpty") : t("systemWaiting")}
            </p>
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-white dark:bg-slate-900 shadow-2xl dark:shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-slate-800 rounded-full px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {selectedJobIds.length} {t("selected")}
            </span>

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
                  <>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                    <button
                      onClick={() =>
                        setCompanyToBulkDelete(companies[0] as string)
                      }
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 cursor-pointer active:scale-95 whitespace-nowrap border border-indigo-200/50 dark:border-indigo-500/30"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      <span className="hidden sm:inline">
                        {isArchived
                          ? t("deleteAllFromCompany").replace(
                              "{company}",
                              companies[0] as string,
                            )
                          : t("archiveAllFromCompany").replace(
                              "{company}",
                              companies[0] as string,
                            )}
                      </span>
                      <span className="sm:hidden">
                        {isArchived
                          ? t("deleteAllFromCompany").replace(" {company}", "")
                          : t("archiveAllFromCompany").replace(
                              " {company}",
                              "",
                            )}
                      </span>
                    </button>
                  </>
                );
              }
              return null;
            })()}

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
            {isArchived && (
              <button
                onClick={async () => {
                  setIsBulkDeleting(true);
                  const success = await bulkRestoreJobs(selectedJobIds);
                  if (success) {
                    setSelectedJobIds([]);
                    fetchJobs(true); // Ensure counts update
                  }
                  setIsBulkDeleting(false);
                }}
                disabled={isBulkDeleting}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all bg-emerald-50 hover:bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:text-emerald-400 cursor-pointer active:scale-95 border border-emerald-200/50 dark:border-emerald-500/30"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">{t("restoreJob")}</span>
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className={`
                                flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all
                                ${
                                  isBulkDeleting
                                    ? "bg-indigo-100 text-indigo-400 dark:bg-indigo-900/30"
                                    : "bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 cursor-pointer active:scale-95"
                                }
                            `}
            >
              {isBulkDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isArchived ? (
                <Trash2 className="w-4 h-4" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {isArchived ? t("deletePermanent" as any) : t("archiveSelected")}
            </button>
            <button
              onClick={() => setSelectedJobIds([])}
              className="ml-2 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
