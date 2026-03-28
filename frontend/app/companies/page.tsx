"use client";

import React, { useEffect, useState } from "react";
import {
  Building2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import PageWrapper from "../components/PageWrapper";
import PageHeader from "../components/PageHeader";
import { useLanguage } from "../components/LanguageProvider";
import { useNotification } from "../components/NotificationProvider";
import { fetchWithAuth } from "../components/AuthProvider";
import CompanyProfileView from "../components/CompanyProfileView";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function CompanyCard({ company }: { company: any }) {
  const { showError } = useNotification();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState(false);
  const [data, setData] = useState<any>(company);

  const handleUpdate = () => {
    setLoading(true);
    fetchWithAuth(`${API_BASE}/companies/${data.domain}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force_refresh: true }),
    })
      .then((res) => {
        if (!res.ok)
          throw new Error(
            `POST /companies/${data.domain}/analyze → HTTP ${res.status}`,
          );
        setQueued(true);
      })
      .catch((e: Error) => showError(e.message))
      .finally(() => setLoading(false));
  };

  const d = data;
  const hasProfile = Boolean(
    d.executive_summary || d.structured_prep || d.deep_dive_analysis,
  );

  return (
    <div className="glass-card rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all hover:shadow-lg">
      {/* Company Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-5 bg-white/80 dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <span className="block text-sm font-bold text-slate-800 dark:text-slate-200">
              {d.name || d.domain}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {d.domain}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!hasProfile && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-lg">
              No Profile
            </span>
          )}
          <div
            className={`p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          >
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-6 pb-6 pt-2 border-t border-slate-100 dark:border-slate-800/50 animate-in slide-in-from-top-2 duration-300">
          {loading || queued ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse" />
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin relative z-10" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Company research in progress…
              </p>
            </div>
          ) : !hasProfile ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl mt-4 hover:border-indigo-400 dark:hover:border-indigo-500/50 transition-all">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm">
                <Building2 className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Deep Company Intelligence
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Gap Analysis, Elevator Pitch, Tactics &amp; Interview
                  Deep-Dives
                </p>
              </div>
              <button
                onClick={handleUpdate}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 cursor-pointer"
              >
                Start Analysis <TrendingUp className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-5 mt-4">
              {/* Toolbar */}
              <div className="flex items-center justify-end">
                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 dark:text-slate-400 dark:bg-slate-800 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                  />
                  Update Data
                </button>
              </div>
              <CompanyProfileView
                data={d}
                domain={d.domain}
                fetchWithAuth={fetchWithAuth}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompaniesPage() {
  const { t } = useLanguage();
  const { showError } = useNotification();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchWithAuth(`${API_BASE}/companies`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCompanies(data))
      .catch(() => showError("GET /companies fehlgeschlagen"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = companies.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (c.name || "").toLowerCase().includes(q) ||
      c.domain.toLowerCase().includes(q)
    );
  });

  return (
    <PageWrapper>
      <PageHeader
        title={t("companiesPageTitle")}
        subtitle={t("companiesDescription")}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company..."
          className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
          <Building2 className="w-12 h-12 opacity-30" />
          <p className="text-sm font-medium">
            {search ? "No matches." : "No company profiles available yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
            {filtered.length} {filtered.length === 1 ? "Company" : "Companies"}
          </p>
          {filtered.map((company) => (
            <CompanyCard key={company.domain} company={company} />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
