// RFC 6266: filename*=UTF-8''<percent-encoded> wins over the plain (possibly quoted) filename.
const EXTENDED_FILENAME = /filename\*\s*=\s*UTF-8''([^;]+)/i;
const PLAIN_FILENAME = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i;

/** The download name a Content-Disposition header suggests; null when it names none. */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  return extendedFilename(header) ?? plainFilename(header);
}

function extendedFilename(header: string): string | null {
  const encoded = EXTENDED_FILENAME.exec(header)?.[1]?.trim();
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    // Malformed percent-encoding: fall back to the plain filename.
    return null;
  }
}

function plainFilename(header: string): string | null {
  const match = PLAIN_FILENAME.exec(header);
  const name = (match?.[1] ?? match?.[2])?.trim();
  return name ? name : null;
}
