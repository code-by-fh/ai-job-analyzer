/** App route of a job page (not the API path of the same resource). */
export function jobRoute(id: string): string {
  return `/jobs/${encodeURIComponent(id)}`;
}
