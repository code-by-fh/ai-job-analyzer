import { prepareForEditing } from "@/features/job/documents/editDocument";

// Every element: MathML (Firefox) follows an href on any element, not only on a and area.
const ALL_ELEMENTS = "*";
const LINK_TARGETS = ["href", "xlink:href"];
// SVG animation elements set attributes at runtime without script, a link target among them.
// A template's content is unreachable here but becomes live DOM as a declarative shadow root in the
// frame (fix round 1, I1); prepareForEditing removes it too, this pass must not depend on that.
const UNREACHABLE_OR_SETTERS = "template, set, animate";

/**
 * Ruling R18 (a): the empty sandbox still lets a link navigate the frame itself, and the CSP does
 * not govern navigation, so a click could load a remote page into the preview. The link targets go
 * from every element (removed by qualified name, so the namespaced SVG xlink:href goes too), and so
 * do SVG set/animate elements, which could put one back, and template elements, whose declarative
 * shadow content no selector here reaches; the link text stays. Preview only: the job
 * editor keeps its HTML links (stored documents).
 */
export function withoutLinkTargets(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(UNREACHABLE_OR_SETTERS).forEach((element) => element.remove());
  doc.querySelectorAll(ALL_ELEMENTS).forEach((element) => {
    LINK_TARGETS.forEach((attribute) => element.removeAttribute(attribute));
  });
  return doc.documentElement.outerHTML;
}

/** Ruling R7 plus R18 (a): what the preview frame's srcdoc gets. */
export function previewDocument(html: string): string {
  return prepareForEditing(withoutLinkTargets(html));
}
