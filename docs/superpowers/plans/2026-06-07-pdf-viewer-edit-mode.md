# PDF Viewer + Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-editable HTML iframe in the application tab with a browser-native PDF viewer as the default view, plus a toggleable edit mode backed by the existing HTML iframe.

**Architecture:** Load the PDF binary via `fetchWithAuth` on mount/reload and store as a blob URL in state; display via `<embed>`. An "Edit" toolbar button switches to the HTML iframe (contentEditable). Saving re-renders the PDF and reloads the blob. During generation (first or re-gen), show the GeneratingSpinner; the RegenBanner is removed from this component.

**Tech Stack:** React, TypeScript, existing `fetchWithAuth`, browser Blob API

---

### Task 1: Add PDF blob state and load logic

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

- [ ] **Step 1: Add new state variables** after the existing letter/cv state blocks:

```typescript
// ── Letter PDF blob ───────────────────────────────────────────────────────
const [letterPdfUrl, setLetterPdfUrl] = useState<string | null>(null);
const [letterEditMode, setLetterEditMode] = useState(false);

// ── CV PDF blob ───────────────────────────────────────────────────────────
const [cvPdfUrl, setCvPdfUrl] = useState<string | null>(null);
const [cvEditMode, setCvEditMode] = useState(false);
```

- [ ] **Step 2: Update `loadLetterContent` to fetch and store the PDF blob**

Replace the existing `loadLetterContent` with:

```typescript
const loadLetterContent = useCallback(async () => {
  setLetterLoading(true);
  try {
    const [docRes, htmlRes] = await Promise.all([
      fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`),
      fetchWithAuth(`${apiBase}/jobs/${job.id}/documents/html?kind=cover_letter`),
    ]);
    if (docRes.ok) {
      const docs: JobDocument[] = await docRes.json();
      const doc = docs.find((d) => d.kind === "GENERATED_LETTER") ?? null;
      setLetterDoc(doc);
      if (doc) {
        const pdfRes = await fetchWithAuth(
          `${apiBase}/jobs/${job.id}/documents/${doc.id}/download`
        );
        if (pdfRes.ok) {
          const blob = await pdfRes.blob();
          setLetterPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      }
    }
    if (htmlRes.ok) {
      const data = await htmlRes.json();
      setLetterHtml(data.html || null);
    }
  } finally {
    setLetterLoading(false);
  }
}, [apiBase, job.id]);
```

- [ ] **Step 3: Update `loadCvContent` the same way**

Replace with:

```typescript
const loadCvContent = useCallback(async () => {
  setCvLoading(true);
  try {
    const [docRes, htmlRes] = await Promise.all([
      fetchWithAuth(`${apiBase}/jobs/${job.id}/documents`),
      fetchWithAuth(`${apiBase}/jobs/${job.id}/documents/html?kind=cv`),
    ]);
    if (docRes.ok) {
      const docs: JobDocument[] = await docRes.json();
      const doc = docs.find((d) => d.kind === "GENERATED_CV") ?? null;
      setCvDoc(doc);
      if (doc) {
        const pdfRes = await fetchWithAuth(
          `${apiBase}/jobs/${job.id}/documents/${doc.id}/download`
        );
        if (pdfRes.ok) {
          const blob = await pdfRes.blob();
          setCvPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      }
    }
    if (htmlRes.ok) {
      const data = await htmlRes.json();
      setCvHtml(data.html || null);
    }
  } finally {
    setCvLoading(false);
  }
}, [apiBase, job.id]);
```

- [ ] **Step 4: Add blob URL cleanup on unmount**

Add this effect after the existing `useEffect` calls (before the save handlers):

```typescript
useEffect(() => {
  return () => {
    setLetterPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setCvPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
  };
}, []);
```

- [ ] **Step 5: Exit edit mode when generation starts**

Add two effects:

```typescript
useEffect(() => {
  if (isLetterGenerating) setLetterEditMode(false);
}, [isLetterGenerating]);

useEffect(() => {
  if (cvGenerating) setCvEditMode(false);
}, [cvGenerating]);
```

---

### Task 2: Update save handlers to reload PDF and exit edit mode

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

- [ ] **Step 1: Update `handleLetterSave`** — after successful render, reload content and exit edit mode

Replace the current `handleLetterSave` with:

```typescript
const handleLetterSave = useCallback(async () => {
  const iframe = letterIframeRef.current;
  if (!iframe || letterHtmlSaving) return;
  const html = serializeIframeHtml(iframe);
  setLetterHtmlSaving(true);
  setLetterSaveStatus("idle");
  try {
    const putRes = await fetchWithAuth(
      `${apiBase}/jobs/${job.id}/documents/html?kind=cover_letter`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      }
    );
    if (!putRes.ok) { setLetterSaveStatus("error"); return; }
    await fetchWithAuth(
      `${apiBase}/jobs/${job.id}/documents/render?kind=cover_letter`,
      { method: "POST" }
    );
    setLetterSaveStatus("saved");
    setTimeout(() => setLetterSaveStatus("idle"), 3000);
    setLetterEditMode(false);
    await loadLetterContent();
  } catch {
    setLetterSaveStatus("error");
  } finally {
    setLetterHtmlSaving(false);
  }
}, [apiBase, job.id, letterHtmlSaving, loadLetterContent]);
```

- [ ] **Step 2: Update `handleCvSave`** the same way

Replace with:

```typescript
const handleCvSave = useCallback(async () => {
  const iframe = cvIframeRef.current;
  if (!iframe || cvHtmlSaving) return;
  const html = serializeIframeHtml(iframe);
  setCvHtmlSaving(true);
  setCvSaveStatus("idle");
  try {
    const putRes = await fetchWithAuth(
      `${apiBase}/jobs/${job.id}/documents/html?kind=cv`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      }
    );
    if (!putRes.ok) { setCvSaveStatus("error"); return; }
    await fetchWithAuth(
      `${apiBase}/jobs/${job.id}/documents/render?kind=cv`,
      { method: "POST" }
    );
    setCvSaveStatus("saved");
    setTimeout(() => setCvSaveStatus("idle"), 3000);
    setCvEditMode(false);
    await loadCvContent();
  } catch {
    setCvSaveStatus("error");
  } finally {
    setCvHtmlSaving(false);
  }
}, [apiBase, job.id, cvHtmlSaving, loadCvContent]);
```

---

### Task 3: Rewrite the Anschreiben view

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

- [ ] **Step 1: Replace the entire `{activeView === "letter"}` block**

Remove the `RegenBanner` import line and replace the whole letter section with:

```tsx
{activeView === "letter" && (
  <div className="space-y-3 flex-1 flex flex-col">
    <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
        <button
          onClick={loadLetterContent}
          disabled={letterLoading}
          className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
          title="Aktualisieren"
        >
          <RotateCw className={`w-3.5 h-3.5 ${letterLoading ? "animate-spin" : ""}`} />
        </button>
        {!isLetterGenerating && !letterEditMode && (
          <button
            onClick={() => letterHtml ? setShowRegenInput((v) => !v) : onGenerate(job)}
            disabled={isSubmittingRegen}
            className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-40 ${
              showRegenInput
                ? "text-purple-600 bg-purple-100 dark:bg-purple-500/20"
                : "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
            }`}
          >
            {isSubmittingRegen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{letterHtml ? "Neu generieren" : "Generieren"}</span>
          </button>
        )}
        {letterPdfUrl && !isLetterGenerating && !letterEditMode && (
          <button
            onClick={() => setLetterEditMode(true)}
            className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bearbeiten</span>
          </button>
        )}
        {letterEditMode && (
          <>
            <button
              onClick={handleLetterSave}
              disabled={letterHtmlSaving}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                letterSaveStatus === "saved"
                  ? "text-white bg-emerald-600"
                  : letterSaveStatus === "error"
                    ? "text-white bg-rose-600"
                    : "text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm shadow-indigo-500/20"
              }`}
            >
              {letterHtmlSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {letterHtmlSaving ? "Speichert…" : letterSaveStatus === "saved" ? "Gespeichert" : letterSaveStatus === "error" ? "Fehler" : "Speichern"}
              </span>
            </button>
            <button
              onClick={() => setLetterEditMode(false)}
              disabled={letterHtmlSaving}
              className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Abbrechen</span>
            </button>
          </>
        )}
        {letterPdfUrl && !letterEditMode && !isLetterGenerating && (
          <button
            onClick={handleDownloadLetterDoc}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        )}
      </div>
    </div>

    {showRegenInput && !letterEditMode && (
      <div className="bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20 rounded-xl p-4 space-y-3">
        <p className="text-[10px] font-black text-purple-700 dark:text-purple-300 uppercase tracking-widest">
          Verbesserungshinweis
        </p>
        <textarea
          value={regenNote}
          onChange={(e) => setRegenNote(e.target.value)}
          placeholder="Z.B. 'Mehr auf meine Python-Erfahrung eingehen' oder 'Formeller schreiben'"
          rows={3}
          className="w-full text-sm bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-500/30 rounded-lg p-3 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 resize-y"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { setShowRegenInput(false); setRegenNote(""); }}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all cursor-pointer"
          >
            Abbrechen
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isSubmittingRegen}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {isSubmittingRegen
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Wird gestartet…</>
              : <><RefreshCw className="w-3 h-3" /> Neu generieren</>}
          </button>
        </div>
      </div>
    )}

    {isLetterGenerating ? (
      <GeneratingSpinner
        phases={GENERATION_PHASES}
        phase={phase}
        elapsed={elapsed}
        phaseIndex={phaseIndex}
        onCancel={handleCancel}
      />
    ) : letterLoading ? (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        <span className="text-xs font-semibold">Lade Anschreiben…</span>
      </div>
    ) : letterPdfUrl && !letterEditMode ? (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden flex-1">
        <embed
          src={letterPdfUrl}
          type="application/pdf"
          className="w-full border-0"
          style={{ height: "680px" }}
        />
      </div>
    ) : letterPdfUrl && letterEditMode ? (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
        <iframe
          ref={letterIframeRef}
          sandbox="allow-same-origin"
          className="w-full border-0 bg-white"
          style={{ height: "680px" }}
          title="Anschreiben bearbeiten"
        />
      </div>
    ) : (
      <div className="group flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all">
        <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
          <FileText className="w-6 h-6 text-indigo-500" />
        </div>
        <div className="text-center px-6 max-w-xs space-y-1">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Noch kein Anschreiben</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">KI-generiert und auf dein Profil abgestimmt.</p>
        </div>
        <button
          onClick={() => onGenerate(job)}
          disabled={isLetterGenerating}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
        >
          {t("generateApplication") || "Bewerbung generieren"}
          <Zap className="w-3.5 h-3.5" />
        </button>
      </div>
    )}
  </div>
)}
```

---

### Task 4: Rewrite the Lebenslauf view

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

- [ ] **Step 1: Replace the entire `{activeView === "cv"}` block**

```tsx
{activeView === "cv" && (
  <div className="space-y-3 flex-1 flex flex-col">
    <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-900/50 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
        <button
          onClick={loadCvContent}
          disabled={cvLoading}
          className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
          title="Aktualisieren"
        >
          <RotateCw className={`w-3.5 h-3.5 ${cvLoading ? "animate-spin" : ""}`} />
        </button>
        {!cvGenerating && !cvEditMode && (
          <button
            onClick={handleRegenCv}
            disabled={cvGenerating || isLetterGenerating}
            className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{cvHtml ? "Neu generieren" : "Generieren"}</span>
          </button>
        )}
        {cvPdfUrl && !cvGenerating && !cvEditMode && (
          <button
            onClick={() => setCvEditMode(true)}
            className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Bearbeiten</span>
          </button>
        )}
        {cvEditMode && (
          <>
            <button
              onClick={handleCvSave}
              disabled={cvHtmlSaving}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                cvSaveStatus === "saved"
                  ? "text-white bg-emerald-600"
                  : cvSaveStatus === "error"
                    ? "text-white bg-rose-600"
                    : "text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm shadow-emerald-500/20"
              }`}
            >
              {cvHtmlSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {cvHtmlSaving ? "Speichert…" : cvSaveStatus === "saved" ? "Gespeichert" : cvSaveStatus === "error" ? "Fehler" : "Speichern"}
              </span>
            </button>
            <button
              onClick={() => setCvEditMode(false)}
              disabled={cvHtmlSaving}
              className="p-2 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Abbrechen</span>
            </button>
          </>
        )}
        {cvPdfUrl && !cvGenerating && !cvEditMode && (
          <button
            onClick={handleDownloadCv}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>
        )}
      </div>
    </div>

    {cvGenerating ? (
      <GeneratingSpinner
        phases={CV_PHASES}
        phase={cvPhase}
        elapsed={cvElapsed}
        phaseIndex={cvPhaseIndex}
        accentClass="emerald"
      />
    ) : cvLoading ? (
      <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
        <span className="text-xs font-semibold">Lade Lebenslauf…</span>
      </div>
    ) : cvPdfUrl && !cvEditMode ? (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden flex-1">
        <embed
          src={cvPdfUrl}
          type="application/pdf"
          className="w-full border-0"
          style={{ height: "680px" }}
        />
      </div>
    ) : cvPdfUrl && cvEditMode ? (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
        <iframe
          ref={cvIframeRef}
          sandbox="allow-same-origin"
          className="w-full border-0 bg-white"
          style={{ height: "680px" }}
          title="Lebenslauf bearbeiten"
        />
      </div>
    ) : (
      <div className="group flex flex-col items-center justify-center py-16 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20 hover:border-emerald-300 dark:hover:border-emerald-500/40 transition-all">
        <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
          <User className="w-6 h-6 text-emerald-500" />
        </div>
        <div className="text-center px-6 max-w-xs space-y-1">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Noch kein Lebenslauf</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">KI-optimiert auf Basis deines Profils und der Stellenanzeige.</p>
        </div>
        <button
          onClick={() => handleRegenCv()}
          disabled={cvGenerating}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-0.5 cursor-pointer disabled:opacity-50"
        >
          Lebenslauf generieren
          <Zap className="w-3.5 h-3.5" />
        </button>
      </div>
    )}
  </div>
)}
```

---

### Task 5: Remove unused RegenBanner import and verify TypeScript

**Files:**
- Modify: `frontend/app/components/JobCard/JobApplicationTab.tsx`

- [ ] **Step 1: Remove the `RegenBanner` import line**

```typescript
// Remove this line:
import RegenBanner from "./RegenBanner";
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors relating to JobApplicationTab.tsx

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/JobCard/JobApplicationTab.tsx
git commit -m "feat(application-tab): replace HTML iframe with native PDF viewer + edit mode toggle"
```
