"use client";
import { Platform } from "./types";

const ADAPTER_SHORT: Record<string, string> = {
  PUSHOVER: "Push",
  RESEND: "Resend",
  MAILJET: "MJ",
  SMTP: "SMTP",
};

interface NotificationAdaptersProps {
  platform: Platform;
}

export default function NotificationAdapters({
  platform,
}: NotificationAdaptersProps) {
  const active = platform.notification_adapters || [];
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {active.map((adapter) => (
        <span
          key={adapter}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 rounded border border-indigo-200/60 dark:border-indigo-800/40"
        >
          {ADAPTER_SHORT[adapter] ?? adapter}
        </span>
      ))}
    </div>
  );
}
