/**
 * A refetch of a failed query without data reports "pending" again; the update count keeps the
 * error (and the retry button's busy state) on screen while the retry runs. Shared by the due card
 * and the due gate, which must agree on when the due query has failed.
 */
export function hasDueFailed(due: { errorUpdateCount: number; data: unknown }): boolean {
  return due.errorUpdateCount > 0 && due.data === undefined;
}
