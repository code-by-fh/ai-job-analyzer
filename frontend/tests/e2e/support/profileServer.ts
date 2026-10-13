// Runtime imports only from modules without the API client (it needs the app's env at load).
import {
  DEFAULT_FILE_TEMPLATE,
  DOCUMENT_TEMPLATES_PATH,
  FILE_TEMPLATES_PATH,
  MAX_FILE_BYTES,
  MAX_TEMPLATE_HTML_LENGTH,
  MAX_TEMPLATE_NAME_LENGTH,
  PROFILE_DOCUMENTS_PATH,
  PROFILE_LIMITS,
  PROOF_DOC_TYPES,
  PROOF_TYPES,
  REFUSAL,
  SECRET_MASK,
  SETTINGS_PATH,
  TEMPLATE_STATUS,
  TEMPLATE_PREVIEW_PATH,
  TEMPLATE_SELECTION_PATH,
  UPLOAD_CV_PATH,
  documentTemplatePath,
  profileDocumentFilePath,
  profileDocumentPath,
} from "../../../src/api/profilePaths";
import type { Request } from "@playwright/test";
import type { ProfileBody } from "../../../src/api/profile";
import type { SetupStatusBody } from "../../../src/api/setup";
import type { ProfileDocumentBody } from "../../../src/api/profileDocuments";
import type { DocumentTemplateBody, FileTemplatesBody } from "../../../src/api/templates";
import { AUTHENTICATED_ROUTES, SETUP_DONE } from "./fixtures";
import { NOW_ISO, PDF } from "./jobFixtures";
import {
  live,
  reply,
  setRoutes,
  type MockResponse,
  type MockRoutes,
  type MutableRoutes,
  type Reply,
} from "./mockApi";
import {
  DOCUMENT_TEMPLATES,
  E2E_NOTIFICATION_FIELDS,
  E2E_OTHER_COLUMNS,
  E2E_SECRETS,
  FILE_TEMPLATES,
  PROFILE_DOCUMENTS,
  STORED_PROFILE,
} from "./profileFixtures";

type Stored = ProfileBody & Record<string, unknown>;
const SECRET_KEYS = Object.keys(E2E_SECRETS);
const HTTP_UNPROCESSABLE = 422;
const HTTP_UNSUPPORTED = 415;
const HTTP_TOO_LARGE = 413;
const HTTP_NOT_FOUND = 404;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const SELECTION_FIELDS = ["cv_template", "cover_letter_template"] as const;
const NUMERIC_REF = /^\d+$/;
/**
 * A render that carries script, as a stored hostile row could: the web's own layer of the
 * defence (empty sandbox, stripped markup, CSP) must hold on its own. The real server never
 * returns this for a valid template (scripts are stripped at save time, values are escaped).
 */
const HOSTILE_PREVIEW =
  "<html><head><script>window.top.document.title='pwned';window.top.__pwned=1</script></head>" +
  '<body><h1>Jonas Weber</h1><img src=x onerror="window.top.__pwned=1"></body></html>';
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
/** Preflight ruling 35: the real renderers autoescape the profile values. */
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char]!);
const PDF_SIGNATURE = "%PDF-";
const PNG_SIGNATURE = "\u0089PNG";
// The magic bytes core/uploads.py checks, for the types the e2e specs upload.
const SIGNATURE: Readonly<Record<string, string>> = {
  "application/pdf": PDF_SIGNATURE,
  "image/png": PNG_SIGNATURE,
};
const BODY_SEPARATOR = "\r\n\r\n";
const PART_END = "\r\n--";

interface ProofUpload {
  filename: string;
  mime: string;
  docType: string;
  content: string;
}

/**
 * The file part and doc_type of a multipart body (the e2e uploads are small, so a text scan is
 * enough). Read as latin1 so binary signatures survive; the file name is UTF-8.
 */
function proofUploadOf(request: Request): ProofUpload | null {
  const body = request.postDataBuffer()?.toString("latin1") ?? "";
  const filename = /filename="([^"]*)"/.exec(body)?.[1];
  const mime = /Content-Type: ([^\r\n]+)\r\n\r\n/.exec(body)?.[1];
  if (filename === undefined || !mime) return null;
  const start = body.indexOf(BODY_SEPARATOR, body.indexOf("filename=")) + BODY_SEPARATOR.length;
  return {
    filename: Buffer.from(filename, "latin1").toString("utf8"),
    mime,
    docType: /name="doc_type"\r\n\r\n([^\r\n]*)/.exec(body)?.[1] ?? "",
    content: body.slice(start, body.indexOf(PART_END, start)),
  };
}

const unsupported = () => reply(HTTP_UNSUPPORTED, { detail: REFUSAL.unsupportedType });
/** pydantic's 422 on a template field; the real msg is free text, which the web never shows. */
const templateRefusal = (field: "name" | "html") =>
  reply(HTTP_UNPROCESSABLE, {
    detail: [{ type: "value_error", loc: ["body", field], msg: "refused" }],
  });

/** A PDF whose text the e2e server treats as missing, like a scan (server: 422 cv_no_text). */
export const SCANNED_MARKER = "SCANNED_IMAGE_ONLY";
/** What the fake AI reads from any other PDF. */
export const IMPORTED_CV = {
  role: "Backend-Entwickler",
  skills: "Kotlin, Java",
  min_salary: "",
  location: "",
  cv_data: {
    experience: [
      {
        company: "Hanseatic Commerce GmbH",
        role: "Senior Backend Engineer",
        duration: "2021 – heute",
        description: "Checkout.",
      },
    ],
    projects: [],
    education: "B.Sc. Informatik",
  },
};
const IMPORTED_TEXT_FIELDS = ["role", "skills", "min_salary", "location"] as const;
const TEXT_LIMIT: Readonly<Record<string, number>> = {
  role: PROFILE_LIMITS.role,
  skills: PROFILE_LIMITS.skills,
  min_salary: PROFILE_LIMITS.minSalary,
  location: PROFILE_LIMITS.location,
  preferences: PROFILE_LIMITS.preferences,
};

const ENTRY_LIMITS: Readonly<Record<CvList, Readonly<Record<string, number>>>> = {
  experience: {
    company: PROFILE_LIMITS.entryTitle,
    role: PROFILE_LIMITS.entryTitle,
    duration: PROFILE_LIMITS.entryDuration,
    description: PROFILE_LIMITS.entryText,
  },
  projects: {
    name: PROFILE_LIMITS.entryTitle,
    tech_stack: PROFILE_LIMITS.entryTitle,
    description: PROFILE_LIMITS.entryText,
  },
};
const CV_LISTS = Object.keys(ENTRY_LIMITS) as CvList[];

type CvList = "experience" | "projects";
type Loc = (string | number)[];
type SentEntry = Readonly<Record<string, unknown>>;
type SentCv = Partial<Record<CvList, SentEntry[]>> & { education?: string };

const tooLong = (value: unknown, limit: number) => String(value ?? "").length > limit;

/** pydantic's location of the first refused item: the list itself, or one entry's field. */
function entriesRefusal(list: CvList, entries: readonly SentEntry[]): Loc | null {
  if (entries.length > PROFILE_LIMITS.cvEntries) return [list];
  const limits = ENTRY_LIMITS[list];
  for (const [index, entry] of entries.entries()) {
    const field = Object.keys(limits).find((key) => tooLong(entry[key], limits[key]!));
    if (field) return [list, index, field];
  }
  return null;
}

function cvRefusal(cv: SentCv): Loc | null {
  for (const list of CV_LISTS) {
    const loc = entriesRefusal(list, cv[list] ?? []);
    if (loc) return loc;
  }
  return tooLong(cv.education, PROFILE_LIMITS.education) ? ["education"] : null;
}

/** core.py: at most 20 languages of at most 50 characters each. */
function languagesRefusal(languages: readonly string[]): Loc | null {
  if (languages.length > PROFILE_LIMITS.spokenLanguages) return [];
  const index = languages.findIndex((language) => tooLong(language, PROFILE_LIMITS.spokenLanguage));
  return index < 0 ? null : [index];
}

/** The 422 location of one sent key by core.py's limits (`None` is refused on every field), or null. */
function refusal(key: string, value: unknown): Loc | null {
  if (value === null) return [key];
  if (typeof value === "string") return tooLong(value, TEXT_LIMIT[key] ?? Infinity) ? [key] : null;
  const inner =
    key === "spoken_languages"
      ? languagesRefusal(value as string[])
      : key === "cv_data"
        ? cvRefusal(value as SentCv)
        : null;
  return inner ? [key, ...inner] : null;
}

/**
 * The profile endpoints by the rules of routers/settings.py, profile_documents.py and
 * templates.py: answers come from this state, never from the request body.
 */
export class ProfileServer {
  profile: Stored;
  readonly documents: ProfileDocumentBody[];
  readonly templates: DocumentTemplateBody[];
  readonly files: FileTemplatesBody;
  /** Every POST /settings body, for "sends only its own fields" assertions. */
  readonly saved: Record<string, unknown>[] = [];
  aiConfigured = true;
  /** The preview answers HOSTILE_PREVIEW instead of the rendered template. */
  hostilePreview = false;
  /** Set by profileRoutes, so an uploaded document gets its per-document routes. */
  routes: MutableRoutes | null = null;
  private documentSeq = Math.max(...PROFILE_DOCUMENTS.map((document) => document.id));
  private templateSeq = 20;

  constructor(profile: ProfileBody = STORED_PROFILE) {
    this.profile = {
      ...structuredClone(profile),
      ...E2E_SECRETS,
      ...E2E_NOTIFICATION_FIELDS,
      ...structuredClone(E2E_OTHER_COLUMNS),
    };
    this.documents = structuredClone(PROFILE_DOCUMENTS);
    this.templates = structuredClone(DOCUMENT_TEMPLATES);
    this.files = structuredClone(FILE_TEMPLATES);
  }

  /**
   * GET /settings: the whole row, secrets replaced by the mask (deps._mask_profile). It also
   * answers the shell's language and time zone queries, hence `language` and `timezone`.
   */
  settings(): Stored {
    const masked: Stored = {
      ...structuredClone(this.profile),
      language: "de",
      timezone: "Europe/Berlin",
    };
    for (const key of SECRET_KEYS) if (masked[key]) masked[key] = SECRET_MASK;
    return masked;
  }

  /** GET /setup-status: the profile counts as complete with a role and skills (routers/settings.py). */
  setupStatus(): SetupStatusBody {
    const complete = Boolean(this.profile.role?.trim() && this.profile.skills?.trim());
    return { ...SETUP_DONE, ai_configured: this.aiConfigured, profile_complete: complete };
  }

  /**
   * POST /settings (routers/settings.py save_settings, B2): writes only the keys sent; an explicit
   * null or a value over its limit is a 422 at that location and nothing is written.
   */
  save(sent: unknown): Reply | { status: string } {
    const body = sent as Record<string, unknown>;
    this.saved.push(structuredClone(body));
    const loc = Object.keys(body)
      .map((key) => refusal(key, body[key]))
      .find((found) => found !== null);
    if (loc) {
      const detail = [{ type: "value_error", loc: ["body", ...loc], msg: "refused" }];
      return reply(HTTP_UNPROCESSABLE, { detail });
    }
    Object.assign(this.profile, body);
    return { status: "saved" };
  }

  /**
   * POST /profile/documents (routers/profile_documents.py `_checked_upload`, Task 1), in the real
   * server's order: a doc_type of the list (422 on the field), an allowed declared type (415), the
   * size (413), bytes matching the declared type (415). Stores the file name and the type sent and
   * answers the stored row.
   */
  uploadDocument(request: Request): Reply | ProfileDocumentBody {
    const upload = proofUploadOf(request);
    if (!upload) return unsupported();
    if (!(PROOF_DOC_TYPES as readonly string[]).includes(upload.docType)) {
      const detail = [
        { type: "value_error", loc: ["body", "doc_type"], msg: REFUSAL.invalidDocType },
      ];
      return reply(HTTP_UNPROCESSABLE, { detail });
    }
    if (!PROOF_TYPES.includes(upload.mime)) return unsupported();
    if (upload.content.length > MAX_FILE_BYTES)
      return reply(HTTP_TOO_LARGE, { detail: REFUSAL.fileTooLarge });
    const signature = SIGNATURE[upload.mime];
    if (signature && !upload.content.startsWith(signature)) return unsupported();
    return this.storeDocument(upload);
  }

  private storeDocument(upload: ProofUpload): ProfileDocumentBody {
    this.documentSeq += 1;
    const document: ProfileDocumentBody = {
      id: this.documentSeq,
      doc_type: upload.docType,
      label: upload.filename,
      original_filename: upload.filename,
      file_size: upload.content.length,
      mime_type: upload.mime,
      created_at: NOW_ISO,
      downloadable: true,
    };
    this.documents.unshift(document);
    if (this.routes) setRoutes(this.routes, documentRoutes(this, document.id));
    return structuredClone(document);
  }

  /** DELETE /profile/documents/{id}: the owner's document only (404 otherwise). */
  deleteDocument(id: number): Reply | { status: string } {
    const index = this.documents.findIndex((document) => document.id === id);
    if (index < 0) return reply(HTTP_NOT_FOUND, { detail: "Document not found" });
    this.documents.splice(index, 1);
    return { status: "deleted" };
  }

  /**
   * POST /settings/upload-cv (routers/settings.py upload_cv): the bytes must be a PDF (415), the
   * PDF must hold text (422 cv_no_text on file); non-empty values replace stored ones, the CV data
   * is replaced as a whole, and the answer is what is stored.
   */
  importCv(request: Request): Reply | { status: string; data: unknown } {
    const bytes = request.postDataBuffer()?.toString("latin1") ?? "";
    if (!bytes.includes(PDF_SIGNATURE))
      return reply(HTTP_UNSUPPORTED, { detail: REFUSAL.unsupportedType });
    if (bytes.includes(SCANNED_MARKER)) {
      const detail = [{ type: "value_error", loc: ["body", "file"], msg: REFUSAL.cvNoText }];
      return reply(HTTP_UNPROCESSABLE, { detail });
    }
    for (const field of IMPORTED_TEXT_FIELDS)
      if (IMPORTED_CV[field]) this.profile[field] = IMPORTED_CV[field];
    this.profile.cv_data = structuredClone(IMPORTED_CV.cv_data);
    const stored = Object.fromEntries(IMPORTED_TEXT_FIELDS.map((key) => [key, this.profile[key]]));
    return {
      status: "success",
      data: { ...stored, cv_data: structuredClone(this.profile.cv_data) },
    };
  }

  /**
   * PATCH /settings/template (routers/settings.py `_check_template_selection`, Task 3): a numeric
   * reference must name a template of the list (422 otherwise) that is not being filled (409).
   */
  selectTemplate(sent: unknown): Reply | { status: string } {
    const body = sent as Partial<Record<(typeof SELECTION_FIELDS)[number], string>>;
    for (const field of SELECTION_FIELDS) {
      const ref = body[field];
      if (!ref || !NUMERIC_REF.test(ref)) continue;
      const template = this.templates.find((entry) => String(entry.id) === ref);
      if (!template) return reply(HTTP_UNPROCESSABLE, { detail: `${field}: template not found` });
      if (template.status === TEMPLATE_STATUS.processing)
        return reply(HTTP_CONFLICT, { detail: REFUSAL.templateProcessing });
    }
    Object.assign(this.profile, body);
    return { status: "saved" };
  }

  /** DELETE /document-templates/{id} (Task 3): own only; a selection naming it becomes null. */
  deleteTemplate(id: number): Reply | { ok: boolean } {
    const index = this.templates.findIndex((entry) => entry.id === id && !entry.is_admin);
    if (index < 0)
      return reply(HTTP_NOT_FOUND, { detail: "Template not found or cannot be deleted" });
    this.templates.splice(index, 1);
    for (const field of SELECTION_FIELDS)
      if (this.profile[field] === String(id)) this.profile[field] = null;
    return { ok: true };
  }

  /**
   * POST /document-templates (Task 3): name trimmed, 1-100 characters (422 on name); html within
   * the limit (422 on html); a user CV template starts the AI fill (status "processing").
   */
  createTemplate(sent: unknown): Reply | DocumentTemplateBody {
    const body = sent as { doc_type?: string; name?: string; html?: string };
    const name = (body.name ?? "").trim();
    if (!name || name.length > MAX_TEMPLATE_NAME_LENGTH) return templateRefusal("name");
    if ((body.html ?? "").length > MAX_TEMPLATE_HTML_LENGTH) return templateRefusal("html");
    this.templateSeq += 1;
    const docType = body.doc_type ?? "CV";
    const template: DocumentTemplateBody = {
      id: this.templateSeq,
      doc_type: docType,
      name,
      is_admin: false,
      user_id: 1,
      status: docType === "CV" ? TEMPLATE_STATUS.processing : null,
      created_at: NOW_ISO,
      updated_at: NOW_ISO,
    };
    this.templates.push(template);
    if (this.routes) setRoutes(this.routes, templateRoutes(this, template.id));
    return structuredClone(template);
  }

  /** What the Celery fill does at its end (Task 3); the test then pushes template_ready. */
  finishTemplate(name: string, status: string | null): number {
    const template = this.templates.find((entry) => entry.name === name);
    if (!template) throw new Error(`profile server: no template ${name}`);
    template.status = status;
    template.updated_at = NOW_ISO;
    return template.id;
  }

  /** GET /document-templates/preview (Task 4): the template rendered with the stored profile. */
  preview(request: Request): Reply | { html: string } {
    const ref = new URL(request.url()).searchParams.get("template") ?? "";
    const known =
      ref === DEFAULT_FILE_TEMPLATE || this.templates.some((entry) => String(entry.id) === ref);
    if (!known) return reply(HTTP_NOT_FOUND, { detail: REFUSAL.templateNotFound });
    if (this.hostilePreview) return { html: HOSTILE_PREVIEW };
    const role = escapeHtml(this.profile.role ?? "");
    return { html: `<html><body><h1>Jonas Weber</h1><p>${role}</p></body></html>` };
  }
}

export function profileRoutes(server = new ProfileServer(), extra: MockRoutes = {}): MutableRoutes {
  const routes: MutableRoutes = {
    ...AUTHENTICATED_ROUTES,
    [`GET ${SETTINGS_PATH}`]: live(() => server.settings()),
    [`POST ${SETTINGS_PATH}`]: live((sent) => server.save(sent)),
    [`POST ${UPLOAD_CV_PATH}`]: live((_sent, request) => server.importCv(request)),
    "GET /setup-status": live(() => server.setupStatus()),
    [`GET ${PROFILE_DOCUMENTS_PATH}`]: live(() => structuredClone(server.documents)),
    [`POST ${PROFILE_DOCUMENTS_PATH}`]: live((_sent, request) => server.uploadDocument(request)),
    [`GET ${DOCUMENT_TEMPLATES_PATH}`]: live(() => structuredClone(server.templates)),
    [`POST ${DOCUMENT_TEMPLATES_PATH}`]: live((sent) => server.createTemplate(sent)),
    [`GET ${FILE_TEMPLATES_PATH}`]: live(() => structuredClone(server.files)),
    [`PATCH ${TEMPLATE_SELECTION_PATH}`]: live((sent) => server.selectTemplate(sent)),
    [`GET ${TEMPLATE_PREVIEW_PATH}`]: live((_sent, request) => server.preview(request)),
  };
  for (const { id } of server.documents) setRoutes(routes, documentRoutes(server, id));
  for (const { id } of server.templates) setRoutes(routes, templateRoutes(server, id));
  server.routes = routes;
  // The spec's own routes win over the per-document ones.
  return Object.assign(routes, extra);
}

/** The per-document calls; a Drive document answers 400 on view and download (Task 1). */
export function documentRoutes(server: ProfileServer, id: number): MockRoutes {
  const document = server.documents.find((entry) => entry.id === id);
  const file: MockResponse =
    document?.downloadable === false
      ? live(() => reply(HTTP_BAD_REQUEST, { detail: "File not available" }))
      : { body: PDF, contentType: "application/pdf" };
  return {
    [`DELETE ${profileDocumentPath(id)}`]: live(() => server.deleteDocument(id)),
    [`GET ${profileDocumentFilePath(id, "view")}`]: file,
    [`GET ${profileDocumentFilePath(id, "download")}`]: file,
  };
}

/** The per-template calls (preflight ruling 21: defined here, reused for uploads by Task 12). */
export function templateRoutes(server: ProfileServer, id: number): MockRoutes {
  return { [`DELETE ${documentTemplatePath(id)}`]: live(() => server.deleteTemplate(id)) };
}
