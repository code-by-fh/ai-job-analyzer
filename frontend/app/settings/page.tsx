"use client";
import { useEffect, useState } from "react";
import { useAuth, fetchWithAuth } from "../components/AuthProvider";
import PasswordInput from "../components/PasswordInput";
import PageWrapper from "../components/PageWrapper";
import PageHeader from "../components/PageHeader";
import { useLanguage } from "../components/LanguageProvider";
import { useNotification } from "../components/NotificationProvider";
import { logger } from "../lib/logger";
import {
  Bell,
  Globe,
  Smartphone,
  Mail,
  Save,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Info,
  ExternalLink,
  Send,
  X,
  HardDrive,
  Database,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import TemplateManager from "../components/TemplateManager";

function SettingsCard({
  title,
  subtitle,
  icon,
  children,
  footer,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative z-10 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800 ${className}`}
    >
      <div className="flex items-center gap-3 mb-6">
        {icon && <div className="text-indigo-500">{icon}</div>}
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
      {footer && (
        <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
          {footer}
        </div>
      )}
    </section>
  );
}

const TABS = ["general", "notifications", "storage"] as const;
type Tab = (typeof TABS)[number];

export default function Settings() {
  const { user, token } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { showError, showSuccess } = useNotification();

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [uiLanguage, setUiLanguage] = useState<"de" | "en">("de");
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [tzStatus, setTzStatus] = useState("");
  const [matchThreshold, setMatchThreshold] = useState("0");
  const [mtStatus, setMtStatus] = useState("");

  useEffect(() => {
    const tab = searchParams.get("tab") as Tab;
    if (tab && TABS.includes(tab)) {
      setActiveTab(tab);
    }

    const success = searchParams.get("success");
    if (success === "google_connected") {
      showSuccess(
        t("googleDriveConnected") || "Google Drive connected successfully",
      );
    }

    const error = searchParams.get("error");
    if (error === "google_auth_failed") {
      showError("Google Drive authentication failed");
    }
  }, [searchParams, t, showSuccess, showError]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/settings?${params.toString()}`);
  };

  useEffect(() => {
    setUiLanguage(language);
  }, [language]);

  const handleLanguageChange = async (lang: "de" | "en") => {
    setUiLanguage(lang);
    setLanguage(lang);
  };

  const handleTimezoneChange = async (tz: string) => {
    setTimezone(tz);
    setTzStatus(t("timezoneSaving"));
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/timezone-preference`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: tz }),
        },
      );
      setTzStatus(t("timezoneSaved"));
      setTimeout(() => setTzStatus(""), 2500);
    } catch {
      setTzStatus(t("timezoneError"));
    }
  };

  const handleMatchThresholdSave = async () => {
    const val = Math.min(
      100,
      Math.max(0, parseInt(matchThreshold || "0", 10) || 0),
    );
    setMatchThreshold(String(val));
    setMtStatus(t("matchThresholdSaving"));
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/matching-preference`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ match_threshold: val }),
        },
      );
      setMtStatus(t("matchThresholdSaved"));
      setTimeout(() => setMtStatus(""), 2500);
    } catch {
      setMtStatus(t("matchThresholdError"));
    }
  };

  type AdapterKey = "pushover" | "resend" | "mailjet" | "smtp";
  type AdapterStatus = "idle" | "saving" | "saved" | "error";

  const [formData, setFormData] = useState({
    pushover_user_key: "",
    pushover_api_token: "",
    resend_api_key: "",
    resend_from_email: "",
    mailjet_api_key: "",
    mailjet_secret_key: "",
    mailjet_from_email: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_from_email: "",
  });
  const [savedData, setSavedData] = useState({
    pushover_user_key: "",
    pushover_api_token: "",
    resend_api_key: "",
    resend_from_email: "",
    mailjet_api_key: "",
    mailjet_secret_key: "",
    mailjet_from_email: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_from_email: "",
  });
  const [adapterStatus, setAdapterStatus] = useState<
    Record<AdapterKey, AdapterStatus>
  >({
    pushover: "idle",
    resend: "idle",
    mailjet: "idle",
    smtp: "idle",
  });

  type TestStatus = "idle" | "testing" | "sent" | "error";
  const [testStatus, setTestStatus] = useState<Record<AdapterKey, TestStatus>>({
    pushover: "idle",
    resend: "idle",
    mailjet: "idle",
    smtp: "idle",
  });
  const [testModal, setTestModal] = useState<{
    adapter: AdapterKey;
    recipient: string;
  } | null>(null);

  // Storage integration state
  const [storageStatus, setStorageStatus] = useState({
    service: "NONE",
    google_drive_email: "",
  });
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`)
        .then((res) => res.json())
        .then((data) => {
          const profileData = data.profile || {};
          const loadedData = {
            pushover_user_key: profileData.pushover_user_key || "",
            pushover_api_token: profileData.pushover_api_token || "",
            resend_api_key: profileData.resend_api_key || "",
            resend_from_email: profileData.resend_from_email || "",
            mailjet_api_key: profileData.mailjet_api_key || "",
            mailjet_secret_key: profileData.mailjet_secret_key || "",
            mailjet_from_email: profileData.mailjet_from_email || "",
            smtp_host: profileData.smtp_host || "",
            smtp_port: profileData.smtp_port
              ? String(profileData.smtp_port)
              : "587",
            smtp_user: profileData.smtp_user || "",
            smtp_password: profileData.smtp_password || "",
            smtp_from_email: profileData.smtp_from_email || "",
          };
          setFormData(loadedData);
          setSavedData(loadedData);
          if (profileData.timezone) setTimezone(profileData.timezone);
          if (profileData.match_threshold != null)
            setMatchThreshold(String(profileData.match_threshold));

          setStorageStatus({
            service: profileData.active_storage_service || "NONE",
            google_drive_email: profileData.google_drive_email || "",
          });

          setLoading(false);
        })
        .catch((e) => {
          logger.error({ err: e }, "Settings load error");
          showError(`GET /settings-view fehlgeschlagen: ${e?.message || e}`);
          setLoading(false);
        });
    }
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSaveAdapter = async (adapter: AdapterKey) => {
    setAdapterStatus((prev) => ({ ...prev, [adapter]: "saving" }));
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/notification-settings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            smtp_port: formData.smtp_port
              ? parseInt(formData.smtp_port, 10)
              : 587,
          }),
        },
      );
      setSavedData(formData);
      setAdapterStatus((prev) => ({ ...prev, [adapter]: "saved" }));
      setTimeout(
        () => setAdapterStatus((prev) => ({ ...prev, [adapter]: "idle" })),
        2500,
      );
    } catch (e: any) {
      showError(e?.message || t("error"));
      setAdapterStatus((prev) => ({ ...prev, [adapter]: "error" }));
      setTimeout(
        () => setAdapterStatus((prev) => ({ ...prev, [adapter]: "idle" })),
        3000,
      );
    }
  };

  const adapterEndpoints: Record<AdapterKey, string> = {
    pushover: "/notification-settings/test-pushover",
    resend: "/notification-settings/test-resend",
    mailjet: "/notification-settings/test-mailjet",
    smtp: "/notification-settings/test-smtp",
  };

  const needsRecipient: Record<AdapterKey, boolean> = {
    pushover: false,
    resend: true,
    mailjet: true,
    smtp: true,
  };

  const handleTestAdapter = async (adapter: AdapterKey, recipient?: string) => {
    setTestStatus((prev) => ({ ...prev, [adapter]: "testing" }));
    try {
      const body = needsRecipient[adapter]
        ? { recipient: recipient || "" }
        : undefined;
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}${adapterEndpoints[adapter]}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || t("testFailed"));
      }
      setTestStatus((prev) => ({ ...prev, [adapter]: "sent" }));
      setTimeout(
        () => setTestStatus((prev) => ({ ...prev, [adapter]: "idle" })),
        3000,
      );
    } catch (e: any) {
      showError(e?.message || t("testFailed"));
      setTestStatus((prev) => ({ ...prev, [adapter]: "error" }));
      setTimeout(
        () => setTestStatus((prev) => ({ ...prev, [adapter]: "idle" })),
        3000,
      );
    }
  };

  const handleTestClick = (adapter: AdapterKey) => {
    if (needsRecipient[adapter]) {
      setTestModal({ adapter, recipient: "" });
    } else {
      handleTestAdapter(adapter);
    }
  };

  const handleTestModalSubmit = () => {
    if (!testModal) return;
    const { adapter, recipient } = testModal;
    setTestModal(null);
    handleTestAdapter(adapter, recipient);
  };

  const handleGoogleDriveLogin = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/storage/google/login`;
  };

  const handleGoogleDriveDisconnect = async () => {
    if (!confirm(t("confirm") + "?")) return;
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/storage/google/disconnect`,
        { method: "POST" },
      );
      setStorageStatus({ service: "NONE", google_drive_email: "" });
      showSuccess(t("success"));
    } catch (e: any) {
      showError(e?.message || t("error"));
    }
  };

  const handleToggleStorage = async (service: "NONE" | "GOOGLE_DRIVE") => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/storage/toggle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Fehler beim Ändern des Speichers");
      }
      setStorageStatus((prev) => ({ ...prev, service }));
      showSuccess(t("success"));
    } catch (e: any) {
      showError(e.message);
    }
  };

  const AdapterFooter = ({
    adapter,
    label,
  }: {
    adapter: AdapterKey;
    label: string;
  }) => {
    const s = adapterStatus[adapter];
    const ts = testStatus[adapter];
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {s === "saved" && (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
              <CheckCircle2 className="w-4 h-4" />
              {t("saved")}
            </span>
          )}
          {s === "saving" && (
            <span className="text-indigo-500 text-sm font-bold animate-pulse">
              {t("saving")}...
            </span>
          )}
          {s === "error" && (
            <span className="flex items-center gap-1.5 text-rose-500 text-sm font-bold">
              <ShieldAlert className="w-4 h-4" />
              {t("error")}
            </span>
          )}
          {ts === "sent" && (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
              <CheckCircle2 className="w-4 h-4" />
              {t("testSent")}
            </span>
          )}
          {ts === "testing" && (
            <span className="text-indigo-500 text-sm font-bold animate-pulse">
              {t("testSending")}
            </span>
          )}
          {ts === "error" && s === "idle" && (
            <span className="flex items-center gap-1.5 text-rose-500 text-sm font-bold">
              <ShieldAlert className="w-4 h-4" />
              {t("testFailed")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleTestClick(adapter)}
            disabled={ts === "testing" || s === "saving"}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer active:scale-95"
          >
            <Send className="w-4 h-4" />
            {t("testNotification")}
          </button>
          <button
            onClick={() => handleSaveAdapter(adapter)}
            disabled={s === "saving"}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all cursor-pointer active:scale-95"
          >
            <Save className="w-4 h-4" />
            {label}
          </button>
        </div>
      </div>
    );
  };

  const ActiveBadge = ({ active }: { active: boolean }) =>
    active ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase tracking-wider">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t("active")}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 uppercase tracking-wider">
        {t("inactive")}
      </span>
    );

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {t("loading")}...
          </p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <PageHeader
        title={t("settings") || "Settings"}
        subtitle={t("settingsDescription")}
      />

      {/* TABS NAVIGATION */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/60 p-1.5 rounded-2xl w-fit mb-8 border border-slate-200/60 dark:border-slate-800/60">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-6 py-2.5 rounded-xl transition-all cursor-pointer text-sm font-bold ${
              activeTab === tab
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t(tab as any)}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === "general" && (
          <>
            <SettingsCard
              title={t("general")}
              subtitle={t("interfaceLanguage")}
              icon={<Globe className="w-5 h-5" />}
            >
              <div className="flex gap-3">
                {(["de", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleLanguageChange(lang)}
                    className={`px-6 py-2.5 rounded-xl font-semibold transition-all cursor-pointer ${
                      uiLanguage === lang
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {lang === "de" ? t("german") : t("english")}
                  </button>
                ))}
              </div>
            </SettingsCard>

            <SettingsCard
              title={t("timezonePreference")}
              icon={<Clock className="w-5 h-5" />}
            >
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t("timezoneDescription")}
              </p>
              <div className="flex items-center gap-3">
                <select
                  value={timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                >
                  <optgroup label="Europe">
                    <option value="Europe/Berlin">Europe/Berlin</option>
                    <option value="Europe/Vienna">Europe/Vienna</option>
                    <option value="Europe/Zurich">Europe/Zurich</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Europe/Paris">Europe/Paris</option>
                    <option value="Europe/Amsterdam">Europe/Amsterdam</option>
                    <option value="Europe/Brussels">Europe/Brussels</option>
                    <option value="Europe/Warsaw">Europe/Warsaw</option>
                    <option value="Europe/Prague">Europe/Prague</option>
                    <option value="Europe/Budapest">Europe/Budapest</option>
                    <option value="Europe/Rome">Europe/Rome</option>
                    <option value="Europe/Madrid">Europe/Madrid</option>
                    <option value="Europe/Stockholm">Europe/Stockholm</option>
                    <option value="Europe/Helsinki">Europe/Helsinki</option>
                    <option value="Europe/Bucharest">Europe/Bucharest</option>
                    <option value="Europe/Athens">Europe/Athens</option>
                    <option value="Europe/Moscow">Europe/Moscow</option>
                  </optgroup>
                  <optgroup label="Americas">
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Chicago">America/Chicago</option>
                    <option value="America/Denver">America/Denver</option>
                    <option value="America/Los_Angeles">
                      America/Los_Angeles
                    </option>
                    <option value="America/Toronto">America/Toronto</option>
                    <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                  </optgroup>
                  <optgroup label="Asia / Pacific">
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                    <option value="Asia/Shanghai">Asia/Shanghai</option>
                    <option value="Australia/Sydney">Australia/Sydney</option>
                  </optgroup>
                  <optgroup label="UTC">
                    <option value="UTC">UTC</option>
                  </optgroup>
                </select>
                {tzStatus && (
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${tzStatus === t("timezoneSaved") ? "text-emerald-600 dark:text-emerald-400" : tzStatus === t("timezoneError") ? "text-rose-500" : "text-indigo-500 animate-pulse"}`}
                  >
                    {tzStatus}
                  </span>
                )}
              </div>
            </SettingsCard>

            <SettingsCard
              title={t("matchThreshold")}
              icon={<Filter className="w-5 h-5" />}
            >
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t("matchThresholdHint")}
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={matchThreshold}
                  onChange={(e) => setMatchThreshold(e.target.value)}
                  onBlur={handleMatchThresholdSave}
                  className="w-32 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
                {mtStatus && (
                  <span
                    className={`text-sm font-semibold whitespace-nowrap ${mtStatus === t("matchThresholdSaved") ? "text-emerald-600 dark:text-emerald-400" : mtStatus === t("matchThresholdError") ? "text-rose-500" : "text-indigo-500 animate-pulse"}`}
                  >
                    {mtStatus}
                  </span>
                )}
              </div>
            </SettingsCard>
          </>
        )}

        {activeTab === "notifications" && (
          <>
            <div className="p-4 bg-indigo-50/40 dark:bg-indigo-500/5 rounded-xl border border-indigo-100/60 dark:border-indigo-500/10 flex gap-3">
              <div className="p-2 bg-white dark:bg-slate-800 rounded-lg h-fit shadow-sm shrink-0">
                <Info className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t("notificationAdapterInfo")}
              </p>
            </div>

            {/* PUSHOVER */}
            <SettingsCard
              title="Pushover"
              subtitle={t("pushNotifications")}
              icon={<Smartphone className="w-5 h-5 text-sky-500" />}
              footer={
                <AdapterFooter adapter="pushover" label={t("pushoverSave")} />
              }
            >
              <div className="flex justify-end mb-6 -mt-2">
                <ActiveBadge
                  active={
                    !!(
                      savedData.pushover_user_key &&
                      savedData.pushover_api_token
                    )
                  }
                />
              </div>
              <div className="p-4 bg-sky-50/50 dark:bg-sky-500/5 border border-sky-100 dark:border-sky-500/10 rounded-2xl flex items-center justify-between mb-6">
                <span className="text-xs text-sky-800/80 dark:text-sky-300/60 font-medium">
                  {t("pushoverKeysInfo")}
                </span>
                <a
                  href="https://pushover.net/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-white dark:bg-slate-800 rounded-lg text-sky-600 hover:text-sky-700 transition shadow-sm border border-sky-100/50 dark:border-sky-800"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {t("userKey")}
                  </label>
                  <PasswordInput
                    name="pushover_user_key"
                    value={formData.pushover_user_key}
                    onChange={handleChange}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {t("apiToken")}
                  </label>
                  <PasswordInput
                    name="pushover_api_token"
                    value={formData.pushover_api_token}
                    onChange={handleChange}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </SettingsCard>

            {/* RESEND */}
            <SettingsCard
              title="Resend"
              subtitle={t("emailNotifications")}
              icon={<Mail className="w-5 h-5 text-violet-500" />}
              footer={
                <AdapterFooter adapter="resend" label={t("resendSave")} />
              }
            >
              <div className="flex justify-end mb-6 -mt-2">
                <ActiveBadge
                  active={
                    !!(savedData.resend_api_key && savedData.resend_from_email)
                  }
                />
              </div>
              <div className="rounded-2xl border border-violet-100 dark:border-violet-900/40 overflow-hidden mb-6">
                <div className="px-4 py-3 bg-violet-50 dark:bg-violet-500/5 flex items-center justify-between">
                  <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">
                    {t("resendSetupGuide")}
                  </span>
                  <a
                    href="https://resend.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    resend.com <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <ol className="px-4 py-3 space-y-2.5 bg-white dark:bg-slate-900/30">
                  {[
                    t("resendStep1"),
                    t("resendStep2"),
                    t("resendStep3"),
                    t("resendStep4"),
                    t("resendStep5"),
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 text-[10px] font-black flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {t("resendApiKey")}
                  </label>
                  <PasswordInput
                    name="resend_api_key"
                    value={formData.resend_api_key}
                    onChange={handleChange}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {t("resendFromEmail")}
                  </label>
                  <input
                    type="email"
                    name="resend_from_email"
                    value={formData.resend_from_email}
                    onChange={handleChange}
                    placeholder="noreply@yourdomain.com"
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>
            </SettingsCard>

            {/* SMTP */}
            <SettingsCard
              title="SMTP"
              subtitle={t("smtpEmailNotifications")}
              icon={<Mail className="w-5 h-5 text-teal-500" />}
              footer={<AdapterFooter adapter="smtp" label={t("smtpSave")} />}
            >
              <div className="flex justify-end mb-6 -mt-2">
                <ActiveBadge
                  active={
                    !!(
                      savedData.smtp_host &&
                      savedData.smtp_user &&
                      savedData.smtp_password
                    )
                  }
                />
              </div>
              <div className="rounded-2xl border border-teal-100 dark:border-teal-900/40 overflow-hidden mb-6">
                <div className="px-4 py-3 bg-teal-50 dark:bg-teal-500/5">
                  <span className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wide">
                    {t("smtpSetupTitle")}
                  </span>
                </div>
                <div className="px-4 py-3 bg-white dark:bg-slate-900/30 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {(
                      [
                        {
                          name: "Gmail",
                          host: "smtp.gmail.com",
                          note:
                            language === "de"
                              ? "App-Passwort erforderlich — direkt erstellen:"
                              : "App password required — create here:",
                          appPasswordUrl:
                            "https://myaccount.google.com/apppasswords",
                          appPasswordLabel:
                            language === "de"
                              ? "Google App-Passwort erstellen"
                              : "Create Google App Password",
                          infoUrl:
                            "https://support.google.com/accounts/answer/185833",
                        },
                        {
                          name: "GMX",
                          host: "mail.gmx.net",
                          note:
                            language === "de"
                              ? "Normales GMX-Passwort. SMTP in den Einstellungen aktivieren:"
                              : "Normal GMX password. Enable SMTP in settings:",
                          appPasswordUrl: null,
                          appPasswordLabel: null,
                          infoUrl:
                            "https://hilfe.gmx.net/email/sicherheit/imap.html",
                        },
                        {
                          name: "web.de",
                          host: "smtp.web.de",
                          note:
                            language === "de"
                              ? "Normales web.de-Passwort. SMTP in den Einstellungen aktivieren:"
                              : "Normal web.de password. Enable SMTP in settings:",
                          appPasswordUrl: null,
                          appPasswordLabel: null,
                          infoUrl:
                            "https://hilfe.web.de/pop-imap/imap/web-de-konto-im-e-mail-programm-einrichten.html",
                        },
                        {
                          name: "Outlook / Hotmail",
                          host: "smtp.office365.com",
                          note:
                            language === "de"
                              ? "App-Passwort bei aktivierter 2FA erforderlich:"
                              : "App password required with 2FA enabled:",
                          appPasswordUrl:
                            "https://account.microsoft.com/security/advanced",
                          appPasswordLabel:
                            language === "de"
                              ? "Microsoft App-Passwort erstellen"
                              : "Create Microsoft App Password",
                          infoUrl:
                            "https://support.microsoft.com/de-de/account-billing/verwenden-von-app-kennw%C3%B6rtern-mit-apps-die-keine-zweistufige-verifizierung-unterst%C3%BCtzen-5896ed9b-4263-e681-128a-a6f2979a7944",
                        },
                        {
                          name: "Yahoo",
                          host: "smtp.mail.yahoo.com",
                          note:
                            language === "de"
                              ? "App-Passwort erforderlich — direkt erstellen:"
                              : "App password required — create here:",
                          appPasswordUrl:
                            "https://login.yahoo.com/myaccount/security/app-passwords/list",
                          appPasswordLabel:
                            language === "de"
                              ? "Yahoo App-Passwort erstellen"
                              : "Create Yahoo App Password",
                          infoUrl: "https://help.yahoo.com/kb/SLN15241.html",
                        },
                        {
                          name: "T-Online / Telekom",
                          host: "securesmtp.t-online.de",
                          note:
                            language === "de"
                              ? "Normales T-Online-Passwort. Port 587 mit STARTTLS:"
                              : "Normal T-Online password. Port 587 with STARTTLS:",
                          appPasswordUrl: null,
                          appPasswordLabel: null,
                          infoUrl:
                            "https://www.telekom.de/hilfe/festnetz-internet-tv/e-mail/e-mail-programm-einrichten/programme-einrichten",
                        },
                      ] as const
                    ).map(
                      ({
                        name,
                        host,
                        note,
                        appPasswordUrl,
                        appPasswordLabel,
                        infoUrl,
                      }) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              smtp_host: host,
                            }))
                          }
                          className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${formData.smtp_host === host ? "bg-teal-50 dark:bg-teal-500/10 border-teal-300 dark:border-teal-700" : "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-800"}`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <p
                              className={`font-bold text-xs ${formData.smtp_host === host ? "text-teal-700 dark:text-teal-300" : "text-slate-800 dark:text-slate-200"}`}
                            >
                              {name}
                            </p>
                            {formData.smtp_host === host && (
                              <svg
                                className="w-3 h-3 text-teal-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2.5"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <p className="text-[10px] font-mono text-teal-600 dark:text-teal-400 mb-1">
                            {host}
                          </p>
                          <p className="text-[10px] text-slate-500 leading-relaxed mb-1">
                            {note}
                          </p>
                          <div
                            className="flex flex-wrap gap-1.5 mt-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {appPasswordUrl && appPasswordLabel && (
                              <a
                                href={appPasswordUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-teal-600 hover:bg-teal-500 px-2 py-0.5 rounded-md transition-colors"
                              >
                                {appPasswordLabel}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            <a
                              href={infoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:underline transition-colors"
                            >
                              {language === "de" ? "Anleitung" : "Guide"}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                      {t("smtpHost")}
                    </label>
                    <input
                      type="text"
                      name="smtp_host"
                      value={formData.smtp_host}
                      onChange={handleChange}
                      placeholder="smtp.gmail.com"
                      className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                      {t("smtpPort")}
                    </label>
                    <input
                      type="number"
                      name="smtp_port"
                      value={formData.smtp_port}
                      onChange={handleChange}
                      placeholder="587"
                      className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {t("smtpUser")}
                  </label>
                  <input
                    type="email"
                    name="smtp_user"
                    value={formData.smtp_user}
                    onChange={handleChange}
                    placeholder="deinname@gmail.com"
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {t("smtpPassword")}
                  </label>
                  <PasswordInput
                    name="smtp_password"
                    value={formData.smtp_password}
                    onChange={handleChange}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                    {t("smtpFromEmail")}
                  </label>
                  <input
                    type="email"
                    name="smtp_from_email"
                    value={formData.smtp_from_email}
                    onChange={handleChange}
                    placeholder={t("smtpFromEmailHint")}
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              title={t("notificationTemplates")}
              subtitle={t("customTemplates")}
              icon={<Bell className="w-5 h-5" />}
            >
              <TemplateManager isAdmin={!!user?.is_admin} adminMode={false} />
            </SettingsCard>
          </>
        )}

        {activeTab === "storage" && (
          <div className="space-y-6">
            <SettingsCard
              title={t("storage")}
              subtitle={t("storageDescription")}
              icon={<HardDrive className="w-5 h-5" />}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Internal Database Storage */}
                <div
                  onClick={() => handleToggleStorage("NONE")}
                  className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer group ${
                    storageStatus.service === "NONE"
                      ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-500/10 shadow-lg shadow-indigo-500/5"
                      : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-indigo-200 dark:hover:border-indigo-900/40 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`p-2.5 rounded-xl ${
                        storageStatus.service === "NONE"
                          ? "bg-indigo-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-indigo-500 transition-colors"
                      }`}
                    >
                      <Database className="w-5 h-5" />
                    </div>
                    {storageStatus.service === "NONE" && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500 text-white uppercase tracking-wider">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Active
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                    {t("internalStorage")}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t("databaseDescription")}
                  </p>
                </div>

                {/* Google Drive External Storage */}
                <div
                  onClick={() =>
                    setStorageStatus((prev) => ({
                      ...prev,
                      service: "GOOGLE_DRIVE",
                    }))
                  }
                  className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer group ${
                    storageStatus.service === "GOOGLE_DRIVE"
                      ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-500/10 shadow-lg shadow-indigo-500/5"
                      : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-indigo-200 dark:hover:border-indigo-900/40 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`p-2.5 rounded-xl ${
                        storageStatus.service === "GOOGLE_DRIVE"
                          ? "bg-indigo-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-indigo-500 transition-colors"
                      }`}
                    >
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg"
                        alt="G"
                        className={`w-5 h-5 ${storageStatus.service === "GOOGLE_DRIVE" ? "brightness-0 invert" : ""}`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {storageStatus.service === "GOOGLE_DRIVE" && (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500 text-white uppercase tracking-wider">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active
                        </span>
                      )}
                      {storageStatus.google_drive_email &&
                        storageStatus.service !== "GOOGLE_DRIVE" && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase tracking-wider">
                            Connected
                          </span>
                        )}
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                    {t("externalStorage")}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {storageStatus.google_drive_email
                      ? `${t("connectedAs")} ${storageStatus.google_drive_email}`
                      : t("googleDriveStorageDescription")}
                  </p>
                </div>
              </div>

              {/* Action Buttons for Google Drive - Only show if Google Drive is active or being configured */}
              {storageStatus.service === "GOOGLE_DRIVE" && (
                <>
                  <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
                    {!storageStatus.google_drive_email ? (
                      <button
                        onClick={handleGoogleDriveLogin}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all cursor-pointer active:scale-95"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t("connectGoogleDrive")}
                      </button>
                    ) : (
                      <button
                        onClick={handleGoogleDriveDisconnect}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer active:scale-95"
                      >
                        {t("disconnectGoogleDrive")}
                      </button>
                    )}

                    <button
                      onClick={() => setShowSetupGuide(!showSetupGuide)}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all cursor-pointer"
                    >
                      {showSetupGuide ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      {t("storageSetupGuide")}
                    </button>
                  </div>

                  {/* Animated Setup Guide */}
                  {showSetupGuide && (
                    <div className="mt-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="px-5 py-3.5 bg-indigo-50/50 dark:bg-indigo-500/5 flex items-center justify-between border-b border-indigo-100 dark:border-indigo-900/40">
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">
                          {t("storageSetupGuide")}
                        </span>
                        <a
                          href="https://console.cloud.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                        >
                          Google Console{" "}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <div className="p-5 bg-white dark:bg-slate-900/30">
                        <div className="space-y-6">
                          <div>
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                              <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[8px] text-slate-500">
                                1
                              </span>
                              {t("googleCloudProjectSetup")}
                            </h5>
                            <ol className="space-y-4">
                              {[
                                t("googleStep1"),
                                t("googleStep2"),
                                t("googleStep3"),
                                t("googleStep4"),
                                t("googleStep5"),
                              ].map((step, i) => (
                                <li key={i} className="flex items-start gap-3">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-[10px] font-black flex items-center justify-center mt-0.5">
                                    {i + 1}
                                  </span>
                                  <div className="space-y-2 flex-1">
                                    <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                      {step}
                                    </p>
                                    {i === 4 && (
                                      <div className="p-3 bg-indigo-50/30 dark:bg-indigo-500/5 rounded-xl border border-indigo-100/50 dark:border-indigo-500/10 font-mono text-[11px] text-indigo-600 dark:text-indigo-400 break-all select-all flex justify-between items-center group/url">
                                        <span>
                                          {typeof window !== "undefined"
                                            ? `${window.location.protocol}//${window.location.host.split(":")[0]}:8002/storage/google/callback`
                                            : "http://localhost:8002/storage/google/callback"}
                                        </span>
                                        <CheckCircle2 className="w-3.5 h-3.5 opacity-0 group-hover/url:opacity-100 transition-opacity" />
                                      </div>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>

                          <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                              <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[8px] text-slate-500">
                                2
                              </span>
                              {t("appConnection")}
                            </h5>
                            <ol className="space-y-3">
                              {[
                                t("storageStep1"),
                                t("storageStep2"),
                                t("storageStep3"),
                              ].map((step, i) => (
                                <li key={i} className="flex items-start gap-3">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center mt-0.5 font-sans">
                                    {i + 1}
                                  </span>
                                  <span className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                    {step}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </SettingsCard>
          </div>
        )}
      </div>

      {/* Test recipient modal */}
      {testModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t("testRecipientTitle")}
              </h3>
              <button
                onClick={() => setTestModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5 mb-5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
                {t("testRecipientLabel")}
              </label>
              <input
                type="email"
                value={testModal.recipient}
                onChange={(e) =>
                  setTestModal((prev) =>
                    prev ? { ...prev, recipient: e.target.value } : null,
                  )
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  testModal.recipient &&
                  handleTestModalSubmit()
                }
                placeholder={t("testRecipientPlaceholder")}
                autoFocus
                className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTestModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleTestModalSubmit}
                disabled={!testModal.recipient}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-all cursor-pointer active:scale-95"
              >
                <Send className="w-4 h-4" />
                {t("sendTest")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
