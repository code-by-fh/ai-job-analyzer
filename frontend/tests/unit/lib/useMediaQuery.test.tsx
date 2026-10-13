import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { installFakeMatchMedia } from "../support/fakeMatchMedia";

describe("useMediaQuery", () => {
  it("follows the media query", () => {
    const media = installFakeMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1200px)"));
    expect(result.current).toBe(false);
    act(() => media.setMatches(true));
    expect(result.current).toBe(true);
  });
});
