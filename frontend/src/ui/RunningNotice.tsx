import { Elapsed } from "./Elapsed";
import { Notice } from "./Notice";

/** A static info line for a running task plus its elapsed time; no live region (Notice info has none). */
export function RunningNotice({ text, startedAt }: { text: string; startedAt: number | null }) {
  return (
    <Notice tone="info">
      {text} <Elapsed startedAt={startedAt} />
    </Notice>
  );
}
