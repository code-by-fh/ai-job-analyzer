import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  FileText,
  X,
  Building2,
  Tag,
  Clock,
  ChevronDown,
  LayoutGrid,
  SlidersHorizontal,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { STATUS_META } from "./JobCard/constants";
import { JobStatus } from "./JobStatusBadge";

const DynamicIcon = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => {
  const IconComponent = (LucideIcons as any)[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
};

const JOB_STATUSES = [
  "OPEN",
  "DRAFTED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "FAILED",
] as JobStatus[];

interface FilterBarProps {
  filterType: "all" | "favorite" | "no_favorite" | "applications";
  setFilterType: (
    type: "all" | "favorite" | "no_favorite" | "applications",
  ) => void;
  sortBy: "score" | "date";
  setSortBy: (sort: "score" | "date") => void;
  searchText: string;
  setSearchText: (text: string) => void;
  domainFilter: string;
  setDomainFilter: (domain: string) => void;
  availableDomains: { domain: string; count: number }[];
  hasApplication: boolean;
  setHasApplication: (v: boolean) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  statusCounts?: Record<string, number>;
  platformFilter: number | undefined;
  setPlatformFilter: (id: number | undefined) => void;
  availablePlatforms: { id: number; name: string }[];
  viewMode?: "list" | "board";
  setViewMode?: (mode: "list" | "board") => void;
}

export default function FilterBar({
  filterType,
  setFilterType,
  sortBy,
  setSortBy,
  searchText,
  setSearchText,
  domainFilter,
  setDomainFilter,
  availableDomains,
  hasApplication,
  setHasApplication,
  statusFilter,
  setStatusFilter,
  statusCounts = {},
  platformFilter,
  setPlatformFilter,
  availablePlatforms = [],
  viewMode = "list",
  setViewMode,
}: FilterBarProps) {
  const { t } = useLanguage();
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters =
    searchText ||
    domainFilter ||
    statusFilter ||
    hasApplication ||
    filterType !== "all" ||
    platformFilter !== undefined;

  const clearAllFilters = () => {
    setSearchText("");
    setDomainFilter("");
    setStatusFilter("");
    setHasApplication(false);
    setPlatformFilter(undefined);
    setFilterType("all");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedStatusMeta = statusFilter ? STATUS_META[statusFilter] : null;

  if (filterType === "applications") return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Tabs + Search + Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Segmented Control */}
        <div className="flex bg-slate-100/80 dark:bg-slate-800/50 backdrop-blur-md p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 shadow-sm shrink-0">
          {[
            { id: "all", label: t("all") },
            { id: "favorite", label: t("favorites") },
            { id: "no_favorite", label: t("noFavorites") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setFilterType(tab.id as "all" | "favorite" | "no_favorite")
              }
              className={`flex-1 sm:flex-none px-5 py-2 text-sm font-bold rounded-xl transition-all duration-300 whitespace-nowrap cursor-pointer ${
                filterType === tab.id
                  ? "bg-white dark:bg-slate-700 shadow-lg shadow-indigo-500/10 text-indigo-600 dark:text-indigo-400 scale-[1.02]"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 group min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t("filterSearchPlaceholder")}
            className="w-full pl-11 pr-10 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-200 placeholder-slate-400 transition-all shadow-sm hover:shadow-md"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Mode Toggle */}
        {setViewMode && (
          <div className="flex bg-slate-100/80 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 shadow-sm shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center justify-center p-2 rounded-xl transition-all duration-300 cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400 scale-[1.02]"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title={t("listView" as any) || "List View"}
            >
              <LucideIcons.List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={`flex items-center justify-center p-2 rounded-xl transition-all duration-300 cursor-pointer ${
                viewMode === "board"
                  ? "bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400 scale-[1.02]"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title={t("boardView" as any) || "Board View"}
            >
              <LucideIcons.Kanban className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Sort */}
        <div className="flex bg-slate-100/80 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 shadow-sm shrink-0">
          <button
            onClick={() => setSortBy("score")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300 cursor-pointer ${
              sortBy === "score"
                ? "bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400 scale-[1.02]"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
            title={t("relevance")}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden lg:inline">{t("relevance")}</span>
          </button>
          <button
            onClick={() => setSortBy("date")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all duration-300 cursor-pointer ${
              sortBy === "date"
                ? "bg-white dark:bg-slate-700 shadow-md text-indigo-600 dark:text-indigo-400 scale-[1.02]"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
            title={t("newest")}
          >
            <Clock className="w-4 h-4" />
            <span className="hidden lg:inline">{t("newest")}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Selects + Toggles */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Platform Select */}
        <div className="relative group flex-1 min-w-[130px]">
          <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
          <select
            value={platformFilter || ""}
            onChange={(e) =>
              setPlatformFilter(
                e.target.value ? Number(e.target.value) : undefined,
              )
            }
            className="w-full appearance-none pl-9 pr-8 py-2.5 text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm"
          >
            <option value="">{t("allPlatforms")}</option>
            {availablePlatforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* Domain Select */}
        <div className="relative group flex-1 min-w-[130px]">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="w-full appearance-none pl-9 pr-8 py-2.5 text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm"
          >
            <option value="">{t("allDomains")}</option>
            {availableDomains.map(({ domain, count }) => (
              <option key={domain} value={domain}>
                {domain} ({count})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* Status Dropdown */}
        <div className="relative flex-1 min-w-[130px]" ref={statusDropdownRef}>
          <button
            onClick={() => setIsStatusOpen(!isStatusOpen)}
            className="w-full flex items-center gap-2 pl-9 pr-3 py-2.5 text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-300 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 shadow-sm"
          >
            {selectedStatusMeta ? (
              <DynamicIcon
                name={selectedStatusMeta.icon}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500"
              />
            ) : (
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            )}
            <span className="flex-1 text-left truncate">
              {selectedStatusMeta
                ? t(selectedStatusMeta.labelKey)
                : t("allStatuses")}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${isStatusOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isStatusOpen && (
            <div className="absolute left-0 right-0 mt-1.5 p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl z-[150]">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setIsStatusOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[13px] font-bold transition-all ${
                  !statusFilter
                    ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center border border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50">
                  <Tag className="w-3.5 h-3.5" />
                </div>
                {t("allStatuses")}
              </button>

              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2" />

              <div className="max-h-56 overflow-y-auto custom-scrollbar">
                {JOB_STATUSES.map((s) => {
                  const meta = STATUS_META[s];
                  const isActive = statusFilter === s;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        setStatusFilter(s);
                        setIsStatusOpen(false);
                      }}
                      className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-xl text-[12px] font-bold transition-all ${
                        isActive
                          ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                          : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-colors ${
                          isActive
                            ? "bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-500/30 text-indigo-500"
                            : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 text-slate-400"
                        }`}
                      >
                        <DynamicIcon name={meta.icon} className="w-3.5 h-3.5" />
                      </div>
                      <span className="flex-1 text-left">
                        {t(meta.labelKey)}
                      </span>
                      {statusCounts[s] != null && (
                        <span
                          className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${isActive ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"}`}
                        >
                          {statusCounts[s]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* hasApplication Toggle */}
        <button
          onClick={() => setHasApplication(!hasApplication)}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition-all duration-200 cursor-pointer whitespace-nowrap shadow-sm active:scale-95 shrink-0 ${
            hasApplication
              ? "bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300 ring-2 ring-indigo-500/10"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300"
          }`}
        >
          <FileText
            className={`w-4 h-4 ${hasApplication ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400"}`}
          />
          {t("withApplication")}
        </button>

        {/* Clear All */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="p-2.5 text-rose-500 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl hover:bg-rose-100 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
            title={t("clearAllFilters")}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
