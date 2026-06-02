"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "../../../components/LanguageProvider";

interface AddPlatformInputProps {
  newUrl: string;
  onUrlChange: (url: string) => void;
  onAdd: () => void;
  isProfileComplete: boolean;
  isLoading?: boolean;
  error?: string | null;
}

export default function AddPlatformInput({
  newUrl,
  onUrlChange,
  onAdd,
  isProfileComplete,
  isLoading = false,
  error = null,
}: AddPlatformInputProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative mt-3">
      {!isProfileComplete && (
        <div className="absolute inset-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60">
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            {t("completeProfileFirst")}
          </span>
        </div>
      )}
      <div className="mb-2 flex items-start gap-2 px-1 text-xs text-amber-700 dark:text-amber-400">
        <svg
          className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"
          />
        </svg>
        <span>{t("firstRunNotice")}</span>
      </div>
      <div className="flex items-center gap-2 p-2 pl-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 focus-within:border-indigo-300 dark:focus-within:border-indigo-800 transition-colors">
        <svg
          className="w-4 h-4 text-slate-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <input
          value={newUrl}
          onChange={(e) => onUrlChange(e.target.value)}
          className="flex-1 bg-transparent border-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-0 py-1 disabled:opacity-50"
          placeholder={t("addPlatformPlaceholder")}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          disabled={!isProfileComplete || isLoading}
        />
        <button
          onClick={onAdd}
          disabled={!isProfileComplete || !newUrl.trim() || isLoading}
          className="flex items-center gap-1.5 px-3 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white disabled:text-slate-400 dark:disabled:text-slate-600 text-xs font-semibold rounded-lg transition-all shadow-sm shadow-indigo-500/20 cursor-pointer disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isLoading ? (
            <svg
              className="w-3.5 h-3.5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          <span className="hidden sm:inline">{isLoading ? "..." : "Add"}</span>
        </button>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1.5 px-1 text-xs text-rose-600 dark:text-rose-400">
          <svg
            className="w-3.5 h-3.5 shrink-0 text-rose-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isLoading &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-backdrop-fade pointer-events-auto" />
            <div className="relative bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-5 animate-popup-entry pointer-events-auto">
              <div className="relative flex items-center justify-center">
                {/* Outer spinning ring */}
                <div className="w-20 h-20 rounded-full border-4 border-indigo-50 dark:border-indigo-950/30"></div>
                <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-t-indigo-600 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>

                {/* Center Icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-2xl">
                    <svg
                      className="w-8 h-8 text-indigo-600 animate-pulse"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  {t("adding")}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[240px] leading-relaxed px-4">
                  Analyzing platform structure and initializing the AI
                  crawler...
                </p>
              </div>

              {/* Status Dots */}
              <div className="flex gap-1.5 mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"></div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
