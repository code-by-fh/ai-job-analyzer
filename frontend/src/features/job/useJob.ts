"use client";

import { useQuery } from "@tanstack/react-query";
import { jobQueryOptions } from "@/api/jobs";

export function useJob(id: string) {
  return useQuery(jobQueryOptions(id));
}
