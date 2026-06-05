"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth, fetchWithAuth } from "../components/AuthProvider";
import DynamicList from "./components/DynamicList";
import PageWrapper from "../components/PageWrapper";
import PageHeader from "../components/PageHeader";
import AutoResizeTextarea from "../components/AutoResizeTextarea";
import { useLanguage } from "../components/LanguageProvider";
import { useNotification } from "../components/NotificationProvider";
import { logger } from "../lib/logger";

type Tab = "target" | "resume" | "documents";
type SaveStatus = "idle" | "saving" | "saved" | "error";

import {
  Target,
  FileText,
  Briefcase,
  Zap,
  CircleDollarSign,
  MapPin,
  Sparkles,
  CheckCircle2,
  UploadCloud,
  GraduationCap,
  Trash2,
  FilePlus,
  LayoutTemplate,
  Languages,
} from "lucide-react";
import type { DocumentTemplate } from "../lib/types";

interface ProfileDoc {
  id: number;
  doc_type: string;
  label: string | null;
  original_filename: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string | null;
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all";

export default function Profile() {
  const { token, refreshUser } = useAuth();
  const { t } = useLanguage();
  const { showError } = useNotification();

  const [activeTab, setActiveTab] = useState<Tab>("target");
  const [formData, setFormData] = useState({
    role: "",
    skills: "",
    min_salary: "",
    location: "",
    preferences: "",
    spoken_languages: "",
    cv_data: {
      experience: [] as any[],
      projects: [] as any[],
      education: "",
    },
  });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [profileDocs, setProfileDocs] = useState<ProfileDoc[]>([]);
  const [templates, setTemplates] = useState<{ cv: string[]; cover_letter: string[] }>({ cv: [], cover_letter: [] });
  const [cvTemplate, setCvTemplate] = useState("classic");
  const [coverLetterTemplate, setCoverLetterTemplate] = useState("classic");
  const [docsLoading, setDocsLoading] = useState(false);
  const [docTemplates, setDocTemplates] = useState<DocumentTemplate[]>([]);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  useEffect(() => {
    if (token) {
      fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings-view`)
        .then((res) => res.json())
        .then(async (data) => {
          const profileData = data.profile || {};
          const spokenArr: string[] = profileData.spoken_languages || [];
          setFormData({
            role: profileData.role || "",
            skills: profileData.skills || "",
            min_salary: profileData.min_salary || "",
            location: profileData.location || "",
            preferences: profileData.preferences || "",
            spoken_languages: spokenArr.join(", "),
            cv_data: profileData.cv_data || {
              experience: [],
              projects: [],
              education: "",
            },
          });
          if (profileData.cv_template) setCvTemplate(profileData.cv_template);
          if (profileData.cover_letter_template) setCoverLetterTemplate(profileData.cover_letter_template);

          const tmplRes = await fetchWithAuth(
            `${process.env.NEXT_PUBLIC_API_URL}/document-templates`
          );
          if (tmplRes.ok) {
            const tmplData: DocumentTemplate[] = await tmplRes.json();
            setDocTemplates(tmplData);
          }

          setLoading(false);
        })
        .catch((e) => {
          logger.error({ err: e }, "Fetch profile settings errored");
          showError(`GET /settings-view failed: ${e?.message || e}`);
          setLoading(false);
        });
    }
  }, [token]);

  const loadProfileDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/profile/documents`);
      if (res.ok) setProfileDocs(await res.json());
    } catch (e: any) {
      logger.error({ err: e }, "Failed to load profile documents");
    } finally {
      setDocsLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/profile/templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e: any) {
      logger.error({ err: e }, "Failed to load templates");
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadProfileDocs();
      loadTemplates();
    }
  }, [token, loadProfileDocs, loadTemplates]);

  const uploadProfileDoc = async (file: File, docType: "REFERENCE" | "CERTIFICATE") => {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    form.append("label", file.name);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/profile/documents`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        await loadProfileDocs();
      } else {
        showError("Upload fehlgeschlagen");
      }
    } catch (e: any) {
      logger.error({ err: e }, "Profile doc upload failed");
      showError("Upload fehlgeschlagen");
    }
  };

  const deleteProfileDoc = async (id: number) => {
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/profile/documents/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProfileDocs((prev) => prev.filter((d) => d.id !== id));
      } else {
        showError("Löschen fehlgeschlagen");
      }
    } catch (e: any) {
      logger.error({ err: e }, "Profile doc delete failed");
      showError("Löschen fehlgeschlagen");
    }
  };

  const handleUploadTemplate = async (
    file: File,
    docType: "CV" | "COVER_LETTER"
  ) => {
    setUploadingTemplate(true);
    try {
      const html = await file.text();
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/document-templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            doc_type: docType,
            name: file.name.replace(/\.html?$/, ""),
            html,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        showError(err.detail || "Upload fehlgeschlagen");
        return;
      }
      const created: DocumentTemplate = await res.json();
      setDocTemplates((prev) => [...prev, created]);
    } finally {
      setUploadingTemplate(false);
    }
  };

  const completionData = useCallback(() => {
    const missing = [];
    if (!formData.role) missing.push(t("targetRole"));
    if (!formData.skills) missing.push(t("skillsComma"));
    if (!formData.min_salary) missing.push(t("minSalary"));
    if (!formData.location) missing.push(t("location"));
    if (!formData.preferences) missing.push(t("preferencesNatural"));
    if (formData.cv_data.experience.length === 0) missing.push(t("experience"));
    if (formData.cv_data.projects.length === 0) missing.push(t("keyProjects"));
    if (!formData.cv_data.education) missing.push(t("education"));

    const total = 8;
    const filled = total - missing.length;
    return {
      pct: Math.round((filled / total) * 100),
      missing,
    };
  }, [formData, t]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setSaveStatus("saving");
    try {
      const spokenLanguages = formData.spoken_languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          spoken_languages: spokenLanguages,
          cv_template: cvTemplate,
          cover_letter_template: coverLetterTemplate,
        }),
      });
      setSaveStatus("saved");
      refreshUser();
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (e: any) {
      showError(e?.message || t("error"));
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const processUpload = async (file: File) => {
    setUploading(true);
    setUploadMessage(t("analyzingPdf"));
    const uploadData = new FormData();
    uploadData.append("file", file);
    try {
      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/settings/upload-cv`,
        {
          method: "POST",
          body: uploadData,
        },
      );
      if (!res.ok) throw new Error("Upload failed");
      const result = await res.json();
      const data = result.data;
      setFormData((prev) => ({
        role: data.role || prev.role || "",
        skills: data.skills || prev.skills || "",
        min_salary: data.min_salary || prev.min_salary || "",
        location: data.location || prev.location || "",
        preferences: prev.preferences || "",
        spoken_languages: prev.spoken_languages || "",
        cv_data: data.cv_data || {
          experience: [],
          projects: [],
          education: "",
        },
      }));
      setUploadMessage(t("importSuccess"));
      setTimeout(() => setUploadMessage(""), 3000);
    } catch (error) {
      logger.error({ err: error }, "CV upload failed");
      setUploadMessage(t("importFailed"));
      setTimeout(() => setUploadMessage(""), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processUpload(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === "application/pdf") processUpload(file);
  };

  // Experience handlers
  const handleExpChange = (idx: number, field: string, val: string) => {
    const newExp = [...formData.cv_data.experience];
    newExp[idx] = { ...newExp[idx], [field]: val };
    setFormData({
      ...formData,
      cv_data: { ...formData.cv_data, experience: newExp },
    });
  };
  const addExp = () =>
    setFormData({
      ...formData,
      cv_data: {
        ...formData.cv_data,
        experience: [
          ...formData.cv_data.experience,
          { company: "", role: "", duration: "", description: "" },
        ],
      },
    });
  const removeExp = (idx: number) =>
    setFormData({
      ...formData,
      cv_data: {
        ...formData.cv_data,
        experience: formData.cv_data.experience.filter((_, i) => i !== idx),
      },
    });

  // Project handlers
  const handleProjChange = (idx: number, field: string, val: string) => {
    const newProj = [...formData.cv_data.projects];
    newProj[idx] = { ...newProj[idx], [field]: val };
    setFormData({
      ...formData,
      cv_data: { ...formData.cv_data, projects: newProj },
    });
  };
  const addProj = () =>
    setFormData({
      ...formData,
      cv_data: {
        ...formData.cv_data,
        projects: [
          ...formData.cv_data.projects,
          { name: "", tech_stack: "", description: "" },
        ],
      },
    });
  const removeProj = (idx: number) =>
    setFormData({
      ...formData,
      cv_data: {
        ...formData.cv_data,
        projects: formData.cv_data.projects.filter((_, i) => i !== idx),
      },
    });

  if (loading)
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {t("loadingProfile")}
            </p>
          </div>
        </div>
      </PageWrapper>
    );

  const { pct, missing } = completionData();
  const pctColor =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  const pctTextColor =
    pct >= 80
      ? "text-emerald-500"
      : pct >= 50
        ? "text-amber-500"
        : "text-rose-500";

  return (
    <PageWrapper>
      <PageHeader
        title={t("profileAndResume")}
        subtitle={t("profileDescription")}
      />

      {/* Profile Completion */}
      <div className="glass-card rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            {t("profileCompletion")}
          </span>
          <span className={`text-sm font-bold tabular-nums ${pctTextColor}`}>
            {pct}%
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${pctColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {missing.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {t("missingFields")}:
            </span>
            {missing.map((field, i) => (
              <span
                key={i}
                className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-700/30"
              >
                <span className={`w-1 h-1 rounded-full ${pctColor}`} /> {field}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* CV Upload Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 mb-8 ${
          dragOver
            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.01]"
            : uploading
              ? "border-purple-300 dark:border-purple-500/40 bg-purple-50/30 dark:bg-purple-500/5"
              : "border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50 dark:bg-slate-800/20"
        }`}
      >
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          disabled={uploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
        />
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center pointer-events-none select-none">
          {uploading ? (
            <>
              <div className="w-12 h-12 border-4 border-purple-400/30 border-t-purple-500 rounded-full animate-spin mb-4" />
              <p className="font-semibold text-purple-600 dark:text-purple-400">
                {t("analyzing")}
              </p>
              <p className="text-xs text-slate-400 mt-1">{uploadMessage}</p>
            </>
          ) : uploadMessage ? (
            <>
              <div className="w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-3 text-2xl">
                <CheckCircle2 className="text-emerald-500" />
              </div>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                {uploadMessage}
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4">
                <UploadCloud className="text-indigo-500" />
              </div>
              <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {t("uploadCv")}
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs">
                {t("dropPdf")}
              </p>
              <div className="mt-4 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl">
                {t("selectPdf")}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-8 bg-slate-100/50 dark:bg-slate-800/40 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
        {([
          { id: "target", label: t("targetJob"), icon: <Target size={16} /> },
          { id: "resume", label: t("resume"), icon: <FileText size={16} /> },
          { id: "documents", label: t("applicationDocuments"), icon: <FilePlus size={16} /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer group relative ${
              activeTab === tab.id
                ? "bg-white dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-md shadow-indigo-500/5 ring-1 ring-slate-200/50 dark:ring-indigo-500/30"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50"
            }`}
          >
            <div className="flex items-center justify-center gap-2.5 relative z-10">
              <span className={activeTab === tab.id ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors"}>
                {tab.icon}
              </span>
              {tab.label}
            </div>
            {activeTab === tab.id && (
              <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-indigo-500 dark:bg-indigo-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* TAB: Target Job */}
      {activeTab === "target" && (
        <div className="glass-card rounded-2xl p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
            {t("targetParameters")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label={t("targetRole")} icon={<Briefcase size={14} />}>
              <input
                name="role"
                value={formData.role}
                onChange={handleChange}
                className={inputCls}
                placeholder="e.g. Backend Engineer"
              />
            </Field>
            <Field label={t("skillsComma")} icon={<Zap size={14} />}>
              <AutoResizeTextarea
                name="skills"
                value={formData.skills}
                onChange={handleChange}
                className={inputCls}
                placeholder="Python, AWS, React..."
                rows={1}
              />
            </Field>
            <Field label={t("minSalary")} icon={<CircleDollarSign size={14} />}>
              <input
                name="min_salary"
                value={formData.min_salary}
                onChange={handleChange}
                className={inputCls}
                placeholder="70.000 €"
              />
            </Field>
            <Field label={t("location")} icon={<MapPin size={14} />}>
              <input
                name="location"
                value={formData.location}
                onChange={handleChange}
                className={inputCls}
                placeholder="Berlin, Remote..."
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t("preferencesNatural")}
                icon={<Sparkles size={14} />}
              >
                <AutoResizeTextarea
                  name="preferences"
                  value={formData.preferences}
                  onChange={handleChange}
                  className={inputCls}
                  rows={1}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={t("spokenLanguages")} icon={<Languages size={14} />}>
                <input
                  name="spoken_languages"
                  value={formData.spoken_languages}
                  onChange={handleChange}
                  className={inputCls}
                  placeholder={t("spokenLanguagesPlaceholder")}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Resume */}
      {activeTab === "resume" && (
        <div className="space-y-6">
          {/* Experience */}
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <DynamicList
              title={t("experience")}
              items={formData.cv_data.experience}
              onAdd={addExp}
              onRemove={removeExp}
              onChange={handleExpChange}
              fields={[
                { name: "company", placeholder: t("company") },
                { name: "role", placeholder: t("role") },
                { name: "duration", placeholder: t("duration") },
                {
                  name: "description",
                  placeholder: t("description"),
                  type: "textarea",
                },
              ]}
            />
          </div>

          {/* Projects */}
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <DynamicList
              title={t("keyProjects")}
              items={formData.cv_data.projects}
              onAdd={addProj}
              onRemove={removeProj}
              onChange={handleProjChange}
              fields={[
                { name: "name", placeholder: t("projectName") },
                {
                  name: "tech_stack",
                  placeholder: t("techStack"),
                  type: "textarea",
                },
                {
                  name: "description",
                  placeholder: t("description"),
                  type: "textarea",
                },
              ]}
            />
          </div>

          {/* Education */}
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <GraduationCap size={20} className="text-indigo-500" />{" "}
              {t("education")}
            </h2>
            <AutoResizeTextarea
              value={formData.cv_data.education}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cv_data: { ...formData.cv_data, education: e.target.value },
                })
              }
              className={inputCls}
              placeholder={t("universityPlaceholder")}
              rows={1}
            />
          </div>
        </div>
      )}

      {/* TAB: Documents */}
      {activeTab === "documents" && (
        <div className="space-y-6">
          {/* Template Gallery */}
          <div className="glass-card rounded-2xl p-6 space-y-6">
            <h2 className="font-bold text-lg tracking-tight flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5 text-indigo-500" />
              Dokument-Templates
            </h2>

            {(["CV", "COVER_LETTER"] as const).map((docType) => {
              const label = docType === "CV" ? "Lebenslauf" : "Anschreiben";
              const currentVal = docType === "CV" ? cvTemplate : coverLetterTemplate;
              const setter = docType === "CV" ? setCvTemplate : setCoverLetterTemplate;
              const filtered = docTemplates.filter((tmpl) => tmpl.doc_type === docType);

              return (
                <div key={docType} className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {label}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map((tmpl) => (
                      <button
                        key={tmpl.id}
                        onClick={() => setter(String(tmpl.id))}
                        className={`rounded-xl border-2 p-3 text-left transition-all active:scale-95 ${
                          currentVal === String(tmpl.id)
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                            : "border-slate-200 dark:border-slate-800 hover:border-indigo-300"
                        }`}
                      >
                        <div className="text-xs font-bold truncate">{tmpl.name}</div>
                        {tmpl.is_admin && (
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                            Standard
                          </div>
                        )}
                      </button>
                    ))}

                    {/* Upload button */}
                    <label
                      className={`rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-3 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors ${
                        uploadingTemplate ? "opacity-50 pointer-events-none" : ""
                      }`}
                    >
                      <UploadCloud className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-500">HTML hochladen</span>
                      <input
                        type="file"
                        accept=".html,.htm"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadTemplate(f, docType);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bewerbungsunterlagen */}
          <div className="glass-card rounded-2xl p-6 sm:p-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <FilePlus size={20} className="text-indigo-500" />
              {t("applicationDocuments")}
            </h2>

            {docsLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                Dokumente werden geladen…
              </div>
            ) : (
              <div className="space-y-8">
                {/* Arbeitszeugnisse */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">
                    {t("workReferences")}
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer w-fit px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50 dark:bg-slate-800/20 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition-all text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                    <UploadCloud size={16} />
                    {t("uploadFiles")}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach((f) => uploadProfileDoc(f, "REFERENCE"));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div className="mt-3 space-y-2">
                    {profileDocs
                      .filter((d) => d.doc_type === "REFERENCE")
                      .map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/40"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={15} className="text-indigo-400 shrink-0" />
                            <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                              {doc.original_filename}
                            </span>
                          </div>
                          <button
                            onClick={() => deleteProfileDoc(doc.id)}
                            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                            title="Löschen"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    {profileDocs.filter((d) => d.doc_type === "REFERENCE").length === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                        {t("noWorkReferences")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Zertifikate */}
                <div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">
                    {t("certifications")}
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer w-fit px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50 dark:bg-slate-800/20 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition-all text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400">
                    <UploadCloud size={16} />
                    {t("uploadFiles")}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach((f) => uploadProfileDoc(f, "CERTIFICATE"));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div className="mt-3 space-y-2">
                    {profileDocs
                      .filter((d) => d.doc_type === "CERTIFICATE")
                      .map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/40"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText size={15} className="text-indigo-400 shrink-0" />
                            <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                              {doc.original_filename}
                            </span>
                          </div>
                          <button
                            onClick={() => deleteProfileDoc(doc.id)}
                            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                            title="Löschen"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    {profileDocs.filter((d) => d.doc_type === "CERTIFICATE").length === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                        {t("noCertificates")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sticky Save Bar */}
      {activeTab !== "documents" && <div className="sticky bottom-4 mt-8 flex justify-end pointer-events-none">
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-4 shadow-xl pointer-events-auto">
          {saveStatus !== "idle" && (
            <span
              className={`text-sm font-semibold ${
                saveStatus === "saved"
                  ? "text-emerald-500"
                  : saveStatus === "error"
                    ? "text-rose-500"
                    : "text-slate-400 animate-pulse"
              }`}
            >
              {saveStatus === "saving"
                ? t("saving")
                : saveStatus === "saved"
                  ? t("saved")
                  : t("error")}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={saveStatus === "saving"}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition active:scale-95 cursor-pointer text-sm whitespace-nowrap"
          >
            {saveStatus === "saving" ? "..." : t("saveChanges")}
          </button>
        </div>
      </div>}
    </PageWrapper>
  );
}
