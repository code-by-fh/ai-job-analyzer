"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth, fetchWithAuth } from "../../components/AuthProvider";
import { useLanguage } from "../../components/LanguageProvider";
import { useRouter } from "next/navigation";
import PageWrapper from "../../components/PageWrapper";
import PageHeader from "../../components/PageHeader";
import ConfirmModal from "../../components/ConfirmModal";
import { logger } from "../../lib/logger";
import {
  Key,
  Bot,
  ChevronDown,
  CheckCircle2,
  RefreshCw,
  Search,
  X,
  ExternalLink,
  Trash2,
} from "lucide-react";
import TemplateManager from "../../components/TemplateManager";

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number | null;
  pricing: {
    prompt?: string;
    completion?: string;
  };
}

const TASK_LABELS: Record<string, string> = {
  job_analysis: "Job-Analyse",
  cover_letter: "Anschreiben generieren",
  cv_tailoring: "CV-Tailoring",
  interview_prep: "Interview-Vorbereitung",
  company_profile: "Firmenprofil",
  deep_dive: "Deep-Dive-Analyse",
  extract_job_details: "Job-Details extrahieren",
  platform_name: "Platform-Name generieren",
};

const TASK_DEFAULTS: Record<string, string> = {
  job_analysis: "cloud",
  cover_letter: "cloud",
  cv_tailoring: "local",
  interview_prep: "cloud",
  company_profile: "cloud",
  deep_dive: "cloud",
  extract_job_details: "cloud",
  platform_name: "cloud",
};

export default function AdminSettingsPage() {
  const { user, token, isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [ollamaModel, setOllamaModel] = useState("llama3.1:8b");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusOpenRouter, setStatusOpenRouter] = useState("");
  const [statusOllama, setStatusOllama] = useState("");

  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipePassword, setWipePassword] = useState("");
  const [wipeAllUsers, setWipeAllUsers] = useState(false);
  const [wipeStatus, setWipeStatus] = useState("");
  const [wipeLoading, setWipeLoading] = useState(false);

  const [redisCleanupStatus, setRedisCleanupStatus] = useState("");
  const [redisCleanupLoading, setRedisCleanupLoading] = useState(false);

  const [orTestStatus, setOrTestStatus] = useState("");
  const [orTestLoading, setOrTestLoading] = useState(false);
  const [ollamaTestStatus, setOllamaTestStatus] = useState("");
  const [ollamaTestLoading, setOllamaTestLoading] = useState(false);

  const [taskRouting, setTaskRouting] = useState<Record<string, string>>({});
  const [statusRouting, setStatusRouting] = useState("");

  const handleTestOpenRouter = async () => {
    setOrTestLoading(true);
    setOrTestStatus("Testing...");
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/test/openrouter`,
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok) {
        setOrTestStatus(`Connected — model: ${data.model}`);
      } else {
        setOrTestStatus(`Error: ${data.detail || "Connection failed"}`);
      }
    } catch {
      setOrTestStatus("Network error");
    } finally {
      setOrTestLoading(false);
    }
  };

  const handleTestOllama = async () => {
    setOllamaTestLoading(true);
    setOllamaTestStatus("Testing...");
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/test/ollama`,
        { method: "POST" },
      );
      const data = await res.json();
      if (res.ok) {
        const modelNote = data.model_found
          ? `model "${data.model}" ready`
          : `server reachable — model "${data.model}" not found locally (available: ${(data.available_models ?? []).join(", ") || "none"})`;
        setOllamaTestStatus(`Connected — ${modelNote}`);
      } else {
        setOllamaTestStatus(`Error: ${data.detail || "Connection failed"}`);
      }
    } catch {
      setOllamaTestStatus("Network error");
    } finally {
      setOllamaTestLoading(false);
    }
  };

  const handleRedisCleanup = async () => {
    setRedisCleanupLoading(true);
    setRedisCleanupStatus("Cleaning...");
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/redis/cleanup`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        const data = await res.json();
        setRedisCleanupStatus(
          data.removed > 0
            ? `${data.removed} stale job(s) removed.`
            : "No stale jobs found.",
        );
      } else {
        setRedisCleanupStatus("Error: cleanup failed");
      }
    } catch (e) {
      setRedisCleanupStatus("Network error");
    } finally {
      setRedisCleanupLoading(false);
      setTimeout(() => setRedisCleanupStatus(""), 5000);
    }
  };

  const handleWipeDatabase = async () => {
    if (!wipePassword) {
      setWipeStatus("Password required");
      setShowWipeModal(false);
      return;
    }

    setWipeLoading(true);
    setWipeStatus("Wiping database...");

    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/database/wipe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: wipePassword,
            wipe_all_users: wipeAllUsers,
          }),
        },
      );

      if (res.ok) {
        setWipeStatus("Database successfully reset.");
        try {
          localStorage.removeItem("crawl_last_run");
        } catch (e) {
          logger.error("Failed to clear localStorage after wipe");
        }
      } else {
        const data = await res.json();
        setWipeStatus(`Error: ${data.detail || "Could not wipe database"}`);
      }
    } catch (e) {
      setWipeStatus("Network error while wiping database");
    } finally {
      setWipeLoading(false);
      setWipePassword("");
    }

    setTimeout(() => setWipeStatus(""), 5000);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (user && !user.is_admin) {
      router.push("/");
      return;
    }
    if (token) fetchSettings();
  }, [isAuthenticated, user, token]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/settings`,
      );
      if (res.ok) {
        const data = await res.json();
        setModel(data.openrouter_model);
        setApiKeySet(data.openrouter_api_key_set ?? false);
        setOllamaModel(data.ollama_model || "llama3.1:8b");
        setOllamaBaseUrl(data.ollama_base_url || "");
        setTaskRouting(data.ai_task_routing || {});
      }
    } catch (e) {
      logger.error({ err: e }, "Fetch settings failed");
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/openrouter/models`,
      );
      if (res.ok) {
        const data: OpenRouterModel[] = await res.json();
        setModels(data);
        setDropdownOpen(true);
      } else {
        const err = await res.json();
        setModelsError(err.detail || "Failed to load models");
      }
    } catch (e) {
      setModelsError("Network error loading models");
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const handleSaveOpenRouter = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusOpenRouter("Saving...");
    try {
      const payload: Record<string, string | null> = {
        openrouter_model: model,
      };
      if (apiKey !== "") payload.openrouter_api_key = apiKey || null;
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/settings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setStatusOpenRouter("Saved successfully!");
        setApiKeySet(data.openrouter_api_key_set ?? false);
        setApiKey("");
      } else {
        setStatusOpenRouter("Error saving settings");
      }
    } catch {
      setStatusOpenRouter("Error saving settings");
    }
    setTimeout(() => setStatusOpenRouter(""), 3000);
  };

  const handleSaveOllama = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusOllama("Saving...");
    try {
      const payload = {
        ollama_model: ollamaModel,
        ollama_base_url: ollamaBaseUrl || null,
      };
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/settings`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setStatusOllama("Saved successfully!");
        if (data.ollama_model) setOllamaModel(data.ollama_model);
        if (data.ollama_base_url !== undefined) setOllamaBaseUrl(data.ollama_base_url);
      } else {
        setStatusOllama("Error saving settings");
      }
    } catch {
      setStatusOllama("Error saving settings");
    }
    setTimeout(() => setStatusOllama(""), 3000);
  };

  const handleSaveRouting = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusRouting("Saving...");
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ai_task_routing: taskRouting }),
        },
      );
      if (res.ok) {
        setStatusRouting("Saved successfully!");
      } else {
        setStatusRouting("Error saving routing");
      }
    } catch {
      setStatusRouting("Error saving routing");
    }
    setTimeout(() => setStatusRouting(""), 3000);
  };

  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.id.toLowerCase().includes(modelSearch.toLowerCase());
    const isFree = parseFloat(m.pricing?.prompt ?? "0") === 0;
    return matchesSearch && (!freeOnly || isFree);
  });

  const selectedModel = models.find((m) => m.id === model);

  const formatPrice = (price: string | undefined) => {
    if (!price) return null;
    const num = parseFloat(price);
    if (num === 0) return "free";
    return `$${(num * 1_000_000).toFixed(2)}/M`;
  };

  const formatContext = (ctx: number | null) => {
    if (!ctx) return null;
    if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
    if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
    return `${ctx}`;
  };

  if (!user || !user.is_admin)
    return (
      <div className="p-8 text-center text-slate-500 animate-pulse">
        {t("verifyingClearance") || "Verifying..."}
      </div>
    );

  return (
    <PageWrapper>
      <PageHeader
        title={t("adminControlPanel")}
        subtitle={t("adminSettingsDescription")}
      />

      <div className="space-y-8 relative z-20">
        {/* Cloud AI Model (OpenRouter) */}
        <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSaveOpenRouter} className="space-y-6">
            {/* API Key Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Key className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  OpenRouter API Key
                </h3>
                {apiKeySet && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Key configured
                  </span>
                )}
              </div>
              <input
                id="openrouter-api-key"
                type="password"
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  apiKeySet
                    ? "••••••••  (leave blank to keep current)"
                    : "sk-or-v1-..."
                }
                autoComplete="off"
              />
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Your{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:underline inline-flex items-center gap-0.5"
                >
                  OpenRouter API key
                  <ExternalLink className="w-3 h-3" />
                </a>
                {". "}
                If set, this overrides the server environment variable for all AI
                operations.
                {apiKeySet && (
                  <button
                    type="button"
                    className="ml-2 text-rose-500 hover:underline"
                    onClick={() => setApiKey("")}
                  >
                    Clear key
                  </button>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestOpenRouter}
                disabled={orTestLoading || !apiKeySet}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3 h-3 ${orTestLoading ? "animate-spin" : ""}`} />
                Test connection
              </button>
              {orTestStatus && (
                <span className={`text-xs font-medium ${orTestStatus.startsWith("Error") || orTestStatus.startsWith("Network") ? "text-rose-500" : "text-emerald-500"}`}>
                  {orTestStatus}
                </span>
              )}
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800" />

            {/* Model Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  AI Model
                </h3>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1" ref={dropdownRef}>
                  <button
                    type="button"
                    id="model-selector"
                    className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer"
                    onClick={() => {
                      if (models.length > 0) {
                        setDropdownOpen((o) => !o);
                      } else {
                        fetchModels();
                      }
                    }}
                  >
                    <div className="min-w-0">
                      {selectedModel ? (
                        <div>
                          <span className="block text-sm font-medium text-slate-900 dark:text-white truncate">
                            {selectedModel.name}
                          </span>
                          <span className="block text-xs text-slate-400 font-mono truncate">
                            {selectedModel.id}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500 font-mono truncate">
                          {model || "Select a model..."}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 ml-2 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {dropdownOpen && models.length > 0 && (
                    <div className="absolute z-[100] mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl shadow-slate-900/20 overflow-hidden">
                      <div className="p-2 space-y-1.5 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                          <Search className="w-4 h-4 text-slate-400 shrink-0" />
                          <input
                            type="text"
                            autoFocus
                            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                            placeholder="Search models..."
                            value={modelSearch}
                            onChange={(e) => setModelSearch(e.target.value)}
                          />
                          {modelSearch && (
                            <button
                              type="button"
                              onClick={() => setModelSearch("")}
                            >
                              <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                            </button>
                          )}
                        </div>
                        <div className="px-1">
                          <button
                            type="button"
                            onClick={() => setFreeOnly((v) => !v)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                              freeOnly
                                ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${freeOnly ? "bg-white" : "bg-slate-300 dark:bg-slate-600"}`}
                            />
                            Only free models
                          </button>
                        </div>
                      </div>
                      <ul className="max-h-72 overflow-y-auto py-1">
                        {filteredModels.length === 0 ? (
                          <li className="px-4 py-3 text-sm text-slate-400 text-center">
                            No models found
                          </li>
                        ) : (
                          filteredModels.map((m) => (
                            <li key={m.id}>
                              <button
                                type="button"
                                className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${model === m.id ? "bg-indigo-50 dark:bg-indigo-900/20" : ""}`}
                                onClick={() => {
                                  setModel(m.id);
                                  setDropdownOpen(false);
                                  setModelSearch("");
                                }}
                              >
                                <div className="min-w-0">
                                  <span
                                    className={`block text-sm font-medium truncate ${model === m.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200"}`}
                                  >
                                    {m.name}
                                  </span>
                                  <span className="block text-xs text-slate-400 font-mono truncate">
                                    {m.id}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-4">
                                  {formatContext(m.context_length) && (
                                    <span className="text-xs text-slate-400 whitespace-nowrap">
                                      {formatContext(m.context_length)} ctx
                                    </span>
                                  )}
                                  {formatPrice(m.pricing?.prompt) && (
                                    <span
                                      className={`text-xs font-medium whitespace-nowrap px-1.5 py-0.5 rounded ${formatPrice(m.pricing?.prompt) === "free" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}
                                    >
                                      {formatPrice(m.pricing?.prompt)}
                                    </span>
                                  )}
                                  {model === m.id && (
                                    <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                                  )}
                                </div>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  title="Load models from OpenRouter"
                  onClick={fetchModels}
                  disabled={modelsLoading}
                  className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${modelsLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              {modelsError && (
                <p className="text-xs text-rose-500">
                  {modelsError}. Make sure your API key is saved first.
                </p>
              )}

              {models.length === 0 && !modelsLoading && (
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Current model:{" "}
                  <code className="text-indigo-500">
                    {model || "tngtech/deepseek-r1t2-chimera:free"}
                  </code>
                  . Click the refresh button to load available models from
                  OpenRouter.
                </p>
              )}
              {models.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  {models.length} models loaded from OpenRouter.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer"
              >
                Save Cloud Configuration
              </button>
              {statusOpenRouter && (
                <span
                  className={`text-sm font-bold ${statusOpenRouter.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}
                >
                  {statusOpenRouter}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Local AI Model (Ollama / LM Studio) */}
        <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSaveOllama} className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Local LLM (LM Studio / Ollama)
                </h3>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Server URL
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-mono text-sm"
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                />
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  OpenAI-compatible endpoint of your local LM Studio or Ollama server. Leave blank to use the default (<code className="text-violet-500">http://localhost:11434/v1</code>).
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Model name
                </label>
                <input
                  type="text"
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-mono text-sm"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="llama3.1:8b"
                />
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Model identifier as shown in LM Studio or by <code className="text-violet-500">ollama list</code>. Used for CV tailoring.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestOllama}
                disabled={ollamaTestLoading}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3 h-3 ${ollamaTestLoading ? "animate-spin" : ""}`} />
                Test connection
              </button>
              {ollamaTestStatus && (
                <span className={`text-xs font-medium ${ollamaTestStatus.startsWith("Error") || ollamaTestStatus.startsWith("Network") ? "text-rose-500" : ollamaTestStatus.includes("not found") ? "text-amber-500" : "text-emerald-500"}`}>
                  {ollamaTestStatus}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer"
              >
                Save Local Configuration
              </button>
              {statusOllama && (
                <span
                  className={`text-sm font-bold ${statusOllama.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}
                >
                  {statusOllama}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* AI Task Routing */}
        <div className="bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSaveRouting} className="space-y-6">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                AI Task Routing
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-500 -mt-4">
              Configure which provider handles each AI task.
            </p>

            <div className="space-y-3">
              {Object.entries(TASK_LABELS).map(([key, label]) => {
                const value = taskRouting[key] ?? TASK_DEFAULTS[key];
                return (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-700 dark:text-slate-300 min-w-0 truncate">
                      {label}
                    </span>
                    <select
                      value={value}
                      onChange={(e) =>
                        setTaskRouting((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="shrink-0 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
                    >
                      <option value="cloud">OpenRouter (Cloud)</option>
                      <option value="local">Local LLM</option>
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/20 transition active:scale-95 cursor-pointer"
              >
                Save Routing
              </button>
              {statusRouting && (
                <span
                  className={`text-sm font-bold ${statusRouting.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}
                >
                  {statusRouting}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Notification Templates */}
      <div className="relative z-10 mt-8 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            Globale Benachrichtigungs-Templates
          </h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
          Templates, die hier angelegt werden, sind für alle Nutzer verfügbar
          (als globale Vorlagen) – für Pushover{" "}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            und
          </span>{" "}
          E-Mail.
        </p>
        <TemplateManager isAdmin={true} adminMode={true} />
      </div>

      {/* Maintenance */}
      <div className="relative z-10 mt-8 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">
          Maintenance
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Remove crawl jobs from Redis that have been stuck for more than 5
          minutes. This runs automatically every minute but can be triggered
          manually.
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleRedisCleanup}
            disabled={redisCleanupLoading}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-amber-500/20 transition active:scale-95 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            {redisCleanupLoading ? "Cleaning..." : "Clean up stale Redis jobs"}
          </button>
          {redisCleanupStatus && (
            <span
              className={`text-sm font-bold ${redisCleanupStatus.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}
            >
              {redisCleanupStatus}
            </span>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="relative z-10 mt-8 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-rose-200 dark:border-rose-900">
        <h3 className="text-lg font-bold text-rose-600 dark:text-rose-500 mb-2">
          Danger Zone
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Here you can completely reset the database. This will delete all jobs,
          generated applications, interview materials, linked platforms and
          company profiles. User accounts and global settings are preserved.
        </p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowWipeModal(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-rose-500/20 transition active:scale-95 cursor-pointer"
          >
            Wipe Database...
          </button>
          {wipeStatus && (
            <span
              className={`text-sm font-bold ${wipeStatus.includes("Error") ? "text-rose-500" : "text-emerald-500"}`}
            >
              {wipeStatus}
            </span>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showWipeModal}
        onClose={() => {
          setShowWipeModal(false);
          setWipePassword("");
          setWipeStatus("");
        }}
        onConfirm={handleWipeDatabase}
        title="Wipe database irrevocably"
        message="Are you sure you want to wipe the database? This cannot be undone."
        confirmText={wipeLoading ? "Wiping..." : "Permanently Wipe"}
        cancelText="Cancel"
        isDestructive
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50">
            <input
              type="checkbox"
              id="wipeAllUsers"
              checked={wipeAllUsers}
              onChange={(e) => setWipeAllUsers(e.target.checked)}
              className="appearance-none w-4 h-4 border border-rose-400 dark:border-rose-600 rounded bg-white dark:bg-slate-900 checked:bg-rose-500 checked:border-rose-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors shrink-0"
            />
            <label
              htmlFor="wipeAllUsers"
              className="text-sm text-rose-800 dark:text-rose-400 cursor-pointer leading-tight font-medium"
            >
              Wipe entire database (remove data for ALL users)
            </label>
          </div>

          {!wipeAllUsers && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              If disabled, only the jobs, platforms and entries of your{" "}
              <b>own admin account</b> will be completely deleted.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirm Admin Password:
            </label>
            <input
              type="password"
              value={wipePassword}
              onChange={(e) => setWipePassword(e.target.value)}
              placeholder="Your password"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            />
          </div>
        </div>
      </ConfirmModal>
    </PageWrapper>
  );
}
