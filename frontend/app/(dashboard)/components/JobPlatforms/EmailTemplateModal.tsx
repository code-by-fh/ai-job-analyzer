"use client";
import { useState, useRef } from "react";
import { Platform } from "./types";
import { NotificationTemplate } from "../../../components/TemplateManager";
import Portal from "../../../components/Portal";

export interface EmailTemplateModalProps {
  adapterName: string;
  templateType: "RESEND" | "MAILJET" | "SMTP";
  platform: Platform;
  templates: NotificationTemplate[];
  templateValue: string;
  onTemplateChange: (value: string) => void;
  recipientsValue: string;
  onRecipientsChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  testStatus: "idle" | "sending" | "ok" | "error";
  testError: string | null;
  onSendTest: () => void;
}

const PLACEHOLDER = `<html>
<body>
  <p>Hallo $userName,</p>
  <h1>$jobCount neue Job-Matches für dich</h1>
  {{#jobs}}
  <div style="margin-bottom:20px;border-bottom:1px solid #eee">
    <h2>$title – $company ($match_score%)</h2>
    <p>$reasoning</p>
    <a href="$url">Details anschauen</a>
  </div>
  {{/jobs}}
</body>
</html>`;

const SAMPLE_JOB = {
  title: "Senior Software Engineer",
  company: "Acme Corp",
  match_score: "87",
  reasoning: "Strong match based on your Python and FastAPI experience.",
  url: "https://example.com/job/123",
};

function renderPreview(template: string, platformName: string): string {
  let html = template.trim() || PLACEHOLDER;
  if (html.includes("{{#jobs}}")) {
    const loopMatch = html.match(/\{\{#jobs\}\}([\s\S]*?)\{\{\/jobs\}\}/);
    if (loopMatch) {
      const block = loopMatch[1]
        .replace(/\$title/g, SAMPLE_JOB.title)
        .replace(/\$company/g, SAMPLE_JOB.company)
        .replace(/\$match_score/g, SAMPLE_JOB.match_score)
        .replace(/\$reasoning/g, SAMPLE_JOB.reasoning)
        .replace(/\$url/g, SAMPLE_JOB.url);
      html = html.replace(/\{\{#jobs\}\}[\s\S]*?\{\{\/jobs\}\}/, block);
    }
  }
  return html
    .replace(/\$userName/g, "Max Mustermann")
    .replace(/\$jobCount/g, "1")
    .replace(/\$platform_name/g, platformName);
}

export default function EmailTemplateModal({
  adapterName,
  templateType,
  platform,
  templates,
  templateValue,
  onTemplateChange,
  recipientsValue,
  onRecipientsChange,
  onClose,
  onSave,
  saveStatus,
  saveError,
  testStatus,
  testError,
  onSendTest,
}: EmailTemplateModalProps) {
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent =
      templateValue.substring(0, start) +
      variable +
      templateValue.substring(end);
    onTemplateChange(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + variable.length,
        start + variable.length,
      );
    }, 0);
  };

  const varBtn = (variable: string) => (
    <button
      key={variable}
      type="button"
      onClick={() => insertVariable(variable)}
      className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
      title="Klicken zum Einfügen"
    >
      {variable}
    </button>
  );

  const adapterTemplates = templates.filter((t) =>
    ["RESEND", "MAILJET", "SMTP"].includes(t.type),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    if (templateValue) {
      const match = adapterTemplates.find((t) => t.content === templateValue);
      return match ? String(match.id) : "";
    }
    return "__default__";
  });

  const handleTemplateSelect = (id: string) => {
    if (id === "__default__") {
      onTemplateChange("");
      setSelectedTemplateId("__default__");
      return;
    }
    if (!id) {
      setSelectedTemplateId("");
      return;
    }
    const tpl = adapterTemplates.find((t) => String(t.id) === id);
    if (!tpl) return;
    onTemplateChange(tpl.content);
    setSelectedTemplateId(id);
  };

  const previewHtml = renderPreview(templateValue, platform.name);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {adapterName} E-Mail Template — {platform.name}
              </h3>
              <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                Loop: {varBtn("{{#jobs}}")}…{varBtn("{{/jobs}}")}
                &nbsp;|&nbsp;
                {[
                  "$title",
                  "$company",
                  "$match_score",
                  "$reasoning",
                  "$url",
                  "$userName",
                  "$jobCount",
                ].map((v) => varBtn(v))}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ml-3"
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

          {/* Body */}
          <div className="p-5 flex-1 overflow-auto space-y-4 min-h-0">
            {/* Recipients */}
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Empfänger (kommagetrennt){" "}
                <span className="text-rose-500">*</span>
              </p>
              <input
                type="text"
                value={recipientsValue}
                onChange={(e) => onRecipientsChange(e.target.value)}
                placeholder="email@example.com, other@example.com"
                className={`w-full text-xs bg-slate-50 dark:bg-slate-950 border rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  !recipientsValue.trim()
                    ? "border-rose-300 dark:border-rose-700 bg-rose-50/30 dark:bg-rose-900/10"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              />
              {!recipientsValue.trim() && (
                <p className="text-[10px] text-rose-500 mt-1">
                  Pflichtfeld — ohne Empfänger kann keine E-Mail gesendet
                  werden.
                </p>
              )}
            </div>

            {/* Template selector */}
            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Template laden
              </p>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="__default__">Standard-Template</option>
                {adapterTemplates.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.is_admin ? "🔒 " : ""}
                    {t.name}
                  </option>
                ))}
              </select>
              {adapterTemplates.length === 0 && (
                <p className="text-[11px] text-slate-400 italic">
                  Keine Templates vorhanden — erstelle E-Mail-Templates unter{" "}
                  <span className="font-semibold not-italic">
                    Einstellungen → Benachrichtigungs-Templates
                  </span>
                  .
                </p>
              )}
            </div>

            {/* Editor / Preview tabs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  HTML Template (optional)
                </p>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[10px] font-bold">
                  <button
                    onClick={() => setTab("editor")}
                    className={`px-3 py-1 transition-colors cursor-pointer ${tab === "editor" ? "bg-indigo-600 text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  >
                    Editor
                  </button>
                  <button
                    onClick={() => setTab("preview")}
                    className={`px-3 py-1 transition-colors cursor-pointer ${tab === "preview" ? "bg-indigo-600 text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  >
                    Vorschau
                  </button>
                </div>
              </div>

              {tab === "editor" ? (
                <textarea
                  ref={textareaRef}
                  value={templateValue}
                  onChange={(e) => onTemplateChange(e.target.value)}
                  placeholder={PLACEHOLDER}
                  rows={10}
                  className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[120px]"
                  spellCheck={false}
                />
              ) : (
                <iframe
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-white"
                  style={{
                    height: "320px",
                    resize: "vertical",
                    overflow: "auto",
                  }}
                  title="Template-Vorschau"
                />
              )}

              {templateValue && tab === "editor" && (
                <button
                  onClick={() => {
                    onTemplateChange("");
                    setSelectedTemplateId("__default__");
                  }}
                  className="mt-2 text-xs text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Auf Standard zurücksetzen
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {tab === "preview"
                ? `Vorschau mit Beispieldaten — echte Werte werden beim Versand eingesetzt.${!templateValue.trim() ? " (Standard-Template)" : ""}`
                : "Wird kein Template gesetzt, wird eine Standard-HTML-E-Mail mit allen Job-Matches der Plattform versendet."}
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center p-5 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex flex-col gap-1">
              <button
                onClick={onSendTest}
                disabled={testStatus === "sending"}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60 ${
                  testStatus === "ok"
                    ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800"
                    : testStatus === "error"
                      ? "text-rose-600 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-800"
                      : "text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                {testStatus === "sending" && (
                  <svg
                    className="w-3 h-3 animate-spin"
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
                )}
                {testStatus === "ok" && (
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {testStatus === "error" && (
                  <svg
                    className="w-3 h-3"
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
                )}
                {testStatus === "ok"
                  ? "Gesendet!"
                  : testStatus === "error"
                    ? "Fehlgeschlagen"
                    : "Test-E-Mail senden"}
              </button>
              {testStatus === "error" && testError && (
                <p className="text-[10px] text-rose-500 max-w-xs break-all">
                  {testError}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {saveStatus === "error" && saveError && (
                <p className="text-[10px] text-rose-500 max-w-[180px] break-words">
                  {saveError}
                </p>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                onClick={onSave}
                disabled={saveStatus === "saving"}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer shadow-sm disabled:opacity-60 flex items-center gap-1.5 ${
                  saveStatus === "saved"
                    ? "text-white bg-emerald-600"
                    : saveStatus === "error"
                      ? "text-white bg-rose-600 hover:bg-rose-500"
                      : "text-white bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                {saveStatus === "saving" && (
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
                )}
                {saveStatus === "saved" && (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {saveStatus === "saving"
                  ? "Speichern..."
                  : saveStatus === "saved"
                    ? "Gespeichert"
                    : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
