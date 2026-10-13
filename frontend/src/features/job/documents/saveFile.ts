import type { ErrorMessageOverrides } from "@/api/describeError";
import type { DownloadedFile } from "@/api/files";

const REVOKE_DELAY_MS = 250;

/** Google Drive files answer 400 on view/download (backend gap G12). */
export const DRIVE_UNSUPPORTED: ErrorMessageOverrides = { BAD_REQUEST: "files.driveUnsupported" };

/** Hands a fetched file to the browser's download; the bytes came through apiFetch (cookies, refresh). */
export function saveFile(file: DownloadedFile, fallbackName: string): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename ?? fallbackName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
