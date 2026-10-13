import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "@/theme/theme";
import { useApplyThemeMode, useTheme } from "@/theme/useTheme";
import { installFakeMatchMedia } from "../support/fakeMatchMedia";

describe("useApplyThemeMode", () => {
  it("uses the OS scheme for the system preference", () => {
    installFakeMatchMedia(true);
    renderHook(() => useApplyThemeMode("system"));
    expect(document.documentElement.dataset.mode).toBe("dark");
  });

  it("follows an OS switch at runtime while the preference is system", () => {
    const media = installFakeMatchMedia(true);
    renderHook(() => useApplyThemeMode("system"));
    act(() => media.setMatches(false));
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("ignores the OS scheme for an explicit preference", () => {
    installFakeMatchMedia(true);
    renderHook(() => useApplyThemeMode("light"));
    expect(document.documentElement.dataset.mode).toBe("light");
  });
});

describe("useTheme", () => {
  it("cycles and persists the preference", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.cycle());
    expect(result.current.preference).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
