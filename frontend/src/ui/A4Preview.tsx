"use client";

import { Maximize2 } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/useI18n";
import { Button } from "./Button";
import { ModalLayer } from "./ModalLayer";
import { PanelHeader } from "./PanelHeader";

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
  /** Replaces the PDF on the sheet, e.g. the HTML editor. */
  children?: ReactNode;
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
export function A4Preview(props: A4PreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const inline = useInlinePdfSupport();
  const canExpand = props.pdfUrl !== null && !props.children && inline;
  return (
    <div className="desk">
      <Sheet {...props} inline={inline} />
      <div className="proof-slug">{props.slug}</div>
      {canExpand ? <ExpandButton onOpen={() => setExpanded(true)} /> : null}
      {expanded && props.pdfUrl ? (
        <FullPreview
          title={props.title}
          pdfUrl={props.pdfUrl}
          downloadName={props.downloadName}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </div>
  );
}

type PaperContentProps = Pick<
  A4PreviewProps,
  "title" | "pdfUrl" | "downloadName" | "emptyText" | "children"
> & { inline: boolean };

function Sheet(props: PaperContentProps & { busy?: boolean }) {
  return (
    <div className="proof">
      <div className="paper" aria-busy={props.busy || undefined}>
        <PaperContent {...props} />
        <BusyNote busy={props.busy ?? false} />
      </div>
    </div>
  );
}

function PaperContent(props: PaperContentProps) {
  const { title, pdfUrl, downloadName, emptyText, children, inline } = props;
  if (children) return children;
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

function ExpandButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <Button size="sm" variant="ghost" className="a4-expand" icon={Maximize2} onClick={onOpen}>
      {t("preview.expand")}
    </Button>
  );
}

interface FullPreviewProps {
  title: string;
  pdfUrl: string;
  downloadName?: string;
  onClose: () => void;
}

function FullPreview({ title, pdfUrl, downloadName, onClose }: FullPreviewProps) {
  return createPortal(
    <ModalLayer className="a4-full anim-pop" label={title} onClose={onClose}>
      <PanelHeader title={title} onClose={onClose} />
      <div className="a4-full-body">
        <PaperContent title={title} pdfUrl={pdfUrl} downloadName={downloadName} inline />
      </div>
    </ModalLayer>,
    document.body,
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
