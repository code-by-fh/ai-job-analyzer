# Side Panel UX Redesign

**Goal:** Eliminate orientation confusion in the `JobSidePanel` by establishing a single, unmistakable action hierarchy and removing duplicate navigation mechanisms.

---

## Problem

The current panel has three overlapping concerns fighting for attention:
- Two navigation systems: pipeline stepper + content tabs
- Two forward/back mechanisms: footer buttons AND pipeline stepper clicks
- No clear visual hierarchy between "what to do now" and "details about the job"

Result: users don't know where to look or what to do.

---

## Design

### Layout (top to bottom)

```
┌─────────────────────────────────────────┐
│ HEADER                                  │
│ Jobtitel · Firma · 87% Match  [↗] [✕]  │
├─────────────────────────────────────────┤
│ PIPELINE STEPPER (clickable)            │
│ ✓ Offen ──●── Entwurf ── · ── · ── ·  │
├─────────────────────────────────────────┤
│ ACTION ZONE (colored, prominent)        │
│ Schritt 2 von 5 · Entwurf              │
│ "Unterlagen prüfen & absenden"          │
│ [✨ CV generieren] [✓ Erledigt →]      │
├─────────────────────────────────────────┤
│ ────────── Stellendetails ──────────── │
│ Übersicht  Bewerbung  Interview  ...   │
├─────────────────────────────────────────┤
│ (scrollable tab content)                │
└─────────────────────────────────────────┘
```

### 1. Header — unchanged

Title, company, match score. "↗ Seite öffnen" button + X close.

### 2. Pipeline Stepper

Stays fully clickable — any click sets the status directly. This is the **only** mechanism for going back to a previous step. No change to `PipelineTabs.tsx`.

### 3. Action Zone

Replaces `StepCard`. Large, visually dominant. Background color matches the current status (`STATUS_GUIDANCE[status].bgCls`).

**Contents:**
- **Label row:** `Schritt {currentIndex + 1} von {STATUS_PIPELINE.length} · {statusLabel}` in the status accent color
- **Action headline:** `STATUS_GUIDANCE[status].nextAction` — bold, prominent
- **Primary CTA buttons:** existing per-status logic from `StepCard` (generate, send, accept/reject, etc.)
- **"Erledigt → {nextStatusLabel} ✓" button:** advances to the next pipeline step. Hidden when:
  - Current status is the last step (`ACCEPTED`)
  - Current status is `OFFER` (user must explicitly accept or reject — ambiguous to auto-advance)
  - Current status is `REJECTED` or `FAILED`

### 4. "Stellendetails" divider

A horizontal rule with centered label text between the action zone and the tabs. Makes the boundary between "what to do" and "job information" visually explicit.

### 5. Content Tabs

Unchanged tabs: Übersicht, Bewerbung, Interview, Firma, Dokumente. Visually secondary — smaller, understated styling relative to the action zone.

### 6. Footer — removed

The footer with "← Zurück" and "Schritt erledigt ✓" buttons is deleted. Going back: click any earlier step in the pipeline stepper. Going forward: use the "Erledigt →" button in the action zone.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/app/components/JobSidePanel/StepCard.tsx` | Add "Schritt X von Y" label; add "Erledigt → {next}" button; rename to reflect expanded role |
| `frontend/app/components/JobSidePanel/index.tsx` | Remove footer; add "Stellendetails" divider above tabs |
| `frontend/app/components/JobSidePanel/PipelineTabs.tsx` | No change |
| `frontend/app/components/JobSidePanel/types.ts` | No change |

---

## Not in Scope

- `frontend/app/jobs/[id]/page.tsx` — full-page route keeps its current layout (different context, more screen space)
- Backend, API, types — no changes
- Mobile layout — panel is desktop-only (80vw on desktop, full-screen would need separate work)
