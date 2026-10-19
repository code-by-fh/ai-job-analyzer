import { deepDiveFocus, type DeepDiveRun } from "@/api/companies";

export type DeepDivePhase = "idle" | "running" | "failed";

/** The stored run of the deep dive with this focus; the server keys it by the focus as sent. */
export function deepDiveRunFor(
  runs: readonly DeepDiveRun[],
  focus: string,
): DeepDiveRun | undefined {
  const sent = deepDiveFocus(focus);
  return runs.find((run) => run.focus === sent);
}

/**
 * The server's run state wins, so a running deep dive survives a reload (the sweep ends a lost run);
 * `pending` covers this tab's request until the profile is loaded again.
 */
export function deepDivePhase(run: DeepDiveRun | undefined, pending: boolean): DeepDivePhase {
  if (run?.deep_dive_running || pending) return "running";
  return run?.deep_dive_error ? "failed" : "idle";
}
