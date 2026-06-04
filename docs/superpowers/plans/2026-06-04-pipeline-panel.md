# Pipeline Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `JobDetailModal` with a `JobSidePanel` that presents each job as a guided pipeline with URL-based state, and add a `/jobs/[id]` full-page route.

**Architecture:** `JobDetailModal` is deleted and replaced by `JobSidePanel` — a fixed slide-in panel with a `PipelineTabs` progress bar, a `StepCard` CTA block, and the existing tab sub-components (JobOverviewTab, JobApplicationTab, etc.) used directly. A `useJobPanel` hook owns all URL sync (`?job=<id>`) and panel state so `Listings.tsx` stays clean.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind 4, lucide-react, no external UI libs.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `frontend/app/components/JobSidePanel/types.ts` | Create | Prop interfaces for the panel directory |
| `frontend/app/components/JobSidePanel/PipelineTabs.tsx` | Create | Pure presentational pipeline tab bar |
| `frontend/app/components/JobSidePanel/StepCard.tsx` | Create | Per-status CTA block reading STATUS_GUIDANCE |
| `frontend/app/components/JobSidePanel/index.tsx` | Create | Full panel layout — composes all sub-components |
| `frontend/app/hooks/useJobPanel.ts` | Create | URL sync + panel open/close state |
| `frontend/app/jobs/[id]/page.tsx` | Create | Full-page job detail route |
| `frontend/app/listings/components/Listings.tsx` | Modify | Swap modal → panel, wire useJobPanel hook |
| `frontend/app/components/JobDetailModal.tsx` | Delete | Replaced by JobSidePanel |

**Not modified:** `JobCard`, `JobBoard`, `constants.ts`, `types.ts` (JobCard), all tab sub-components.

---

## Reference: Existing Prop Interfaces

These are the exact props the existing tab sub-components accept. Do not change them.

```ts
// JobOverviewTab
{ job: Job; onTabChange: (tab: TabType) => void; onStatusUpdate?: (jobId: string, status: JobStatus) => void; onArchive?: (jobId: string) => void; }

// JobApplicationTab
{ job: Job; isGenerating: boolean; onGenerate: (job: Job) => void; onRegenerate?: (job: Job, notes: string) => Promise<void>; onCancelGenerate?: (jobId: string) => Promise<void>; onStatusUpdate: (jobId: string, status: JobStatus) => void; onUpdateJob?: (jobId: string, payload: Partial<Job>) => Promise<void>; apiBase: string; }

// JobInterviewTab
{ job: Job; apiBase: string; }

// JobCompanyTab
{ job: Job; apiBase: string; }

// JobStatusTab
{ job: Job; apiBase: string; onStatusUpdate: (jobId: string, status: JobStatus) => void; setActiveTab: (tab: TabType) => void; }

// JobDocumentsTab
{ job: Job; apiBase?: string; }
```

---

## Task 1: JobSidePanel/types.ts

**Files:**
- Create: `frontend/app/components/JobSidePanel/types.ts`

- [ ] **Step 1: Create the file**

```ts
import type { Job } from "../../lib/types";
import type { JobStatus } from "../JobStatusBadge";

export interface JobSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  isGenerating: boolean;
  onGenerate: (job: Job) => void;
  onRegenerate?: (job: Job, notes: string) => Promise<void>;
  onCancelGenerate?: (jobId: string) => Promise<void>;
  onStatusUpdate: (jobId: string, status: JobStatus) => Promise<any>;
  onToggleFavorite: (jobId: string, currentStatus: boolean) => void;
  onUpdateJob?: (jobId: string, payload: Partial<Job>) => Promise<void>;
  onArchive?: (jobId: string) => void;
}

export interface PipelineTabsProps {
  currentStatus: JobStatus;
  onSelect: (status: JobStatus) => void;
}

export interface StepCardProps {
  job: Job;
  isGenerating: boolean;
  onGenerate: (job: Job) => void;
  onStatusUpdate: (jobId: string, status: JobStatus) => Promise<any>;
  onArchive: (jobId: string) => void;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/JobSidePanel/types.ts
git commit -m "feat(pipeline): add JobSidePanel type definitions"
```

---

## Task 2: PipelineTabs.tsx

**Files:**
- Create: `frontend/app/components/JobSidePanel/PipelineTabs.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { CheckCircle2 } from "lucide-react";
import { STATUS_PIPELINE, STATUS_META } from "../JobCard/constants";
import { useLanguage } from "../LanguageProvider";
import type { PipelineTabsProps } from "./types";
import type { JobStatus } from "../JobStatusBadge";

export default function PipelineTabs({ currentStatus, onSelect }: PipelineTabsProps) {
  const { t } = useLanguage();
  const currentIndex = STATUS_PIPELINE.indexOf(currentStatus as JobStatus);

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 overflow-x-auto flex-shrink-0">
      <div className="flex min-w-max px-1">
        {STATUS_PIPELINE.map((status, index) => {
          const meta = STATUS_META[status];
          const isDone = index < currentIndex;
          const isActive = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <button
              key={status}
              onClick={() => !isFuture && onSelect(status as JobStatus)}
              disabled={isFuture}
              className={[
                "flex items-center gap-2 px-3 py-2.5 border-b-2 text-[11px] font-semibold whitespace-nowrap transition-all",
                isActive
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent",
                isDone
                  ? "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                  : "",
                isFuture
                  ? "text-slate-400 dark:text-slate-600 opacity-50 cursor-not-allowed"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {isDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              ) : (
                <span
                  className={[
                    "w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center",
                    isActive
                      ? "border-indigo-500 bg-indigo-500"
                      : "border-slate-300 dark:border-slate-600",
                  ].join(" ")}
                >
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
              )}
              <span>{t(meta.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/JobSidePanel/PipelineTabs.tsx
git commit -m "feat(pipeline): add PipelineTabs component"
```

---

## Task 3: StepCard.tsx

**Files:**
- Create: `frontend/app/components/JobSidePanel/StepCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Sparkles, Send, Zap, Archive } from "lucide-react";
import { STATUS_GUIDANCE } from "../JobCard/constants";
import type { JobStatus } from "../JobStatusBadge";
import type { StepCardProps } from "./types";

export default function StepCard({
  job,
  isGenerating,
  onGenerate,
  onStatusUpdate,
  onArchive,
}: StepCardProps) {
  const status = (job.status || "OPEN") as JobStatus;
  const guidance = STATUS_GUIDANCE[status];

  if (!guidance) return null;

  return (
    <div className={`rounded-xl border p-4 ${guidance.bgCls}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${guidance.accentCls}`}>
        Aktueller Schritt
      </p>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
        {guidance.nextAction}
      </p>
      <StepActions
        job={job}
        status={status}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        onStatusUpdate={onStatusUpdate}
        onArchive={onArchive}
      />
    </div>
  );
}

// Renders the status-specific primary action buttons inside StepCard.
function StepActions({
  job,
  status,
  isGenerating,
  onGenerate,
  onStatusUpdate,
  onArchive,
}: StepCardProps & { status: JobStatus }) {
  if (status === "OPEN") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onStatusUpdate(job.id, "DRAFTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
          Bewerben
        </button>
        <button
          onClick={() => onArchive(job.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
        >
          <Archive className="w-3.5 h-3.5" />
          Archivieren
        </button>
      </div>
    );
  }

  if (status === "DRAFTED") {
    if (isGenerating) {
      return (
        <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          Wird generiert…
        </div>
      );
    }
    if (job.application_draft) {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Dokumente bereit — prüfe den Inhalt im Tab "Bewerbung".
        </p>
      );
    }
    return (
      <button
        onClick={() => onGenerate(job)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
      >
        <Sparkles className="w-3.5 h-3.5" />
        CV & Anschreiben generieren
      </button>
    );
  }

  if (status === "INTERVIEW") {
    if (job.interview_prep_material) {
      return (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Vorbereitung bereit — siehe Tab "Interview".
        </p>
      );
    }
    return (
      <button
        onClick={async () => {
          await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/jobs/${job.id}/interview-prep`,
            { method: "POST", credentials: "include" },
          );
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
      >
        <Zap className="w-3.5 h-3.5" />
        Interview Prep generieren
      </button>
    );
  }

  if (status === "OFFER") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onStatusUpdate(job.id, "ACCEPTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          Angebot annehmen
        </button>
        <button
          onClick={() => onStatusUpdate(job.id, "REJECTED")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all active:scale-95"
        >
          Ablehnen
        </button>
      </div>
    );
  }

  if (status === "ACCEPTED") {
    return (
      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        🎉 Glückwunsch! Der Job ist deiner.
      </p>
    );
  }

  // APPLIED, REJECTED, FAILED: informational only, footer handles advancement
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {STATUS_GUIDANCE[status]?.nudge}
    </p>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/JobSidePanel/StepCard.tsx
git commit -m "feat(pipeline): add StepCard component"
```

---

## Task 4: useJobPanel.ts

**Files:**
- Create: `frontend/app/hooks/useJobPanel.ts`

- [ ] **Step 1: Create the hook**

```ts
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

  // Call this when a job is updated inside the panel (e.g. status change)
  // to keep both panel state and the Kanban list in sync.
  const updateSelectedJob = useCallback(
    (updated: Job) => {
      setSelectedJob(updated);
      onJobUpdate(updated);
    },
    [onJobUpdate],
  );

  return { selectedJob, openPanel, closePanel, updateSelectedJob };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/hooks/useJobPanel.ts
git commit -m "feat(pipeline): add useJobPanel hook with URL sync"
```

---

## Task 5: JobSidePanel/index.tsx

**Files:**
- Create: `frontend/app/components/JobSidePanel/index.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink } from "lucide-react";
import type { TabType } from "../JobCard/types";
import type { JobStatus } from "../JobStatusBadge";
import { STATUS_PIPELINE } from "../JobCard/constants";
import PipelineTabs from "./PipelineTabs";
import StepCard from "./StepCard";
import JobOverviewTab from "../JobCard/JobOverviewTab";
import JobApplicationTab from "../JobCard/JobApplicationTab";
import JobInterviewTab from "../JobCard/JobInterviewTab";
import JobCompanyTab from "../JobCard/JobCompanyTab";
import JobStatusTab from "../JobCard/JobStatusTab";
import JobDocumentsTab from "../JobCard/JobDocumentsTab";
import type { JobSidePanelProps } from "./types";

const CONTENT_TABS: { id: NonNullable<TabType>; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "application", label: "Bewerbung" },
  { id: "interview", label: "Interview" },
  { id: "company", label: "Firma" },
  { id: "status", label: "Status" },
  { id: "documents", label: "Dokumente" },
];

function defaultContentTab(status: string): NonNullable<TabType> {
  if (status === "DRAFTED") return "application";
  if (status === "INTERVIEW") return "interview";
  return "overview";
}

export default function JobSidePanel({
  isOpen,
  onClose,
  job,
  isGenerating,
  onGenerate,
  onRegenerate,
  onCancelGenerate,
  onStatusUpdate,
  onToggleFavorite,
  onUpdateJob,
  onArchive,
}: JobSidePanelProps) {
  const router = useRouter();
  const [activeContentTab, setActiveContentTab] = useState<NonNullable<TabType>>("overview");

  // Reset content tab when a different job is opened
  useEffect(() => {
    if (job) {
      setActiveContentTab(defaultContentTab(job.status || "OPEN"));
    }
  }, [job?.id]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen || !job) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  const currentStatus = (job.status || "OPEN") as JobStatus;
  const currentIndex = STATUS_PIPELINE.indexOf(currentStatus);
  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentIndex >= STATUS_PIPELINE.length - 1;

  const handleStepForward = () => {
    if (isLastStep) return;
    onStatusUpdate(job.id, STATUS_PIPELINE[currentIndex + 1] as JobStatus);
  };

  const handleStepBack = () => {
    if (isFirstStep) return;
    onStatusUpdate(job.id, STATUS_PIPELINE[currentIndex - 1] as JobStatus);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-[420px] flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {job.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {job.company}
              {job.match_score != null && (
                <span className="ml-2 text-emerald-500 font-semibold">
                  {Math.round(job.match_score)}% Match
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => router.push(`/jobs/${job.id}`)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 rounded-lg transition-all active:scale-95"
            >
              <ExternalLink className="w-3 h-3" />
              Seite öffnen
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pipeline Tabs */}
        <PipelineTabs
          currentStatus={currentStatus}
          onSelect={(status) => onStatusUpdate(job.id, status)}
        />

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 space-y-4">

            {/* Current step CTA */}
            <StepCard
              job={job}
              isGenerating={isGenerating}
              onGenerate={onGenerate}
              onStatusUpdate={onStatusUpdate}
              onArchive={onArchive || (() => {})}
            />

            {/* Content tab bar */}
            <div className="border-b border-slate-200 dark:border-slate-800 -mx-4 px-4">
              <div className="flex overflow-x-auto">
                {CONTENT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveContentTab(tab.id)}
                    className={[
                      "px-3 py-2 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-all",
                      activeContentTab === tab.id
                        ? "border-slate-700 dark:border-slate-300 text-slate-900 dark:text-white"
                        : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400",
                    ].join(" ")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content tab panels */}
            <div>
              {activeContentTab === "overview" && (
                <JobOverviewTab
                  job={job}
                  onTabChange={(tab) => tab && setActiveContentTab(tab)}
                  onStatusUpdate={onStatusUpdate}
                  onArchive={onArchive}
                />
              )}
              {activeContentTab === "application" && (
                <JobApplicationTab
                  job={job}
                  isGenerating={isGenerating}
                  onGenerate={onGenerate}
                  onRegenerate={onRegenerate}
                  onCancelGenerate={onCancelGenerate}
                  onStatusUpdate={onStatusUpdate}
                  onUpdateJob={onUpdateJob}
                  apiBase={apiBase}
                />
              )}
              {activeContentTab === "interview" && (
                <JobInterviewTab job={job} apiBase={apiBase} />
              )}
              {activeContentTab === "company" && (
                <JobCompanyTab job={job} apiBase={apiBase} />
              )}
              {activeContentTab === "status" && (
                <JobStatusTab
                  job={job}
                  apiBase={apiBase}
                  onStatusUpdate={onStatusUpdate}
                  setActiveTab={setActiveContentTab}
                />
              )}
              {activeContentTab === "documents" && (
                <JobDocumentsTab job={job} apiBase={apiBase} />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          {!isFirstStep && (
            <button
              onClick={handleStepBack}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
            >
              ← Zurück
            </button>
          )}
          {!isLastStep && currentStatus !== "OFFER" && (
            <button
              onClick={handleStepForward}
              className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
            >
              Schritt erledigt ✓
            </button>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start dev server (`npm run dev` in `frontend/`). Open `/listings`. At this point the component exists but is not yet wired — confirm no build errors in the terminal.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/JobSidePanel/index.tsx
git commit -m "feat(pipeline): add JobSidePanel component"
```

---

## Task 6: app/jobs/[id]/page.tsx

**Files:**
- Create: `frontend/app/jobs/[id]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth, fetchWithAuth } from "../../components/AuthProvider";
import type { Job } from "../../lib/types";
import type { TabType } from "../../components/JobCard/types";
import type { JobStatus } from "../../components/JobStatusBadge";
import { STATUS_PIPELINE } from "../../components/JobCard/constants";
import PageWrapper from "../../components/PageWrapper";
import PipelineTabs from "../../components/JobSidePanel/PipelineTabs";
import StepCard from "../../components/JobSidePanel/StepCard";
import JobOverviewTab from "../../components/JobCard/JobOverviewTab";
import JobApplicationTab from "../../components/JobCard/JobApplicationTab";
import JobInterviewTab from "../../components/JobCard/JobInterviewTab";
import JobCompanyTab from "../../components/JobCard/JobCompanyTab";
import JobStatusTab from "../../components/JobCard/JobStatusTab";
import JobDocumentsTab from "../../components/JobCard/JobDocumentsTab";

const CONTENT_TABS: { id: NonNullable<TabType>; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "application", label: "Bewerbung" },
  { id: "interview", label: "Interview" },
  { id: "company", label: "Firma" },
  { id: "status", label: "Status" },
  { id: "documents", label: "Dokumente" },
];

export default function JobDetailPage() {
  const { token, logout } = useAuth();
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeContentTab, setActiveContentTab] = useState<NonNullable<TabType>>("overview");

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";

  useEffect(() => {
    if (!token || !jobId) return;
    setIsLoading(true);
    fetchWithAuth(`${apiBase}/jobs/${jobId}`)
      .then((res) => {
        if (res.status === 401) { logout(); return null; }
        return res.ok ? res.json() : null;
      })
      .then((data: Job | null) => {
        if (data) setJob(data);
      })
      .finally(() => setIsLoading(false));
  }, [token, jobId]);

  const handleStatusUpdate = useCallback(
    async (id: string, status: JobStatus) => {
      const res = await fetchWithAuth(`${apiBase}/jobs/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setJob((prev) => (prev ? { ...prev, status } : prev));
      }
    },
    [apiBase],
  );

  const handleGenerate = useCallback(async (j: Job) => {
    setIsGenerating(true);
    await fetchWithAuth(`${apiBase}/jobs/${j.id}/generate`, { method: "POST" });
  }, [apiBase]);

  const handleRegenerate = useCallback(async (j: Job, notes: string) => {
    setIsGenerating(true);
    await fetchWithAuth(`${apiBase}/jobs/${j.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ improvement_notes: notes || null }),
    });
  }, [apiBase]);

  const handleCancelGenerate = useCallback(async (id: string) => {
    setIsGenerating(false);
    await fetchWithAuth(`${apiBase}/jobs/${id}/cancel-generation`, { method: "POST" });
  }, [apiBase]);

  const handleUpdateJob = useCallback(
    async (id: string, payload: Partial<Job>) => {
      const res = await fetchWithAuth(`${apiBase}/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setJob((prev) => (prev ? { ...prev, ...updated } : prev));
      }
    },
    [apiBase],
  );

  const handleArchive = useCallback(
    (id: string) => handleUpdateJob(id, { is_archived: true }),
    [handleUpdateJob],
  );

  const currentStatus = (job?.status || "OPEN") as JobStatus;
  const currentIndex = STATUS_PIPELINE.indexOf(currentStatus);
  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentIndex >= STATUS_PIPELINE.length - 1;

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </PageWrapper>
    );
  }

  if (!job) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <p className="text-slate-500 dark:text-slate-400">Job nicht gefunden.</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-indigo-500 hover:underline"
          >
            Zurück
          </button>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Zurück
      </button>

      {/* Job header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {job.title}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {job.company}
          {job.match_score != null && (
            <span className="ml-2 text-emerald-500 font-semibold">
              {Math.round(job.match_score)}% Match
            </span>
          )}
        </p>
      </div>

      {/* Pipeline tabs */}
      <div className="mb-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <PipelineTabs
          currentStatus={currentStatus}
          onSelect={(status) => handleStatusUpdate(job.id, status)}
        />
      </div>

      {/* Step card */}
      <div className="mb-6">
        <StepCard
          job={job}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          onStatusUpdate={handleStatusUpdate}
          onArchive={handleArchive}
        />
      </div>

      {/* Content tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-4">
          <div className="flex overflow-x-auto">
            {CONTENT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveContentTab(tab.id)}
                className={[
                  "px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all",
                  activeContentTab === tab.id
                    ? "border-slate-700 dark:border-slate-300 text-slate-900 dark:text-white"
                    : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeContentTab === "overview" && (
            <JobOverviewTab
              job={job}
              onTabChange={(tab) => tab && setActiveContentTab(tab)}
              onStatusUpdate={handleStatusUpdate}
              onArchive={handleArchive}
            />
          )}
          {activeContentTab === "application" && (
            <JobApplicationTab
              job={job}
              isGenerating={isGenerating}
              onGenerate={handleGenerate}
              onRegenerate={handleRegenerate}
              onCancelGenerate={handleCancelGenerate}
              onStatusUpdate={handleStatusUpdate}
              onUpdateJob={handleUpdateJob}
              apiBase={apiBase}
            />
          )}
          {activeContentTab === "interview" && (
            <JobInterviewTab job={job} apiBase={apiBase} />
          )}
          {activeContentTab === "company" && (
            <JobCompanyTab job={job} apiBase={apiBase} />
          )}
          {activeContentTab === "status" && (
            <JobStatusTab
              job={job}
              apiBase={apiBase}
              onStatusUpdate={handleStatusUpdate}
              setActiveTab={setActiveContentTab}
            />
          )}
          {activeContentTab === "documents" && (
            <JobDocumentsTab job={job} apiBase={apiBase} />
          )}
        </div>
      </div>

      {/* Footer navigation */}
      <div className="flex gap-3 mt-6">
        {!isFirstStep && (
          <button
            onClick={() =>
              handleStatusUpdate(job.id, STATUS_PIPELINE[currentIndex - 1] as JobStatus)
            }
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
          >
            ← Zurück
          </button>
        )}
        {!isLastStep && currentStatus !== "OFFER" && (
          <button
            onClick={() =>
              handleStatusUpdate(job.id, STATUS_PIPELINE[currentIndex + 1] as JobStatus)
            }
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-all active:scale-95 shadow-sm"
          >
            Schritt erledigt ✓
          </button>
        )}
      </div>
    </PageWrapper>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual test — navigate to `/jobs/<any-existing-id>`**

Open the app, copy a job ID from the network tab or listings page, navigate to `/jobs/<id>`. Confirm the page loads, pipeline tabs render, tabs switch correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/jobs/[id]/page.tsx
git commit -m "feat(pipeline): add /jobs/[id] full-page route"
```

---

## Task 7: Wire Listings.tsx + Delete JobDetailModal

**Files:**
- Modify: `frontend/app/listings/components/Listings.tsx`
- Delete: `frontend/app/components/JobDetailModal.tsx`

This task has two parts. Complete Part A (modify Listings) before Part B (delete modal).

### Part A: Update Listings.tsx

- [ ] **Step 1: Replace the modal import and state**

In `Listings.tsx`, make these changes:

**Remove** the import:
```ts
import JobDetailModal from "../../components/JobDetailModal";
```

**Add** in its place:
```ts
import JobSidePanel from "../../components/JobSidePanel";
import { useJobPanel } from "../../hooks/useJobPanel";
```

- [ ] **Step 2: Replace selectedJobForDetail state with the hook**

**Remove** these lines (around line 114):
```ts
const [selectedJobForDetail, setSelectedJobForDetail] = useState<Job | null>(
  null,
);
```

**Add** after the `useJobs` destructuring block:
```ts
const { selectedJob, openPanel, closePanel, updateSelectedJob } = useJobPanel({
  token,
  logout,
  onJobUpdate: (updated) =>
    setJobs((prev) =>
      prev.map((j) => (j.id === updated.id ? { ...j, ...updated } : j)),
    ),
});
```

- [ ] **Step 3: Update all setSelectedJobForDetail → openPanel call sites**

In `JobBoard` usage (around line 781):
```tsx
onOpenDetail={openPanel}
```

In the `useEffect` that syncs the selected job (around line 522–528), **remove** it entirely — `useJobPanel` handles this internally.

- [ ] **Step 4: Replace JobDetailModal JSX with JobSidePanel**

**Remove** the entire `<JobDetailModal ... />` block (around lines 555–572):
```tsx
<JobDetailModal
  isOpen={!!selectedJobForDetail}
  onClose={() => setSelectedJobForDetail(null)}
  job={selectedJobForDetail!}
  ...
/>
```

**Add** `<JobSidePanel>` just before the closing `</PageWrapper>` tag:
```tsx
<JobSidePanel
  isOpen={!!selectedJob}
  onClose={closePanel}
  job={selectedJob}
  isGenerating={
    selectedJob
      ? pendingIds.includes(selectedJob.id) ||
        selectedJob.status === "GENERATING"
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
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. If `setSelectedJobForDetail` references remain, fix them now — replace each with `openPanel(job)` or `closePanel()` as appropriate.

- [ ] **Step 6: Manual test — panel opens from board**

Start the dev server. Switch to board view at `/listings`. Click a job card. Confirm:
- Panel slides in from the right
- Kanban stays visible and interactive behind it
- Pipeline tabs show correct status
- All content tabs switch correctly
- × button closes the panel
- Clicking backdrop closes the panel
- Escape key closes the panel
- URL changes to `?job=<id>` on open, reverts on close
- Refreshing the page with `?job=<id>` in the URL re-opens the panel

- [ ] **Step 7: Manual test — panel opens from list view**

Switch to list view. The `JobCard` in list mode currently calls `onOpenDetail` — but wait, it doesn't. The list cards don't call `openPanel` yet. Check if `JobCard` in list mode has a click handler to open the detail. Looking at `Listings.tsx`, the list view maps `JobCard` without an `onOpenDetail` prop. **If JobCard list items should also open the panel**, add an `onClick` wrapper to each `JobCard` in the list:

In the `visibleJobs.map` section around line 786:
```tsx
<JobCard
  key={job.id}
  job={job}
  ...existing props...
  // No change needed here — JobCard's own click behavior is preserved
/>
```

The list view `JobCard` already has its own expand/collapse behavior — leave it as-is for now. The panel is primarily a board-view feature.

- [ ] **Step 8: Commit Listings changes**

```bash
git add frontend/app/listings/components/Listings.tsx
git commit -m "feat(pipeline): wire JobSidePanel into Listings, replace JobDetailModal"
```

### Part B: Delete JobDetailModal

- [ ] **Step 9: Confirm no remaining imports**

```bash
grep -r "JobDetailModal" frontend/app/
```

Expected: no results. If any remain, fix them before deleting.

- [ ] **Step 10: Delete the file**

```bash
rm frontend/app/components/JobDetailModal.tsx
```

- [ ] **Step 11: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 12: Commit deletion**

```bash
git add -u frontend/app/components/JobDetailModal.tsx
git commit -m "feat(pipeline): delete JobDetailModal (replaced by JobSidePanel)"
```

---

## Self-Review Checklist (Done)

- **Spec coverage:**
  - ✅ Side panel with ~420px width — `w-[420px]` in index.tsx
  - ✅ Slide-in from right — `slide-in-from-right` animation
  - ✅ Backdrop closes panel — backdrop `onClick={onClose}`
  - ✅ Escape closes panel — `keydown` effect in index.tsx
  - ✅ "↗ Seite öffnen" button — in header, `router.push(/jobs/${job.id})`
  - ✅ Pipeline tabs: done/active/open states — PipelineTabs.tsx
  - ✅ Only done+active tabs clickable — `disabled={isFuture}` in PipelineTabs
  - ✅ "← Zurück" hidden on first step — `{!isFirstStep && ...}` in footer
  - ✅ StepCard per-status CTAs — OPEN/DRAFTED/APPLIED/INTERVIEW/OFFER/ACCEPTED all handled
  - ✅ Default content tab per status — `defaultContentTab()` function
  - ✅ Existing tab sub-components reused directly — all six imported in index.tsx
  - ✅ URL sync via `useJobPanel` — `?job=<id>` set/cleared on open/close
  - ✅ On mount restore from URL — `useEffect` in `useJobPanel` reads `?job`
  - ✅ Deep link `?job=<id>` works — hook fetches job on token availability
  - ✅ JobDetailModal deleted — Task 7 Part B
  - ✅ `/jobs/[id]` full-page route — Task 6
  - ✅ Dark mode on all new components — all surfaces/text have `dark:` classes
  - ✅ No DB changes, no new API endpoints — confirmed throughout

- **Type consistency:**
  - `JobSidePanelProps` defined in types.ts, imported in index.tsx ✅
  - `PipelineTabsProps` defined in types.ts, imported in PipelineTabs.tsx ✅
  - `StepCardProps` defined in types.ts, imported in StepCard.tsx ✅
  - `useJobPanel` returns `{ selectedJob, openPanel, closePanel, updateSelectedJob }` — all four used in Listings.tsx ✅
  - `STATUS_PIPELINE` type is `JobStatus[]` — cast applied in PipelineTabs and index.tsx ✅
