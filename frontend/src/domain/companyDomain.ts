const PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\//i;
const WWW_PREFIX = /^www\./;
const HOST_SEPARATOR = /[/?#]/;
// Port, user info and anything else that is not part of a plain host name.
const NOT_A_HOST = /[\s@:\\]/;
// Labels of letters, digits and hyphens (punycode "xn--" labels included), at least one dot.
const HOST_NAME = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

export const MAX_DOMAIN_LENGTH = 253;

function toAscii(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/**
 * "https://www.acme.de/karriere" -> "acme.de"; "müller.de" -> "xn--mller-kva.de".
 * null when the input is not a plain host name (no port, user info, IP address or trailing dot).
 */
export function normalizeDomain(input: string): string | null {
  const withoutProtocol = input.trim().toLowerCase().replace(PROTOCOL, "");
  const host = withoutProtocol.split(HOST_SEPARATOR)[0].replace(WWW_PREFIX, "");
  if (!host || NOT_A_HOST.test(host)) return null;
  const ascii = toAscii(host);
  if (!ascii || ascii.length > MAX_DOMAIN_LENGTH) return null;
  return HOST_NAME.test(ascii) ? ascii : null;
}
