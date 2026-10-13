"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { jobQueryOptions } from "@/api/jobs";
import { jobIdFromPath, navKeyForJob, navKeyForPath, type NavKey } from "./navigation";

/** The highlighted main-nav item; on a job page it follows the job (shares the page's query). */
export function useActiveNavKey(enabled: boolean): NavKey | null {
  const pathname = usePathname() ?? "";
  const jobId = jobIdFromPath(pathname);
  const job = useQuery({ ...jobQueryOptions(jobId ?? ""), enabled: enabled && jobId !== null });
  if (jobId === null) return navKeyForPath(pathname);
  return job.data ? navKeyForJob(job.data) : null;
}
