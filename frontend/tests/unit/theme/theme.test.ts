import { describe, expect, it } from "vitest";
import { applyMode, isThemePreference, nextPreference, resolveMode } from "@/theme/theme";

describe("theme", () => {
  it("recognises the three preferences only", () => {
    expect(["light", "dark", "system"].every(isThemePreference)).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
  });

  it("resolves system to the OS scheme", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
  });

  it("keeps an explicit preference regardless of the OS", () => {
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });

  it("cycles light, dark, system like the prototype", () => {
    expect(nextPreference("light")).toBe("dark");
    expect(nextPreference("dark")).toBe("system");
    expect(nextPreference("system")).toBe("light");
  });

  it("writes the mode to data-mode", () => {
    applyMode(document.documentElement, "dark");
    expect(document.documentElement.dataset.mode).toBe("dark");
  });
});
