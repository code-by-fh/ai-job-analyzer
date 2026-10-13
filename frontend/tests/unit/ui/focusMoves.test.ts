import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = "src";
const FRAME_CALL = "requestAnimationFrame(";

/** Every .ts/.tsx file below src that schedules a frame itself, with "/" separators. */
function filesCallingFrame(): string[] {
  // Recursive, so modules in subfolders are read too.
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => readFileSync(join(SRC_DIR, name), "utf8").includes(FRAME_CALL))
    .map((name) => name.split(sep).join("/"))
    .sort();
}

describe("focus moves", () => {
  it("go through ui/focus.ts, the only module that calls requestAnimationFrame", () => {
    expect(filesCallingFrame()).toEqual(["ui/focus.ts"]);
  });
});
