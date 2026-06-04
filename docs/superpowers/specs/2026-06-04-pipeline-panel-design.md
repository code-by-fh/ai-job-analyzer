# Pipeline Panel Design

**Date:** 2026-06-04  
**Status:** Approved

## Overview

Replace `JobDetailModal` with a `JobSidePanel` that presents the job application process as a guided pipeline. The Kanban board at `/listings` (board view) remains unchanged. Clicking any job card opens the panel. The panel slides in from the right and occupies ~420px. A "Seite öffnen" button navigates to a new full-page route `/jobs/[id]`.

## User Flow

1. User clicks a job card in the Kanban board or list view
2. `JobSidePanel` slides in from the right; Kanban stays visible and interactive on the left
3. Panel shows the current pipeline stage with a contextual CTA (e.g. "Generieren", "Einreichen")
4. User works through steps; "Schritt erledigt" advances `job.status` to the next pipeline stage
5. "← Zurück" regresses one stage; hidden when status is OPEN (first stage)
6. "↗ Seite öffnen" navigates to `/jobs/[id]` for full-page work
7. Clicking the backdrop or pressing Escape closes the panel
8. Panel URL is `?job=<id>` — browser Back closes it, deep links work

## Pipeline Stages & CTAs

The pipeline tabs map 1:1 to `STATUS_PIPELINE` from `constants.ts`:

| Tab / Status | Primary CTA | On Confirm |
|---|---|---|
| OPEN | Bewerben / Archivieren | → DRAFTED / archive |
| DRAFTED | ✨ Generieren (or "Dokumente prüfen" if draft exists) | generate + → APPLIED |
| APPLIED | Bewerbung eingereicht ✓ | → INTERVIEW |
| INTERVIEW | Interview Prep generieren | trigger prep + → OFFER |
| OFFER | Angebot annehmen / Ablehnen | → ACCEPTED / REJECTED |
| ACCEPTED | — (success state) | — |

Tab state is derived from `job.status` and `STATUS_PIPELINE`:
- `index < currentIndex` → done (green check)
- `index === currentIndex` → active (indigo dot + underline)
- `index > currentIndex` → open (grey circle, reduced opacity)

Step descriptions and checklist items come from the existing `STATUS_GUIDANCE[status]` in `constants.ts`. No new data model or DB changes required.

## Component Architecture

### New: `components/JobSidePanel/`

```
JobSidePanel/
  index.tsx        Layout: backdrop, slide-in panel, composes sub-components
  PipelineTabs.tsx Tab bar derived from STATUS_PIPELINE + job.status
  StepCard.tsx     Current step: STATUS_GUIDANCE CTA + action buttons
  types.ts         Shared prop interfaces for this directory
```

**`index.tsx`** receives the same props as the former `JobDetailModal` (i.e. `JobCardProps` + `isOpen` + `onClose`). It renders:
1. Fixed backdrop (click closes)
2. Slide-in panel: `fixed inset-y-0 right-0 w-[420px]`
3. Header: title, company, match score, "↗ Seite öffnen", ×
4. `PipelineTabs` — derived, no extra state
5. Scrollable body: `StepCard` + content tabs
6. Footer: "← Zurück" | "Schritt erledigt ✓"

**`PipelineTabs.tsx`** is a pure presentational component. Receives `currentStatus: JobStatus` and `onSelect: (status: JobStatus) => void`. Derives done/active/open from `STATUS_PIPELINE.indexOf(currentStatus)`. Only done and active tabs are clickable (user can navigate back to review past steps); future tabs are visually disabled and do not fire `onSelect`.

**`StepCard.tsx`** receives `job: Job` and the status-specific action handlers. Reads from `STATUS_GUIDANCE[job.status]` for copy. Renders the CTA block.

### Content Tabs (body)

The existing tab sub-components are used directly — not wrapped by `JobCard`:

```
JobOverviewTab, JobApplicationTab, JobInterviewTab,
JobCompanyTab, JobStatusTab, JobDocumentsTab
```

Each receives the same props they already accept. A local `activeContentTab` state in `JobSidePanel/index.tsx` controls which is shown. The default content tab is determined by the current pipeline status: OPEN → `overview`, DRAFTED → `application`, INTERVIEW → `interview`, all others → `overview`.

### Deleted: `components/JobDetailModal.tsx`

All usages in `Listings.tsx` switch to `JobSidePanel`. `JobCard` remains unchanged for the list view.

### New: `hooks/useJobPanel.ts`

Single source of truth for panel open/close and URL sync. Encapsulates all `useSearchParams` / `router.replace` calls so `Listings.tsx` stays clean.

```ts
function useJobPanel(token: string | null, logout: () => void): {
  selectedJob: Job | null;
  openPanel: (job: Job) => void;
  closePanel: () => void;
}
```

On mount: reads `?job=<id>` from URL, calls `fetchWithAuth(/jobs/<id>)`, sets `selectedJob`. If fetch returns 401, calls `logout()`.  
`openPanel(job)`: sets `selectedJob` and calls `router.replace('/listings?job=<id>', { scroll: false })`.  
`closePanel()`: clears `selectedJob` and removes `?job` param via `router.replace`.

`Listings.tsx` replaces the existing `selectedJobForDetail` state and `setSelectedJobForDetail` calls with `const { selectedJob, openPanel, closePanel } = useJobPanel(token, logout)`.

The hook also receives `onJobUpdate: (updatedJob: Job) => void` so it can sync the Kanban's job list when status changes inside the panel.

### New: `app/jobs/[id]/page.tsx`

Full-page route for deep work on a single job. Fetches job by `params.id`. Renders:
- `PageHeader` with job title + company
- `PipelineTabs` (same component, reused)
- Full-width content using the same tab sub-components
- No `JobSidePanel` involved — own layout

## Routing

| Trigger | URL | Effect |
|---|---|---|
| Click job card | `/listings?job=123` | Panel opens |
| Close panel (×, backdrop, Escape) | `/listings` | Panel closes |
| Browser Back | `/listings` | Panel closes |
| "↗ Seite öffnen" | `/jobs/123` | Full-page navigation |
| Direct link `/listings?job=123` | `/listings?job=123` | Panel opens on load |

## Files Touched

| File | Change |
|---|---|
| `components/JobSidePanel/index.tsx` | New |
| `components/JobSidePanel/PipelineTabs.tsx` | New |
| `components/JobSidePanel/StepCard.tsx` | New |
| `components/JobSidePanel/types.ts` | New |
| `hooks/useJobPanel.ts` | New |
| `app/jobs/[id]/page.tsx` | New |
| `app/listings/components/Listings.tsx` | Replace modal with panel + use hook |
| `components/JobDetailModal.tsx` | Deleted |

`JobCard`, `JobBoard`, all tab sub-components, `constants.ts`, and `types.ts` are **not modified**.

## Constraints

- No new backend endpoints required
- No DB schema changes
- Follows existing Tailwind 4 + glassmorphism design system
- Dark mode parity required on all new components (`dark:` classes on every surface/text)
- Modals via `Portal.tsx`, panels via `fixed` positioning (no Portal needed)
- `rounded-2xl` for panel surface, `rounded-xl` for buttons
