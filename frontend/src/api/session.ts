export const LOGIN_PATH = "/login";
export const DEFAULT_AFTER_LOGIN_PATH = "/inbox";
const NEXT_PARAM = "next";

/** /login?next=<current path and query>, so the user returns to where the session ended. */
export function loginRedirectUrl(currentPath: string): string {
  return `${LOGIN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: currentPath })}`;
}

// Only used to resolve a relative path; any origin change after parsing means the input was not one.
const PARSE_ORIGIN = "http://same-origin.invalid";
// Browsers strip tabs and newlines inside URLs, so "/\t/evil.example" would become "//evil.example".
const UNSAFE_CHARACTERS = /[\u0000-\u001f\\]/;

/** Accepts only same-origin absolute paths, so ?next= cannot send the user to another site. */
export function safeNextPath(raw: string | null): string {
  if (!raw?.startsWith("/") || UNSAFE_CHARACTERS.test(raw)) return DEFAULT_AFTER_LOGIN_PATH;
  const url = new URL(raw, PARSE_ORIGIN);
  if (url.origin !== PARSE_ORIGIN || isLoginPath(url.pathname)) return DEFAULT_AFTER_LOGIN_PATH;
  return url.pathname + url.search + url.hash;
}

function isLoginPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
}

/** Full navigation (not router.push) so every cached query of the lost session is discarded. */
export function redirectToLogin(): void {
  const { pathname, search } = window.location;
  if (pathname === LOGIN_PATH) return;
  window.location.assign(loginRedirectUrl(pathname + search));
}
