"use client";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { fetchWithAuth } from "../../../components/AuthProvider";

interface LinkItem {
  url: string;
  text: string;
}

interface DetectedPattern {
  prefix: string;
  matches: LinkItem[];
}

function detectPattern(links: LinkItem[]): DetectedPattern | null {
  if (links.length === 0) return null;

  const groups = new Map<string, LinkItem[]>();

  for (const link of links) {
    try {
      const { pathname, search } = new URL(link.url);
      const segs = pathname.split("/").filter(Boolean);

      let prefix: string;
      if (segs.length >= 2) {
        prefix = "/" + segs[0] + "/" + segs[1];
      } else if (segs.length === 1) {
        prefix = "/" + segs[0];
        // For query-param based URLs like /rc/clk?jk=... treat whole path as prefix
        if (search) prefix = pathname;
      } else {
        continue;
      }

      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix)!.push(link);
    } catch {}
  }

  // Find largest group with at least 2 links that isn't just the root
  let best: DetectedPattern | null = null;
  for (const [prefix, matches] of groups) {
    if (prefix === "/" || prefix === "") continue;
    if (!best || matches.length > best.matches.length) {
      best = { prefix, matches };
    }
  }

  return best && best.matches.length >= 2 ? best : null;
}

function highlightUrl(url: string, commonPrefix: string) {
  const idx = url.indexOf(commonPrefix);
  if (idx === -1 || !commonPrefix) return <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">{url}</span>;
  const before = url.slice(0, idx + commonPrefix.length);
  const after = url.slice(idx + commonPrefix.length);
  return (
    <span className="font-mono text-[11px] break-all">
      <span className="text-slate-400 dark:text-slate-600">{before}</span>
      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{after}</span>
    </span>
  );
}

interface Props {
  url: string;
  onComplete: () => void;
  onClose: () => void;
}

type Phase = "loading" | "auto" | "manual" | "confirm_run" | "saving";

export default function PlatformSetupModal({ url, onComplete, onClose }: Props) {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [detected, setDetected] = useState<DetectedPattern | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const hostname = useMemo(() => {
    try { return new URL(url).hostname; } catch { return url; }
  }, [url]);
  const faviconUrl = useMemo(
    () => `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`,
    [hostname],
  );

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setPhase("loading");
    setError(null);
    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/preview-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((res) => res.json())
      .then((data) => {
        const allLinks: LinkItem[] = (data.links || []).filter((l: any) => l?.url);
        setLinks(allLinks);
        const pattern = detectPattern(allLinks);
        setDetected(pattern);
        if (pattern) {
          setSelected(new Set(pattern.matches.map((l) => l.url)));
          setPhase("auto");
        } else {
          // Pre-select by depth heuristic
          const preSelected = new Set(
            allLinks.filter((l) => {
              try {
                const segs = new URL(l.url).pathname.split("/").filter(Boolean);
                return segs.length >= 3;
              } catch { return false; }
            }).map((l) => l.url)
          );
          setSelected(preSelected);
          setPhase("manual");
        }
      })
      .catch(() => {
        setError("Links konnten nicht geladen werden.");
        setPhase("manual");
      });
  }, [url]);

  const filteredLinks = useMemo(
    () => links.filter((l) =>
      l.url.toLowerCase().includes(filter.toLowerCase()) ||
      l.text.toLowerCase().includes(filter.toLowerCase())
    ),
    [links, filter]
  );

  // Find common URL prefix for dimming in manual view
  const commonUrlPrefix = useMemo(() => {
    if (filteredLinks.length === 0) return "";
    try {
      const u = new URL(filteredLinks[0].url);
      return u.origin;
    } catch { return ""; }
  }, [filteredLinks]);

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const handleConfirm = (urls: string[]) => {
    if (urls.length === 0) return;
    setPendingUrls(urls);
    setPhase("confirm_run");
  };

  const doSetup = async (runInitialCrawl: boolean) => {
    setPhase("saving");
    setError(null);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/setup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            selected_urls: pendingUrls,
            run_initial_crawl: runInitialCrawl,
          }),
        }
      );
      if (res.ok) {
        onComplete();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Setup fehlgeschlagen.");
        setPhase("manual");
      }
    } catch {
      setError("Netzwerkfehler.");
      setPhase("manual");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={phase !== "saving" ? onClose : undefined} />

      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src={faviconUrl} alt="" className="w-6 h-6 rounded-md shrink-0" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Plattform einrichten
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-xs">
                  {hostname}
                </p>
              </div>
            </div>
            {phase !== "saving" && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors mt-0.5 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* LOADING */}
          {phase === "loading" && (
            <div className="flex flex-col items-center justify-center flex-1 gap-5 py-16 px-6">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-4 border-indigo-100 dark:border-indigo-950/40" />
                <div className="absolute inset-0 w-14 h-14 rounded-full border-4 border-t-indigo-600 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.1-1.1m.758-4.9a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Seite wird analysiert…</p>
                <p className="text-xs text-slate-400 mt-1">Links werden geladen und ausgewertet. Kann bis zu 30 Sek. dauern.</p>
              </div>
            </div>
          )}

          {/* SAVING */}
          {phase === "saving" && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 py-16 px-6">
              <div className="w-10 h-10 rounded-full border-4 border-t-indigo-600 border-indigo-100 dark:border-indigo-950/40 animate-spin" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Wird gespeichert…</p>
            </div>
          )}

          {/* CONFIRM RUN */}
          {phase === "confirm_run" && (
            <div className="flex flex-col flex-1 p-5 gap-4">
              <div className="flex items-start gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Erster Durchlauf</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Wie soll die Plattform gestartet werden?
                  </p>
                </div>
              </div>

              <button
                onClick={() => doSetup(true)}
                className="group flex items-start gap-4 p-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-indigo-500 transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Bekannte Jobs vormerken
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Alle aktuellen Job-URLs werden als „bekannt" gespeichert. Beim nächsten Lauf werden nur <span className="font-semibold text-slate-700 dark:text-slate-300">neue</span> Jobs analysiert — keine Benachrichtigungen für bereits vorhandene Stellen.
                  </p>
                </div>
              </button>

              <button
                onClick={() => doSetup(false)}
                className="group flex items-start gap-4 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-slate-300 dark:group-hover:bg-slate-600 transition-colors">
                  <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Sofort starten
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Die Plattform wird direkt aktiviert. Beim ersten Lauf werden <span className="font-semibold text-slate-700 dark:text-slate-300">alle</span> gefundenen Jobs analysiert und du erhältst Benachrichtigungen für alle aktuellen Stellen.
                  </p>
                </div>
              </button>

              <div className="mt-auto pt-2 flex justify-start">
                <button
                  onClick={() => setPhase(detected ? "auto" : "manual")}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Zurück zur Auswahl
                </button>
              </div>
            </div>
          )}

          {/* AUTO-DETECTION phase */}
          {phase === "auto" && detected && (
            <div className="flex flex-col flex-1 overflow-hidden p-5 gap-4">
              {/* Pattern badge */}
              <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800/50">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">Muster erkannt</p>
                  <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">
                    <span className="font-mono bg-indigo-100 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded text-indigo-800 dark:text-indigo-300">
                      {detected.prefix}
                    </span>
                    {" "}— {detected.matches.length} passende Links gefunden
                  </p>
                </div>
              </div>

              {/* Preview cards */}
              <div className="flex-1 overflow-y-auto space-y-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-0.5 mb-2">
                  Erkannte Job-Inserate (Vorschau)
                </p>
                {detected.matches.slice(0, 8).map((link) => (
                  <div key={link.url} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {link.text || "–"}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {link.url}
                      </p>
                    </div>
                  </div>
                ))}
                {detected.matches.length > 8 && (
                  <p className="text-xs text-slate-400 text-center py-2">
                    + {detected.matches.length - 8} weitere Links
                  </p>
                )}
              </div>
            </div>
          )}

          {/* MANUAL phase */}
          {phase === "manual" && (
            <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-800/50 text-xs text-rose-600 dark:text-rose-400">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {links.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 gap-3 py-12 text-center">
                  <svg className="w-10 h-10 text-slate-300 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
                  </svg>
                  <p className="text-sm text-slate-400">Keine Links auf der Seite gefunden.</p>
                </div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Links oder Titel filtern…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => setSelected(new Set(filteredLinks.map((l) => l.url)))}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline px-1.5 shrink-0"
                    >
                      Alle
                    </button>
                    <button
                      onClick={() => setSelected((prev) => { const n = new Set(prev); filteredLinks.forEach((l) => n.delete(l.url)); return n; })}
                      className="text-xs text-slate-500 hover:underline px-1.5 shrink-0"
                    >
                      Keine
                    </button>
                  </div>

                  <div className="text-xs text-slate-400 dark:text-slate-500 px-0.5">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">{selected.size}</span> von {links.length} ausgewählt
                  </div>

                  {/* Link list */}
                  <div className="flex-1 overflow-y-auto space-y-1.5">
                    {filteredLinks.map((link) => {
                      const isSelected = selected.has(link.url);
                      return (
                        <label
                          key={link.url}
                          className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                            isSelected
                              ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/50"
                              : "bg-slate-50 dark:bg-slate-800/40 border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(link.url)}
                            className="mt-0.5 accent-indigo-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            {link.text && (
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate mb-0.5">
                                {link.text}
                              </p>
                            )}
                            {highlightUrl(link.url, commonUrlPrefix)}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(phase === "auto" || phase === "manual") && (
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {phase === "auto" && (
                <button
                  onClick={() => { setPhase("manual"); }}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors underline underline-offset-2"
                >
                  Manuell auswählen
                </button>
              )}
              {phase === "manual" && detected && (
                <button
                  onClick={() => { setSelected(new Set(detected.matches.map((l) => l.url))); setPhase("auto"); }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline transition-colors"
                >
                  Zurück zur Vorschau
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors px-2"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleConfirm(
                  phase === "auto" && detected
                    ? detected.matches.map((l) => l.url)
                    : Array.from(selected)
                )}
                disabled={
                  phase === "auto"
                    ? !detected || detected.matches.length === 0
                    : selected.size === 0
                }
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 text-sm font-semibold rounded-xl transition-all disabled:cursor-not-allowed shadow-sm shadow-indigo-500/20 disabled:shadow-none"
              >
                {phase === "auto" && detected
                  ? `${detected.matches.length} Links bestätigen`
                  : `${selected.size} Links bestätigen`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
