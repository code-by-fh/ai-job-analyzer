"use client";

import { useState, useEffect } from "react";

interface StyleValues {
  accent: string;
  fontBase: string;
  fontSize: string;
}

interface StylePanelProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

const FONT_OPTIONS = [
  { label: "DejaVu Sans", value: '"DejaVu Sans", Helvetica, Arial, sans-serif' },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
];

const ACCENT_SWATCHES = [
  "#111111", "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
];

export default function StylePanel({ iframeRef }: StylePanelProps) {
  const [values, setValues] = useState<StyleValues>({
    accent: "#111111",
    fontBase: '"DejaVu Sans", Helvetica, Arial, sans-serif',
    fontSize: "10.5pt",
  });

  function applyToIframe(next: StyleValues) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const root = doc.documentElement;
    root.style.setProperty("--accent", next.accent);
    root.style.setProperty("--font-base", next.fontBase);
    root.style.setProperty("--font-size", next.fontSize);
  }

  function update(patch: Partial<StyleValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    applyToIframe(next);
  }

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const cs = getComputedStyle(doc.documentElement);
      const accent = cs.getPropertyValue("--accent").trim();
      const fontBase = cs.getPropertyValue("--font-base").trim();
      const fontSize = cs.getPropertyValue("--font-size").trim();
      if (accent) setValues((v) => ({ ...v, accent }));
      if (fontBase) setValues((v) => ({ ...v, fontBase }));
      if (fontSize) setValues((v) => ({ ...v, fontSize }));
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [iframeRef]);

  return (
    <div className="space-y-5 p-4">
      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
          Akzentfarbe
        </label>
        <div className="flex flex-wrap gap-2">
          {ACCENT_SWATCHES.map((color) => (
            <button
              key={color}
              onClick={() => update({ accent: color })}
              className={`w-7 h-7 rounded-full border-2 transition-all active:scale-95 ${
                values.accent === color ? "border-indigo-500 scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: color }}
              aria-label={color}
            />
          ))}
          <input
            type="color"
            value={values.accent}
            onChange={(e) => update({ accent: e.target.value })}
            className="w-7 h-7 rounded-full border-2 border-slate-300 dark:border-slate-700 cursor-pointer"
            aria-label="Eigene Farbe"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
          Schriftart
        </label>
        <select
          value={values.fontBase}
          onChange={(e) => update({ fontBase: e.target.value })}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
          Schriftgröße
        </label>
        <select
          value={values.fontSize}
          onChange={(e) => update({ fontSize: e.target.value })}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          {["9pt", "9.5pt", "10pt", "10.5pt", "11pt", "11.5pt", "12pt"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
