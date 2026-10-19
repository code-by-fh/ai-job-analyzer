"use client";

import { useRef, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "@/i18n/useI18n";
import { cx } from "./cx";
import { useFitZoom } from "./useFitZoom";

export interface A4PreviewProps {
  /** Accessible name of the document, e.g. "Lebenslauf". */
  title: string;
  /** blob: URL of the PDF (decision D1: the API forbids framing its own URLs). */
  pdfUrl: string | null;
  downloadName?: string;
  /** The proof slug line under the sheet. */
  slug: ReactNode;
  emptyText?: string;
  busy?: boolean;
  /** Replaces the PDF on the sheet, e.g. the HTML editor; laid out on a true A4 page and zoomed. */
  children?: ReactNode;
  /** "page" fits the whole page into a desk of fixed height (the viewer); default: the width. */
  fit?: "width" | "page";
}

// Fit the page width inside the sheet; ignored by viewers that do not support it.
const PDF_VIEW_FRAGMENT = "#view=FitH";
// The placeholder lines of an empty sheet; their widths live in content.css (.pp-lines).
const BLANK_LINE_COUNT = 15;
const BLANK_LINES = Array.from({ length: BLANK_LINE_COUNT }, (_, index) => index);
const noSubscribe = () => () => {};

/** Mobile browsers mostly have no inline PDF viewer; they then get open/download (Review Focus 5). */
function useInlinePdfSupport(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => navigator.pdfViewerEnabled !== false,
    () => true,
  );
}

/** The printed proof: an A4 sheet on the desk with crop marks and a slug line. */
export function A4Preview({ fit = "width", ...props }: A4PreviewProps) {
  const inline = useInlinePdfSupport();
  const desk = useRef<HTMLDivElement>(null);
  const proof = useRef<HTMLDivElement>(null);
  const slug = useRef<HTMLDivElement>(null);
  const zoom = useFitZoom({ desk, proof, slug }, fit === "page");
  return (
    <div ref={desk} className="desk">
      <div className="proof-frame">
        <div ref={proof} className="proof">
          <Sheet {...props} inline={inline} zoom={zoom} />
        </div>
        <div ref={slug} className="proof-slug">
          {props.slug}
        </div>
      </div>
    </div>
  );
}

type PaperContentProps = Pick<
  A4PreviewProps,
  "title" | "pdfUrl" | "downloadName" | "emptyText" | "children"
> & { inline: boolean };

function Sheet({ busy, zoom, ...content }: PaperContentProps & { busy?: boolean; zoom: number }) {
  return (
    <div className={cx("paper", `zoom-${zoom}`)} aria-busy={busy || undefined}>
      <PaperContent {...content} />
      <BusyNote busy={busy ?? false} />
    </div>
  );
}

function PaperContent(props: PaperContentProps) {
  const { title, pdfUrl, downloadName, emptyText, children, inline } = props;
  // The HTML lays out on the PDF's page size and is zoomed as a whole, so it wraps like the PDF.
  if (children) return <div className="paper-page">{children}</div>;
  if (!pdfUrl) return <BlankPaper text={emptyText} />;
  const fallback = <PdfFallback pdfUrl={pdfUrl} downloadName={downloadName} />;
  if (!inline) return fallback;
  const data = `${pdfUrl}${PDF_VIEW_FRAGMENT}`;
  return (
    <object className="paper-pdf" type="application/pdf" data={data} aria-label={title}>
      {fallback}
    </object>
  );
}

/** The bare PDF (inline viewer or open/download fallback) for a viewer that has no sheet around it. */
export function PdfView(props: Pick<A4PreviewProps, "title" | "pdfUrl" | "downloadName">) {
  return <PaperContent {...props} inline={useInlinePdfSupport()} />;
}

function BlankPaper({ text }: { text?: string }) {
  return (
    <>
      <div className="pp-lines" aria-hidden="true">
        {BLANK_LINES.map((line) => (
          <i key={line} />
        ))}
      </div>
      {text ? (
        <div className="pp-blank">
          <p>{text}</p>
        </div>
      ) : null}
    </>
  );
}

function PdfFallback({ pdfUrl, downloadName }: { pdfUrl: string; downloadName?: string }) {
  const { t } = useI18n();
  return (
    <div className="pp-blank a4-fallback">
      <p>{t("preview.unsupported")}</p>
      <div className="row">
        <a className="btn btn-sm" href={pdfUrl} target="_blank" rel="noopener noreferrer">
          {t("preview.open")}
        </a>
        <a className="btn btn-sm" href={pdfUrl} download={downloadName ?? ""}>
          {t("preview.download")}
        </a>
      </div>
    </div>
  );
}

/**
 * Static cue (no animation, spec 5) that the sheet is being re-set. The status region is always
 * there, so the note is announced when it appears.
 */
function BusyNote({ busy }: { busy: boolean }) {
  const { t } = useI18n();
  return (
    <div role="status">{busy ? <div className="pp-busy">{t("preview.busy")}</div> : null}</div>
  );
}
