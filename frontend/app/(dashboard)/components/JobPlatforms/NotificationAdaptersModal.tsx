"use client";
import { Platform } from "./types";
import Portal from "../../../components/Portal";

const ALL_ADAPTERS = ["PUSHOVER", "RESEND", "MAILJET", "SMTP"] as const;
type Adapter = (typeof ALL_ADAPTERS)[number];

interface Props {
  platform: Platform;
  configuredAdapters: string[];
  onClose: () => void;
  onToggleAdapter: (platform: Platform, adapter: string) => void;
  onOpenPushoverModal: (platform: Platform) => void;
  onOpenResendModal: (platform: Platform) => void;
  onOpenMailjetModal: (platform: Platform) => void;
  onOpenSmtpModal: (platform: Platform) => void;
  isAdmin: boolean;
}

const ADAPTER_LABELS: Record<Adapter, string> = {
  PUSHOVER: "Pushover",
  RESEND: "Resend",
  MAILJET: "Mailjet",
  SMTP: "SMTP",
};

function isPlatformReady(platform: Platform, adapter: Adapter): boolean {
  switch (adapter) {
    case "PUSHOVER":
      return true;
    case "RESEND":
      return (platform.resend_recipients?.length ?? 0) > 0;
    case "MAILJET":
      return (platform.mailjet_recipients?.length ?? 0) > 0;
    case "SMTP":
      return (platform.smtp_recipients?.length ?? 0) > 0;
  }
}

function AdapterIcon({
  adapter,
  active,
}: {
  adapter: Adapter;
  active: boolean;
}) {
  const cls = `w-4 h-4 transition-colors ${active ? "text-indigo-500" : "text-slate-400"}`;
  if (adapter === "PUSHOVER") {
    return (
      <svg
        className={cls}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <rect
          x="7"
          y="2"
          width="10"
          height="20"
          rx="2"
          ry="2"
          strokeWidth={1.8}
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M12 18h.01"
        />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

export default function NotificationAdaptersModal({
  platform,
  configuredAdapters,
  onClose,
  onToggleAdapter,
  onOpenPushoverModal,
  onOpenResendModal,
  onOpenMailjetModal,
  onOpenSmtpModal,
  isAdmin,
}: Props) {
  function openConfigModal(adapter: Adapter) {
    onClose();
    switch (adapter) {
      case "PUSHOVER":
        onOpenPushoverModal(platform);
        break;
      case "RESEND":
        onOpenResendModal(platform);
        break;
      case "MAILJET":
        onOpenMailjetModal(platform);
        break;
      case "SMTP":
        onOpenSmtpModal(platform);
        break;
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
                Benachrichtigungsadapter
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">
                {platform.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Adapter list */}
          <div className="p-4 space-y-2">
            {ALL_ADAPTERS.map((adapter) => {
              const isSystemConfigured = configuredAdapters.includes(adapter);
              const isActive = (platform.notification_adapters || []).includes(
                adapter,
              );
              const needsConfig =
                isSystemConfigured &&
                isActive &&
                !isPlatformReady(platform, adapter);

              return (
                <div
                  key={adapter}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all
                                        ${
                                          isActive
                                            ? "bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200/60 dark:border-indigo-800/40"
                                            : "bg-slate-50 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/40"
                                        }
                                        ${!isSystemConfigured ? "opacity-60" : ""}`}
                >
                  {/* Icon */}
                  <div
                    className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors
                                        ${
                                          isActive
                                            ? "bg-indigo-100 dark:bg-indigo-500/10"
                                            : "bg-slate-100 dark:bg-slate-700/50"
                                        }`}
                  >
                    <AdapterIcon adapter={adapter} active={isActive} />
                  </div>

                  {/* Label + status */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm font-medium block ${isActive ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
                    >
                      {ADAPTER_LABELS[adapter]}
                    </span>
                    {!isSystemConfigured && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                        Nicht konfiguriert
                      </p>
                    )}
                    {needsConfig && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          Empfänger fehlen
                        </p>
                        <button
                          type="button"
                          onClick={() => openConfigModal(adapter)}
                          className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline transition-colors cursor-pointer"
                        >
                          Konfigurieren
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isSystemConfigured ? (
                      isAdmin ? (
                        <a
                          href="/settings"
                          className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline transition-colors whitespace-nowrap"
                        >
                          Einrichten →
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400">n/a</span>
                      )
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openConfigModal(adapter)}
                          title="Konfigurieren"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all cursor-pointer"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.8"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !isActive &&
                              !isPlatformReady(platform, adapter)
                            ) {
                              openConfigModal(adapter);
                            } else {
                              onToggleAdapter(platform, adapter);
                            }
                          }}
                          title={
                            isActive
                              ? `${adapter} deaktivieren`
                              : `${adapter} aktivieren`
                          }
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer
                                                        ${isActive ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"}`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                                                        ${isActive ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                          />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Portal>
  );
}
