import { monogramOf } from "@/domain/monogram";

/** Company initials in a ruled square; decorative, the company name is always printed next to it. */
export function Monogram({ name }: { name?: string | null }) {
  return (
    <span className="monogram" aria-hidden="true">
      {monogramOf(name)}
    </span>
  );
}
