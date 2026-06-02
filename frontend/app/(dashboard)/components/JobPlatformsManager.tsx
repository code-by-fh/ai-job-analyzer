"use client";
import { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../components/LanguageProvider";
import ConfirmModal from "../../components/ConfirmModal";
import { useCrawl } from "../../hooks/useCrawl";
import { logger } from "../../lib/logger";
import { fetchWithAuth } from "../../components/AuthProvider";
import { Platform, LastRun } from "./JobPlatforms/types";
import PlatformCard from "./JobPlatforms/PlatformCard";
import PushoverTemplateModal from "./JobPlatforms/PushoverTemplateModal";
import ResendTemplateModal from "./JobPlatforms/ResendTemplateModal";
import MailjetTemplateModal from "./JobPlatforms/MailjetTemplateModal";
import SmtpTemplateModal from "./JobPlatforms/SmtpTemplateModal";
import NotificationAdaptersModal from "./JobPlatforms/NotificationAdaptersModal";
import AddPlatformInput from "./JobPlatforms/AddPlatformInput";
import { NotificationTemplate } from "../../components/TemplateManager";

interface JobPlatformsManagerProps {
  token: string | null;
  user: any;
  initialPlatforms?: Platform[];
  configuredAdapters?: string[];
}

type TestStatus = "idle" | "sending" | "ok" | "error";

const sortByCreation = (list: Platform[]) =>
  [...list].sort((a, b) => b.id - a.id);

export default function JobPlatformsManager({
  token,
  user,
  initialPlatforms,
  configuredAdapters = [],
}: JobPlatformsManagerProps) {
  const { t } = useLanguage();
  const [platforms, setPlatforms] = useState<Platform[]>(
    sortByCreation(initialPlatforms || []),
  );
  const [pendingUrls, setPendingUrls] = useState<Set<string>>(new Set());
  const [lastRunByPlatform, setLastRunByPlatform] = useState<
    Record<string, LastRun>
  >({});
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialPlatforms);
  const [newUrl, setNewUrl] = useState("");
  const [status, setStatus] = useState("");
  const [platformToRemove, setPlatformToRemove] = useState<number | null>(null);
  const [isAddingPlatform, setIsAddingPlatform] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [pushoverModalPlatform, setPushoverModalPlatform] =
    useState<Platform | null>(null);
  const [pushoverTemplateValue, setPushoverTemplateValue] =
    useState<string>("");
  const [pushoverModalTestStatus, setPushoverModalTestStatus] =
    useState<TestStatus>("idle");
  const [pushoverModalTestError, setPushoverModalTestError] = useState<
    string | null
  >(null);

  const [resendModalPlatform, setResendModalPlatform] =
    useState<Platform | null>(null);
  const [resendTemplateValue, setResendTemplateValue] = useState<string>("");
  const [resendRecipientsValue, setResendRecipientsValue] =
    useState<string>("");
  const [resendModalTestStatus, setResendModalTestStatus] =
    useState<TestStatus>("idle");
  const [resendModalTestError, setResendModalTestError] = useState<
    string | null
  >(null);
  const [resendModalSaveStatus, setResendModalSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [resendModalSaveError, setResendModalSaveError] = useState<
    string | null
  >(null);

  const [mailjetModalPlatform, setMailjetModalPlatform] =
    useState<Platform | null>(null);
  const [mailjetTemplateValue, setMailjetTemplateValue] = useState<string>("");
  const [mailjetRecipientsValue, setMailjetRecipientsValue] =
    useState<string>("");
  const [mailjetModalTestStatus, setMailjetModalTestStatus] =
    useState<TestStatus>("idle");
  const [mailjetModalTestError, setMailjetModalTestError] = useState<
    string | null
  >(null);
  const [mailjetModalSaveStatus, setMailjetModalSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [mailjetModalSaveError, setMailjetModalSaveError] = useState<
    string | null
  >(null);

  const [smtpModalPlatform, setSmtpModalPlatform] = useState<Platform | null>(
    null,
  );
  const [smtpTemplateValue, setSmtpTemplateValue] = useState<string>("");
  const [smtpRecipientsValue, setSmtpRecipientsValue] = useState<string>("");
  const [smtpModalTestStatus, setSmtpModalTestStatus] =
    useState<TestStatus>("idle");
  const [smtpModalTestError, setSmtpModalTestError] = useState<string | null>(
    null,
  );
  const [smtpModalSaveStatus, setSmtpModalSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [smtpModalSaveError, setSmtpModalSaveError] = useState<string | null>(
    null,
  );

  const [notificationTemplates, setNotificationTemplates] = useState<
    NotificationTemplate[]
  >([]);
  const [notificationModalPlatformId, setNotificationModalPlatformId] =
    useState<number | null>(null);
  const notificationModalPlatform =
    platforms.find((p) => p.id === notificationModalPlatformId) ?? null;
  const [returnToNotificationPlatformId, setReturnToNotificationPlatformId] =
    useState<number | null>(null);

  const [pushoverTestStatus, setPushoverTestStatus] = useState<
    Record<number, TestStatus>
  >({});
  const [pushoverTestError, setPushoverTestError] = useState<
    Record<number, string | null>
  >({});

  const { activeCrawls, crawlToCancel, setCrawlToCancel, confirmCancelCrawl } =
    useCrawl({ user, token });
  const savedToLastRunRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem("crawl_last_run");
      if (stored) setLastRunByPlatform(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    activeCrawls.forEach((job) => {
      if (
        (job.show_success === true || job.status === "failed") &&
        !savedToLastRunRef.current.has(job.job_id)
      ) {
        savedToLastRunRef.current.add(job.job_id);
        setLastRunByPlatform((prev) => {
          const next: Record<string, LastRun> = {
            ...prev,
            [job.platform]: {
              total: job.total ?? 0,
              total_found: job.total_found ?? job.total ?? 0,
              saved: job.jobs_saved ?? 0,
              skipped: job.jobs_skipped ?? 0,
              scraping_completed: job.scraping_completed ?? 0,
              analysis_completed: job.analysis_completed ?? 0,
              status: job.status === "failed" ? "failed" : "success",
              error: job.error_message,
              timestamp: new Date().toLocaleString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          };
          try {
            localStorage.setItem("crawl_last_run", JSON.stringify(next));
          } catch {}
          return next;
        });
        fetchPlatforms();
      }
    });
  }, [activeCrawls]);

  useEffect(() => {
    if (pendingUrls.size === 0) return;
    setPendingUrls((prev) => {
      const next = new Set(prev);
      activeCrawls.forEach((job) => next.delete(job.platform));
      return next;
    });
  }, [activeCrawls, pendingUrls.size]);

  const fetchPlatforms = async () => {
    if (!token) return;
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms`,
      );
      if (res.ok) {
        const data: Platform[] = await res.json();
        setPlatforms(sortByCreation(data));
        setLastRunByPlatform((prev) => {
          const next = { ...prev };
          const platformUrls = new Set(data.map((p) => p.url));
          let changed = false;
          Object.keys(next).forEach((url) => {
            if (!platformUrls.has(url)) {
              delete next[url];
              changed = true;
            }
          });
          if (changed) {
            try {
              localStorage.setItem("crawl_last_run", JSON.stringify(next));
            } catch {}
            return next;
          }
          return prev;
        });
      }
    } catch (e) {
      logger.error({ err: e }, "Failed to fetch platforms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialPlatforms) {
      fetchPlatforms();
    }
  }, [token, initialPlatforms]);

  useEffect(() => {
    if (!token) return;
    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/notification-templates`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setNotificationTemplates)
      .catch(() => {});
  }, [token]);

  const anyTemplateModalOpen = !!(
    pushoverModalPlatform ||
    resendModalPlatform ||
    mailjetModalPlatform ||
    smtpModalPlatform
  );
  useEffect(() => {
    if (!anyTemplateModalOpen && returnToNotificationPlatformId) {
      setNotificationModalPlatformId(returnToNotificationPlatformId);
      setReturnToNotificationPlatformId(null);
    }
  }, [anyTemplateModalOpen]);

  const addPlatform = async () => {
    if (!newUrl) return;
    setAddError(null);
    try {
      const parsed = new URL(newUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        setStatus(t("invalidUrlProtocol"));
        setTimeout(() => setStatus(""), 3000);
        return;
      }
    } catch (_) {
      setStatus(t("invalidUrl"));
      setTimeout(() => setStatus(""), 3000);
      return;
    }
    setIsAddingPlatform(true);
    setStatus(t("adding"));
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: newUrl }),
        },
      );
      if (res.ok) {
        await res.json();
        setNewUrl("");
        setIsAddingPlatform(false);
        fetchPlatforms();
        setStatus(t("platformAdded"));
        setTimeout(() => setStatus(""), 3000);
        return;
      } else {
        const err = await res.json();
        if (res.status === 400 && err.detail === "Platform URL already exists") {
          setAddError(t("platformAlreadyExists"));
        } else {
          setStatus(`${t("error")}: ${err.detail || "Failed to add"} ❌`);
        }
      }
    } catch (e) {
      setStatus(t("error"));
    }
    setIsAddingPlatform(false);
    setTimeout(() => setStatus(""), 3000);
  };

  const finalizeRemovePlatform = async () => {
    if (!platformToRemove) return;
    try {
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${platformToRemove}?delete_listings=true&keep_favorites=false&keep_applications=false`,
        {
          method: "DELETE",
        },
      );
      fetchPlatforms();
    } catch (e) {
      setStatus(`${t("error")} removing platform`);
      setTimeout(() => setStatus(""), 3000);
    }
    setPlatformToRemove(null);
  };

  const triggerCrawl = async (platform: Platform) => {
    setPendingUrls((prev) => new Set(prev).add(platform.url));
    setStatus(t("startingCrawler"));
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${platform.id}/crawl`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setStatus(t("crawlJobsDispatched"));
        fetchPlatforms();
      } else {
        setStatus(t("error"));
        setPendingUrls((prev) => {
          const next = new Set(prev);
          next.delete(platform.url);
          return next;
        });
      }
    } catch (e) {
      setStatus(t("error"));
      setPendingUrls((prev) => {
        const next = new Set(prev);
        next.delete(platform.url);
        return next;
      });
    }
    setTimeout(() => setStatus(""), 3000);
  };

  const updatePlatform = async (id: number, data: any): Promise<boolean> => {
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      if (res.ok) {
        fetchPlatforms();
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(`${t("error")}: ${err.detail || "Failed to update"} ❌`);
        setTimeout(() => setStatus(""), 3000);
        logger.error({ status: res.status, err }, "Update platform failed");
        return false;
      }
    } catch (e) {
      setStatus(t("networkError") || "Network Error");
      setTimeout(() => setStatus(""), 3000);
      logger.error({ err: e }, "Update platform failed");
      return false;
    }
  };

  const generatePlatformName = async (id: number) => {
    setStatus(t("generating") || "Generating...");
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${id}/generate-name`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        fetchPlatforms();
        setStatus(t("updated") || "Updated");
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(`${t("error")}: ${err.detail || "Failed to generate"} ❌`);
      }
    } catch (e) {
      setStatus(t("error"));
    }
    setTimeout(() => setStatus(""), 3000);
  };

  const openPushoverModal = (platform: Platform) => {
    setPushoverModalPlatform(platform);
    setPushoverTemplateValue(platform.pushover_template || "");
    setPushoverModalTestStatus("idle");
    setPushoverModalTestError(null);
  };

  const savePushoverTemplate = async () => {
    if (!pushoverModalPlatform) return;
    await updatePlatform(pushoverModalPlatform.id, {
      pushover_template: pushoverTemplateValue || null,
    });
    setPushoverModalPlatform(null);
  };

  const sendTestPushoverFromModal = async () => {
    if (!pushoverModalPlatform) return;
    setPushoverModalTestStatus("sending");
    setPushoverModalTestError(null);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${pushoverModalPlatform.id}/test-pushover`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setPushoverModalTestStatus("ok");
      } else {
        const body = await res.json().catch(() => ({}));
        setPushoverModalTestError(body?.detail || `HTTP ${res.status}`);
        setPushoverModalTestStatus("error");
      }
    } catch (e: any) {
      setPushoverModalTestError(e?.message || "Network error");
      setPushoverModalTestStatus("error");
    }
    setTimeout(() => setPushoverModalTestStatus("idle"), 5000);
  };

  const sendTestPushover = async (platformId: number) => {
    setPushoverTestStatus((prev) => ({ ...prev, [platformId]: "sending" }));
    setPushoverTestError((prev) => ({ ...prev, [platformId]: null }));
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${platformId}/test-pushover`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setPushoverTestStatus((prev) => ({ ...prev, [platformId]: "ok" }));
      } else {
        const body = await res.json().catch(() => ({}));
        setPushoverTestError((prev) => ({
          ...prev,
          [platformId]: body?.detail || `HTTP ${res.status}`,
        }));
        setPushoverTestStatus((prev) => ({ ...prev, [platformId]: "error" }));
      }
    } catch (e: any) {
      setPushoverTestError((prev) => ({
        ...prev,
        [platformId]: e?.message || "Network error",
      }));
      setPushoverTestStatus((prev) => ({ ...prev, [platformId]: "error" }));
    }
    setTimeout(
      () =>
        setPushoverTestStatus((prev) => ({ ...prev, [platformId]: "idle" })),
      5000,
    );
  };

  const openResendModal = (platform: Platform) => {
    setResendModalPlatform(platform);
    setResendTemplateValue(platform.resend_template || "");
    setResendRecipientsValue((platform.resend_recipients || []).join(", "));
    setResendModalTestStatus("idle");
    setResendModalTestError(null);
    setResendModalSaveStatus("idle");
    setResendModalSaveError(null);
  };

  const saveResendTemplate = async () => {
    if (!resendModalPlatform) return;
    const recipients = resendRecipientsValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setResendModalSaveStatus("saving");
    setResendModalSaveError(null);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${resendModalPlatform.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resend_template: resendTemplateValue || null,
            resend_recipients: recipients.length > 0 ? recipients : null,
          }),
        },
      );
      if (res.ok) {
        fetchPlatforms();
        setResendModalSaveStatus("saved");
        setTimeout(() => setResendModalPlatform(null), 800);
      } else {
        const err = await res.json().catch(() => ({}));
        setResendModalSaveError(err.detail || "Speichern fehlgeschlagen");
        setResendModalSaveStatus("error");
      }
    } catch (e: any) {
      setResendModalSaveError(e?.message || "Netzwerkfehler");
      setResendModalSaveStatus("error");
    }
  };

  const sendTestResendFromModal = async () => {
    if (!resendModalPlatform) return;
    setResendModalTestStatus("sending");
    setResendModalTestError(null);
    try {
      const recipients = resendRecipientsValue
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${resendModalPlatform.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resend_template: resendTemplateValue || null,
            resend_recipients: recipients.length > 0 ? recipients : null,
          }),
        },
      );

      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${resendModalPlatform.id}/test-resend`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setResendModalTestStatus("ok");
      } else {
        const body = await res.json().catch(() => ({}));
        setResendModalTestError(body?.detail || `HTTP ${res.status}`);
        setResendModalTestStatus("error");
      }
    } catch (e: any) {
      setResendModalTestError(e?.message || "Network error");
      setResendModalTestStatus("error");
    }
    setTimeout(() => setResendModalTestStatus("idle"), 5000);
  };

  const openSmtpModal = (platform: Platform) => {
    setSmtpModalPlatform(platform);
    setSmtpTemplateValue(platform.smtp_template || "");
    setSmtpRecipientsValue((platform.smtp_recipients || []).join(", "));
    setSmtpModalTestStatus("idle");
    setSmtpModalTestError(null);
    setSmtpModalSaveStatus("idle");
    setSmtpModalSaveError(null);
  };

  const saveSmtpTemplate = async () => {
    if (!smtpModalPlatform) return;
    const recipients = smtpRecipientsValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setSmtpModalSaveStatus("saving");
    setSmtpModalSaveError(null);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${smtpModalPlatform.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            smtp_template: smtpTemplateValue || null,
            smtp_recipients: recipients.length > 0 ? recipients : null,
          }),
        },
      );
      if (res.ok) {
        fetchPlatforms();
        setSmtpModalSaveStatus("saved");
        setTimeout(() => setSmtpModalPlatform(null), 800);
      } else {
        const err = await res.json().catch(() => ({}));
        setSmtpModalSaveError(err.detail || "Speichern fehlgeschlagen");
        setSmtpModalSaveStatus("error");
      }
    } catch (e: any) {
      setSmtpModalSaveError(e?.message || "Netzwerkfehler");
      setSmtpModalSaveStatus("error");
    }
  };

  const sendTestSmtpFromModal = async () => {
    if (!smtpModalPlatform) return;
    const recipients = smtpRecipientsValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      setSmtpModalTestStatus("error");
      setSmtpModalTestError("Bitte mindestens einen Empfänger eintragen.");
      setTimeout(() => setSmtpModalTestStatus("idle"), 5000);
      return;
    }
    setSmtpModalTestStatus("sending");
    setSmtpModalTestError(null);
    try {
      // Save recipients and template first so the test endpoint can read them from DB
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${smtpModalPlatform.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            smtp_template: smtpTemplateValue || null,
            smtp_recipients: recipients,
          }),
        },
      );

      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${smtpModalPlatform.id}/test-smtp`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setSmtpModalTestStatus("ok");
      } else {
        const body = await res.json().catch(() => ({}));
        setSmtpModalTestError(body?.detail || `HTTP ${res.status}`);
        setSmtpModalTestStatus("error");
      }
    } catch (e: any) {
      setSmtpModalTestError(e?.message || "Network error");
      setSmtpModalTestStatus("error");
    }
    setTimeout(() => setSmtpModalTestStatus("idle"), 5000);
  };

  const openMailjetModal = (platform: Platform) => {
    setMailjetModalPlatform(platform);
    setMailjetTemplateValue(platform.mailjet_template || "");
    setMailjetRecipientsValue((platform.mailjet_recipients || []).join(", "));
    setMailjetModalTestStatus("idle");
    setMailjetModalTestError(null);
    setMailjetModalSaveStatus("idle");
    setMailjetModalSaveError(null);
  };

  const saveMailjetTemplate = async () => {
    if (!mailjetModalPlatform) return;
    const recipients = mailjetRecipientsValue
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setMailjetModalSaveStatus("saving");
    setMailjetModalSaveError(null);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${mailjetModalPlatform.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mailjet_template: mailjetTemplateValue || null,
            mailjet_recipients: recipients.length > 0 ? recipients : null,
          }),
        },
      );
      if (res.ok) {
        fetchPlatforms();
        setMailjetModalSaveStatus("saved");
        setTimeout(() => setMailjetModalPlatform(null), 800);
      } else {
        const err = await res.json().catch(() => ({}));
        setMailjetModalSaveError(err.detail || "Speichern fehlgeschlagen");
        setMailjetModalSaveStatus("error");
      }
    } catch (e: any) {
      setMailjetModalSaveError(e?.message || "Netzwerkfehler");
      setMailjetModalSaveStatus("error");
    }
  };

  const sendTestMailjetFromModal = async () => {
    if (!mailjetModalPlatform) return;
    setMailjetModalTestStatus("sending");
    setMailjetModalTestError(null);
    try {
      const recipients = mailjetRecipientsValue
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${mailjetModalPlatform.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mailjet_template: mailjetTemplateValue || null,
            mailjet_recipients: recipients.length > 0 ? recipients : null,
          }),
        },
      );

      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${mailjetModalPlatform.id}/test-mailjet`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        setMailjetModalTestStatus("ok");
      } else {
        const body = await res.json().catch(() => ({}));
        setMailjetModalTestError(body?.detail || `HTTP ${res.status}`);
        setMailjetModalTestStatus("error");
      }
    } catch (e: any) {
      setMailjetModalTestError(e?.message || "Network error");
      setMailjetModalTestStatus("error");
    }
    setTimeout(() => setMailjetModalTestStatus("idle"), 5000);
  };

  const toggleAdapter = async (platform: Platform, adapter: string) => {
    const current = platform.notification_adapters || [];
    const updated = current.includes(adapter)
      ? current.filter((a) => a !== adapter)
      : [...current, adapter];

    setPlatforms((prev) =>
      prev.map((p) =>
        p.id === platform.id
          ? {
              ...p,
              notification_adapters: updated,
              is_notification_enabled: updated.length > 0,
            }
          : p,
      ),
    );

    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/platforms/${platform.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notification_adapters: updated }),
        },
      );
      if (!res.ok) {
        setPlatforms((prev) =>
          prev.map((p) =>
            p.id === platform.id
              ? {
                  ...p,
                  notification_adapters: current,
                  is_notification_enabled: current.length > 0,
                }
              : p,
          ),
        );
      }
    } catch {
      setPlatforms((prev) =>
        prev.map((p) =>
          p.id === platform.id
            ? {
                ...p,
                notification_adapters: current,
                is_notification_enabled: current.length > 0,
              }
            : p,
        ),
      );
    }
  };

  if (loading)
    return (
      <div className="text-slate-500 text-sm animate-pulse">{t("loading")}</div>
    );

  return (
    <section
      id="platforms-manager"
      className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6"
    >
      <ConfirmModal
        isOpen={!!crawlToCancel}
        onClose={() => setCrawlToCancel(null)}
        onConfirm={confirmCancelCrawl}
        title={t("cancelCrawl")}
        message={t("cancelCrawlConfirm")}
        confirmText={t("cancelCrawl")}
        isDestructive
      />

      <ConfirmModal
        isOpen={!!platformToRemove}
        onClose={() => {
          setPlatformToRemove(null);
        }}
        onConfirm={finalizeRemovePlatform}
        title={t("removePlatform")}
        message={t("areYouCertain")}
        confirmText={t("remove")}
        isDestructive
      >
        <div className="mt-2 flex flex-col gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50">
          <p className="text-sm text-rose-700 dark:text-rose-400 leading-relaxed font-medium">
            ⚠️ <strong>Achtung:</strong> Beim Löschen dieser Plattform werden{" "}
            <strong>
              alle verknüpften Jobs, generierten Bewerbungen,
              Interview-Materialien und zugehörigen Firmenprofile
            </strong>{" "}
            restlos und unwiderruflich aus dem System entfernt.
          </p>
        </div>
      </ConfirmModal>

      {pushoverModalPlatform && (
        <PushoverTemplateModal
          platform={pushoverModalPlatform}
          templates={notificationTemplates}
          templateValue={pushoverTemplateValue}
          onTemplateChange={setPushoverTemplateValue}
          onClose={() => setPushoverModalPlatform(null)}
          onSave={savePushoverTemplate}
          testStatus={pushoverModalTestStatus}
          testError={pushoverModalTestError}
          onSendTest={sendTestPushoverFromModal}
          isAdmin={!!user?.is_admin}
        />
      )}

      {smtpModalPlatform && (
        <SmtpTemplateModal
          platform={smtpModalPlatform}
          templates={notificationTemplates}
          templateValue={smtpTemplateValue}
          onTemplateChange={setSmtpTemplateValue}
          recipientsValue={smtpRecipientsValue}
          onRecipientsChange={setSmtpRecipientsValue}
          onClose={() => setSmtpModalPlatform(null)}
          onSave={saveSmtpTemplate}
          saveStatus={smtpModalSaveStatus}
          saveError={smtpModalSaveError}
          testStatus={smtpModalTestStatus}
          testError={smtpModalTestError}
          onSendTest={sendTestSmtpFromModal}
        />
      )}

      {mailjetModalPlatform && (
        <MailjetTemplateModal
          platform={mailjetModalPlatform}
          templates={notificationTemplates}
          templateValue={mailjetTemplateValue}
          onTemplateChange={setMailjetTemplateValue}
          recipientsValue={mailjetRecipientsValue}
          onRecipientsChange={setMailjetRecipientsValue}
          onClose={() => setMailjetModalPlatform(null)}
          onSave={saveMailjetTemplate}
          saveStatus={mailjetModalSaveStatus}
          saveError={mailjetModalSaveError}
          testStatus={mailjetModalTestStatus}
          testError={mailjetModalTestError}
          onSendTest={sendTestMailjetFromModal}
        />
      )}

      {notificationModalPlatform && (
        <NotificationAdaptersModal
          platform={notificationModalPlatform}
          configuredAdapters={configuredAdapters}
          onClose={() => setNotificationModalPlatformId(null)}
          onToggleAdapter={toggleAdapter}
          onOpenPushoverModal={(p) => {
            setReturnToNotificationPlatformId(p.id);
            setNotificationModalPlatformId(null);
            openPushoverModal(p);
          }}
          onOpenResendModal={(p) => {
            setReturnToNotificationPlatformId(p.id);
            setNotificationModalPlatformId(null);
            openResendModal(p);
          }}
          onOpenMailjetModal={(p) => {
            setReturnToNotificationPlatformId(p.id);
            setNotificationModalPlatformId(null);
            openMailjetModal(p);
          }}
          onOpenSmtpModal={(p) => {
            setReturnToNotificationPlatformId(p.id);
            setNotificationModalPlatformId(null);
            openSmtpModal(p);
          }}
          isAdmin={!!user?.is_admin}
        />
      )}

      {resendModalPlatform && (
        <ResendTemplateModal
          platform={resendModalPlatform}
          templates={notificationTemplates}
          templateValue={resendTemplateValue}
          onTemplateChange={setResendTemplateValue}
          recipientsValue={resendRecipientsValue}
          onRecipientsChange={setResendRecipientsValue}
          onClose={() => setResendModalPlatform(null)}
          onSave={saveResendTemplate}
          saveStatus={resendModalSaveStatus}
          saveError={resendModalSaveError}
          testStatus={resendModalTestStatus}
          testError={resendModalTestError}
          onSendTest={sendTestResendFromModal}
        />
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white">
            {t("jobPlatforms")}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {t("platformsSubtitle")}
          </p>
        </div>
        {status && (
          <span className="text-[10px] font-bold text-indigo-500 animate-pulse">
            {status}
          </span>
        )}
      </div>

      <div className="mb-8">
        <AddPlatformInput
          newUrl={newUrl}
          onUrlChange={(url) => { setNewUrl(url); setAddError(null); }}
          onAdd={addPlatform}
          isProfileComplete={!!user?.is_profile_complete}
          isLoading={isAddingPlatform}
          error={addError}
        />
      </div>

      <div className="space-y-4">
        {platforms.map((p) => {
          const activeJob = Array.from(activeCrawls.values()).find(
            (j) => j.platform === p.url,
          );
          const isBusy = !!activeJob || pendingUrls.has(p.url);

          return (
            <PlatformCard
              key={p.id}
              platform={p}
              isBusy={isBusy}
              activeJob={activeJob}
              lastRun={lastRunByPlatform[p.url]}
              expandedLog={expandedLog}
              onToggleLog={(url) =>
                setExpandedLog(expandedLog === url ? null : url)
              }
              onScheduleChange={(id, time, days) =>
                updatePlatform(id, { schedule_time: time, schedule_days: days })
              }
              onOpenNotificationModal={(platform) =>
                setNotificationModalPlatformId(platform.id)
              }
              onTriggerCrawl={triggerCrawl}
              onCancelCrawl={(jobId) => setCrawlToCancel(jobId)}
              onToggleActive={(id, isActive) =>
                updatePlatform(id, { is_active: isActive })
              }
              onRemove={(id) => setPlatformToRemove(id)}
              onUrlChange={(id, url) => updatePlatform(id, { url })}
              onNameChange={(id, name) => updatePlatform(id, { name })}
              onGenerateName={generatePlatformName}
            />
          );
        })}
      </div>
    </section>
  );
}
