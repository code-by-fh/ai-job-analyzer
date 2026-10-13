export interface CountBadgeProps {
  count: number;
  /** Full sentence for screen readers, e.g. "3 neue Treffer". */
  label: string;
  /** Ink-toned pill for counts that are not new matches (vermilion is reserved for those). */
  neutral?: boolean;
}

export function CountBadge({ count, label, neutral = false }: CountBadgeProps) {
  return (
    <span className={neutral ? "count-badge count-badge-neutral" : "count-badge"}>
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
