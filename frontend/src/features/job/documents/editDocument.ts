const DOCTYPE = "<!DOCTYPE html>";
const POLICY_ATTRIBUTE = "data-editor-policy";
const EDITOR_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:";
const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "xlink:href", "data"];
// template: DOMParser keeps its content out of reach of every selector, but a frame attaches a
// declarative shadow root (<template shadowrootmode>) as live DOM, links and SMIL included.
// set, animate: SVG animation puts a link target back at runtime, without script.
const REMOVED_ELEMENTS =
  "script, iframe, object, embed, base, link, form, meta[http-equiv], template, set, animate, frame";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
// A click on an SVG link, or on any MathML element with an href (Firefox), navigates the designMode
// frame; an HTML link in a stored CV does not, so it stays.
const FOREIGN_LINK_ATTRIBUTES = ["href", "xlink:href"];
const REMOVED_ATTRIBUTES = ["srcdoc", "srcset", "formaction"];
const SCRIPT_URL = /^[\s\u0000-\u001f]*javascript:/i;

/** Upper bound for one stored document; the PUT endpoint itself has none (backend follow-up). */
export const MAX_HTML_LENGTH = 1_000_000;

function isScriptCarrier(attribute: Attr): boolean {
  const name = attribute.name.toLowerCase();
  if (name.startsWith("on") || REMOVED_ATTRIBUTES.includes(name)) return true;
  return URL_ATTRIBUTES.includes(name) && SCRIPT_URL.test(attribute.value);
}

function isForeignLink(element: Element): boolean {
  if (element.namespaceURI === MATHML_NAMESPACE) return true;
  return element.namespaceURI === SVG_NAMESPACE && element.localName === "a";
}

function stripForeignLinkTargets(doc: Document): void {
  doc.querySelectorAll("*").forEach((element) => {
    if (!isForeignLink(element)) return;
    FOREIGN_LINK_ATTRIBUTES.forEach((name) => element.removeAttribute(name));
  });
}

function stripActiveContent(doc: Document): void {
  doc.querySelectorAll(REMOVED_ELEMENTS).forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((element) => {
    [...element.attributes].filter(isScriptCarrier).forEach((a) => element.removeAttribute(a.name));
  });
  stripForeignLinkTargets(doc);
}

function addEditorPolicy(doc: Document): void {
  const policy = doc.createElement("meta");
  policy.setAttribute("http-equiv", "Content-Security-Policy");
  policy.setAttribute("content", EDITOR_POLICY);
  policy.setAttribute(POLICY_ATTRIBUTE, "");
  doc.head.prepend(policy);
}

/**
 * Stored HTML comes from the AI and from templates, so it is untrusted: the editor frame gets it
 * without active or remote-loading content, behind a CSP that forbids everything but inline
 * styles and local images and fonts. The edited document is serialised from this sanitised DOM,
 * so on* attributes, http-equiv metas, SVG and MathML link targets and the elements above are
 * removed from the stored copy permanently, not only from the view; templates contain none of them.
 */
export function prepareForEditing(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  stripActiveContent(doc);
  addEditorPolicy(doc);
  return `${DOCTYPE}\n${doc.documentElement.outerHTML}`;
}

/** The edited document as the server stores it (cv_html / cover_letter_html). */
export function serializeDocument(doc: Document): string {
  doc.querySelectorAll(`meta[${POLICY_ATTRIBUTE}]`).forEach((node) => node.remove());
  return `${DOCTYPE}\n${doc.documentElement.outerHTML}`;
}
