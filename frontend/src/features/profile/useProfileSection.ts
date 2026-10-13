"use client";

import { useSearchParams } from "next/navigation";
import { sectionFromParam, type ProfileSection } from "@/domain/profile";

/** D1: the open section from `?section=`; an unknown value reads as Ziel and is not rewritten. */
export function useProfileSection(): ProfileSection {
  return sectionFromParam(useSearchParams().get("section"));
}
