import { describe, expect, it } from "vitest";
import { levelKey } from "@/domain/levels";

describe("levelKey", () => {
  it("maps known values case-insensitively with synonyms", () => {
    expect(levelKey(" High ")).toBe("high");
    expect(levelKey("moderate")).toBe("medium");
    expect(levelKey("Medium")).toBe("medium");
    expect(levelKey("LOW")).toBe("low");
    expect(levelKey("Mittel")).toBe("medium");
  });

  it("is null for unknown values", () => {
    expect(levelKey("sehr kritisch")).toBeNull();
    expect(levelKey(null)).toBeNull();
    expect(levelKey(undefined)).toBeNull();
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "is null for the prototype key %s",
    (value) => {
      expect(levelKey(value)).toBeNull();
    },
  );
});
