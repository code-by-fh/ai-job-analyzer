"use client";

import { useMemo, type RefObject, type SyntheticEvent } from "react";
import { prepareForEditing } from "./editDocument";

export interface DocumentEditorProps {
  html: string;
  title: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onEdit?: () => void;
}

/**
 * Decision D9: the stored HTML on the sheet, editable in place. The sandbox has no allow-scripts
 * (and must never get it together with allow-same-origin); allow-same-origin only lets this page
 * read the edited document. The markup is also stripped of active content before injection.
 */
export function DocumentEditor({ html, title, frameRef, onEdit }: DocumentEditorProps) {
  const srcDoc = useMemo(() => prepareForEditing(html), [html]);
  const enableEditing = (event: SyntheticEvent<HTMLIFrameElement>) => {
    const doc = event.currentTarget.contentDocument;
    if (!doc) return;
    doc.designMode = "on";
    if (onEdit) doc.addEventListener("input", onEdit);
  };
  return (
    <iframe
      ref={frameRef}
      title={title}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={enableEditing}
    />
  );
}
