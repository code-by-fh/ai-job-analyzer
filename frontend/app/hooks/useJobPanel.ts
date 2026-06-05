"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Job } from "../lib/types";
import { fetchWithAuth } from "../components/AuthProvider";

interface UseJobPanelOptions {
  token: string | null;
  logout: () => void;
  onJobUpdate: (job: Job) => void;
}

export function useJobPanel({ token, logout, onJobUpdate }: UseJobPanelOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // On mount or token availability: restore panel state from URL
  useEffect(() => {
    const jobId = searchParams.get("job");
    if (!jobId || !token) return;
    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}`)
      .then((res) => {
        if (res.status === 401) {
          logout();
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((job: Job | null) => {
        if (job) setSelectedJob(job);
      })
      .catch(() => {});
    // Run only when token becomes available, not on every searchParams change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openPanel = useCallback(
    (job: Job) => {
      setSelectedJob(job);
      const params = new URLSearchParams(searchParams.toString());
      params.set("job", job.id);
      router.replace(`/listings?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closePanel = useCallback(() => {
    setSelectedJob(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    const qs = params.toString();
    router.replace(`/listings${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  // Call this when a job is updated inside the panel — propagates to the jobs list.
  const updateSelectedJob = useCallback(
    (updated: Job) => {
      setSelectedJob(updated);
      onJobUpdate(updated);
    },
    [onJobUpdate],
  );

  // Call this when the jobs list changes externally — syncs panel without feedback loop.
  const syncFromJobs = useCallback((updated: Job) => {
    setSelectedJob(updated);
  }, []);

  return { selectedJob, openPanel, closePanel, updateSelectedJob, syncFromJobs };
}
