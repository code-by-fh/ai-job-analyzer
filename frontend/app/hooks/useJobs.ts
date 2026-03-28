import { useState, useEffect, useCallback, useRef } from "react";
import { logger } from "../lib/logger";
import { Job } from "../lib/types";
import { JobStatus } from "../components/JobStatusBadge";
import { fetchWithAuth } from "../components/AuthProvider";

interface UseJobsProps {
  token: string | null;
  logout: () => void;
  filterType: "all" | "favorite" | "no_favorite" | "applications";
  sortBy: "score" | "date";
  hasApplication: boolean;
  statusFilter: string;
  initialJobs?: Job[];
  platformId?: number;
  isArchived?: boolean;
}

export function useJobs({
  token,
  logout,
  filterType,
  sortBy,
  hasApplication,
  statusFilter,
  initialJobs,
  platformId,
  isArchived = false,
}: UseJobsProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs || []);

  const offsetRef = useRef(initialJobs ? 10 : 0);
  const hasMoreRef = useRef(true);
  const isFirstRunRef = useRef(true);

  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const limit = 10;

  const fetchJobs = useCallback(
    async (reset = false) => {
      if (!token) return;

      // Use refs for logic checks
      const currentOffset = reset ? 0 : offsetRef.current;
      if (!reset && !hasMoreRef.current) return;

      if (!reset) setIsLoadingMore(true);

      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: currentOffset.toString(),
          sort_by: sortBy,
        });

        if (filterType !== "all") {
          queryParams.append("filter_type", filterType);
        }
        if (hasApplication) {
          queryParams.append("has_application", "true");
        }
        if (statusFilter) {
          queryParams.append("status_filter", statusFilter);
        }
        if (platformId) {
          queryParams.append("platform_id", platformId.toString());
        }
        if (isArchived) {
          queryParams.append("is_archived", "true");
        }

        const res = await fetchWithAuth(
          `${process.env.NEXT_PUBLIC_API_URL}/jobs?${queryParams}`,
        );

        if (res.status === 401) {
          logout();
          return;
        }

        const data = await res.json();

        if (reset) {
          setJobs(data);
          offsetRef.current = limit;
        } else {
          setJobs((prev) => {
            const newIds = new Set(data.map((d: Job) => d.id));
            return [...prev.filter((p) => !newIds.has(p.id)), ...data];
          });
          offsetRef.current += limit;
        }

        const newHasMore = data.length >= limit;
        hasMoreRef.current = newHasMore;
        setHasMore(newHasMore);
      } catch (e) {
        logger.error({ err: e }, "Error loading jobs");
        setGlobalError("Fehler beim Laden der Jobs.");
      } finally {
        setIsLoadingMore(false);
      }
    },
    [
      token,
      filterType,
      sortBy,
      hasApplication,
      statusFilter,
      platformId,
      isArchived,
      logout,
    ],
  );

  useEffect(() => {
    if (token) {
      if (isFirstRunRef.current) {
        isFirstRunRef.current = false;
        if (initialJobs && initialJobs.length > 0) {
          return; // Mount with server data — skip initial fetch
        }
      }
      fetchJobs(true);
    }
  }, [
    token,
    filterType,
    sortBy,
    hasApplication,
    statusFilter,
    platformId,
    isArchived,
    fetchJobs,
  ]);

  const confirmDeleteJob = async () => {
    if (!jobToDelete) return;

    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobToDelete}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        setJobs((prev) => prev.filter((job) => job.id !== jobToDelete));
      } else {
        const data = await res.json().catch(() => ({}));
        logger.error({ status: res.status, data }, "Delete failed");
        setGlobalError(
          `Löschen fehlgeschlagen: ${data.detail || res.statusText}`,
        );
      }
    } catch (e) {
      logger.error({ err: e }, "Error deleting job");
      setGlobalError("Netzwerkfehler beim Löschen.");
    }
    setJobToDelete(null);
  };

  const handleToggleFavorite = async (
    jobId: string,
    currentStatus: boolean,
  ) => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/favorite`,
        {
          method: "PATCH",
        },
      );
      if (res.ok) {
        const data = await res.json();
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId ? { ...job, is_favorite: data.is_favorite } : job,
          ),
        );
      }
    } catch (e) {
      logger.error({ err: e }, "Error toggling favorite");
    }
  };

  const bulkDeleteJobs = async (jobIds: string[]) => {
    if (!jobIds.length) return false;
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/bulk-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ job_ids: jobIds }),
        },
      );

      if (res.ok) {
        setJobs((prev) => prev.filter((job) => !jobIds.includes(job.id)));
        return true;
      } else {
        const data = await res.json().catch(() => ({}));
        logger.error({ status: res.status, data }, "Bulk delete failed");
        setGlobalError(
          `Löschen fehlgeschlagen: ${data.detail || res.statusText}`,
        );
        return false;
      }
    } catch (e) {
      logger.error({ err: e }, "Error bulk deleting jobs");
      setGlobalError("Netzwerkfehler beim Bulk-Löschen.");
      return false;
    }
  };

  const bulkRestoreJobs = async (jobIds: string[]) => {
    if (!jobIds.length) return false;
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/bulk-restore`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ job_ids: jobIds }),
        },
      );

      if (res.ok) {
        setJobs((prev) => prev.filter((job) => !jobIds.includes(job.id)));
        return true;
      } else {
        const data = await res.json().catch(() => ({}));
        logger.error({ status: res.status, data }, "Bulk restore failed");
        setGlobalError(
          `Wiederherstellen fehlgeschlagen: ${data.detail || res.statusText}`,
        );
        return false;
      }
    } catch (e) {
      logger.error({ err: e }, "Error bulk restoring jobs");
      setGlobalError("Netzwerkfehler beim Bulk-Wiederherstellen.");
      return false;
    }
  };

  const handleUpdateStatus = async (jobId: string, newStatus: JobStatus) => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/update-status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (res.ok) {
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId ? { ...job, status: newStatus } : job,
          ),
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        logger.error(
          { status: res.status, errorData },
          "Failed to update status",
        );
        setGlobalError(
          `Fehler beim Aktualisieren: ${res.status} ${errorData.detail || ""}`,
        );
      }
    } catch (e) {
      logger.error({ err: e }, "Error updating status");
      setGlobalError("Netzwerkfehler beim Aktualisieren des Status");
    }
  };

  const updateJob = async (jobId: string, payload: Partial<Job>) => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        setJobs((prev) => {
          // If we're updating is_archived and it now differs from our view (isArchived), remove it
          if (
            payload.is_archived !== undefined &&
            payload.is_archived !== !!isArchived
          ) {
            return prev.filter((j) => j.id !== jobId);
          }
          return prev.map((job) =>
            job.id === jobId ? { ...job, ...payload } : job,
          );
        });
      } else {
        const errorData = await res.json().catch(() => ({}));
        logger.error({ status: res.status, errorData }, "Failed to update job");
        setGlobalError(
          `Fehler beim Aktualisieren: ${res.status} ${errorData.detail || ""}`,
        );
      }
    } catch (e) {
      logger.error({ err: e }, "Error updating job");
      setGlobalError("Netzwerkfehler beim Aktualisieren");
    }
  };

  return {
    jobs,
    setJobs,
    fetchJobs,
    hasMore,
    isLoadingMore,
    globalError,
    setGlobalError,
    jobToDelete,
    setJobToDelete,
    confirmDeleteJob,
    handleToggleFavorite,
    handleUpdateStatus,
    updateJob,
    bulkDeleteJobs,
    bulkRestoreJobs,
  };
}
