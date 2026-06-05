# Side Panel UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing dual-navigation panel with a clear hierarchy: clickable pipeline stepper for status changes, a prominent action zone with an "Erledigt → Next" button, a "Stellendetails" divider, and no footer.

**Architecture:** Two file edits only. `StepCard.tsx` gains a step-counter label and the forward-navigation button. `JobSidePanel/index.tsx` loses its footer and gains a visual divider between the action zone and the content tabs. `PipelineTabs.tsx` and `types.ts` are untouched.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind 4, lucide-react.

---

## File Map

| File | Change |
|---|---|
| `frontend/app/components/JobSidePanel/StepCard.tsx` | Add step-counter label + "Erledigt → Next" button |
| `frontend/app/components/JobSidePanel/index.tsx` | Remove footer; add "Stellendetails" divider |

---

## Reference: Current StepCard.tsx

```tsx
// Current label (line 21):
<p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${guidance.accentCls}`}>
  Aktueller Schritt
</p>

// No forward button exists today.
// Footer in index.tsx currently owns "← Zurück" and "Schritt erledigt ✓".
```

## Reference: STATUS_PIPELINE and STATUS_META

```ts
// frontend/app/components/JobCard/constants.ts
export const STATUS_PIPELINE: JobStatus[] = [
  "OPEN", "DRAFTED", "APPLIED", "INTERVIEW", "OFFER", "ACCEPTED"
];
// STATUS_META[status].labelKey is a TranslationKey usable with t()
```

---

## Task 1: Update StepCard.tsx

**Files:**
- Modify: `frontend/app/components/JobSidePanel/StepCard.tsx`

### What changes

1. Replace `"Aktueller Schritt"` with `"Schritt {n} von {total} · {statusLabel}"`.
   - For statuses not in `STATUS_PIPELINE` (REJECTED, FAILED): show just the status label without step count.
2. Add a green **"Erledigt → {nextStatusLabel} ✓"** button below `<StepActions>`.
   - Shown when: status is in `STATUS_PIPELINE`, is not the last step (`ACCEPTED`), and is not `"OPEN"` (has "Bewerben") or `"OFFER"` (has explicit accept/reject).
   - Calls `onStatusUpdate(job.id, nextStatus)`.

- [ ] **Step 1: Rewrite StepCard.tsx**

Replace the entire file content:

```tsx
import { Sparkles, Send, Zap, Archive, CheckCircle2 } from "lucide-react";
import { STATUS_GUIDANCE, STATUS_PIPELINE, STATUS_META } from "../JobCard/constants";
import { useLanguage } from "../LanguageProvider";
import type { JobStatus } from "../JobStatusBadge";
import type { StepCardProps } from "./types";

export default function StepCard({
  job,
  isGenerating,
  onGenerate,
  onStatusUpdate,
  onArchive,
}: StepCardProps) {
  const { t } = useLanguage();
  const status = (job.status || "OPEN") as JobStatus;
  const guidance = STATUS_GUIDANCE[status];
  const currentIndex = STATUS_PIPELINE.indexOf(status);
  const total = STATUS_PIPELINE.length;
  const nextStatus =
    currentIndex >= 0 && currentIndex < total - 1
      ? STATUS_PIPELINE[currentIndex + 1]
      : null;
  // Show forward button for DRAFTED, APPLIED, INTERVIEW — not for OPEN (has "Bewerben"),
  // OFFER (has explicit accept/reject), ACCEPTED (last step), or exit statuses.
  const showErledigt =
    nextStatus !== null && status !== "OPEN" && status !== "OFFER";

  if (!guidance) return null;

  return (
    <div className={`rounded-xl border p-4 ${guidance.bgCls}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${guidance.accentCls}`}>
        {currentIndex >= 0
          ? `Schritt ${currentIndex + 1} von ${total} · ${t(STATUS_META[status].labelKey)}`
          : t(STATUS_META[status]?.labelKey ?? ("statusRejected" as any))}
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
      {showErledigt && nextStatus && (
        <button
          onClick={() => onStatusUpdate(job.id, nextStatus as JobStatus)}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all active:scale-95 shadow-sm"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Erledigt → {t(STATUS_META[nextStatus].labelKey)} ✓
        </button>
      )}
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

  // APPLIED, REJECTED, FAILED: informational nudge only
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
git commit -m "feat(panel): add step counter label and Erledigt forward button to StepCard"
```

---

## Task 2: Update JobSidePanel/index.tsx

**Files:**
- Modify: `frontend/app/components/JobSidePanel/index.tsx`

### What changes

1. **Remove the footer block** — the entire `{/* Footer */}` div (contains "← Zurück" and "Schritt erledigt ✓" buttons).
2. **Remove now-unused state/variables** — `isFirstStep`, `isLastStep`, `handleStepForward`, `handleStepBack`.
3. **Add a "Stellendetails" divider** between the StepCard and the content tab bar.

- [ ] **Step 1: Remove footer variables and footer JSX, add divider**

The current file has these variables to remove (they were only used by the footer):
```tsx
const isFirstStep = currentIndex <= 0;
const isLastStep = currentIndex >= STATUS_PIPELINE.length - 1;

const handleStepForward = () => { ... };
const handleStepBack = () => { ... };
```

And this footer block to remove:
```tsx
{/* Footer */}
<div className="flex gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
  {!isFirstStep && (
    <button onClick={handleStepBack} ...>← Zurück</button>
  )}
  {!isLastStep && currentStatus !== "OFFER" && (
    <button onClick={handleStepForward} ...>Schritt erledigt ✓</button>
  )}
</div>
```

Replace the scrollable body section and footer with the new version. The section starting at `{/* Scrollable Body */}` through the end of the panel div becomes:

```tsx
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

            {/* Divider */}
            <div className="flex items-center gap-3 -mx-4 px-4">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Stellendetails
              </span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            </div>

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
              {activeContentTab === "documents" && (
                <JobDocumentsTab job={job} apiBase={apiBase} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

Also remove the `currentIndex` variable if it is no longer used (it was used by `isFirstStep`/`isLastStep`). Check: `currentIndex` is still used by nothing in the panel itself — remove it.

The final set of variables left above the return should be only:
```tsx
const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
const currentStatus = (job.status || "OPEN") as JobStatus;
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/JobSidePanel/index.tsx
git commit -m "feat(panel): remove footer, add Stellendetails divider"
```
