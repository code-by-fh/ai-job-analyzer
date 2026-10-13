"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { documentVersion, viewJobDocument, type JobDocument } from "@/api/jobDocuments";
import { queryKeys } from "@/api/queryKeys";

// Unused PDF bytes leave memory after a minute; the key changes with every new version anyway.
const FILE_GC_MS = 60_000;
const PDF_TYPE = "application/pdf";

/** The server answers /view with the stored mime type or octet-stream; sniffing browsers then refuse inline PDFs. */
async function viewPdf(jobId: string, document: JobDocument): Promise<Blob> {
  const file = await viewJobDocument(jobId, document.id);
  return new Blob([file.blob], { type: document.mime_type || PDF_TYPE });
}

export function useDocumentFile(jobId: string, document?: JobDocument) {
  return useQuery({
    queryKey: document
      ? queryKeys.jobFile(jobId, document.id, documentVersion(document))
      : queryKeys.jobFiles(jobId),
    queryFn: document ? () => viewPdf(jobId, document) : skipToken,
    staleTime: Infinity,
    gcTime: FILE_GC_MS,
  });
}

interface UrlStore {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => string | null;
  set: (blob?: Blob) => void;
}

function createUrlStore(): UrlStore {
  let url: string | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => url,
    set: (blob) => {
      if (url) URL.revokeObjectURL(url);
      url = blob ? URL.createObjectURL(blob) : null;
      listeners.forEach((listener) => listener());
    },
  };
}

const NO_URL = () => null;

/**
 * One object URL per blob, revoked when the blob changes or the view goes away (decision D1).
 * The URL is created in an effect, never during render: React may discard or repeat renders
 * (StrictMode), which would leak URLs that no cleanup ever sees.
 */
export function useObjectUrl(blob?: Blob): string | null {
  const [store] = useState(createUrlStore);
  useEffect(() => {
    store.set(blob);
    return () => store.set(undefined);
  }, [store, blob]);
  return useSyncExternalStore(store.subscribe, store.snapshot, NO_URL);
}
