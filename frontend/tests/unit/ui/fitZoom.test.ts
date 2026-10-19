import { describe, expect, it } from "vitest";
import { A4_PAGE_PX, DEFAULT_ZOOM_STEP, zoomStepFor } from "@/ui/useFitZoom";

const halfWidth = A4_PAGE_PX.width / 2;

describe("zoomStepFor", () => {
  it("takes the largest 5 % step whose page fits the free width", () => {
    expect(zoomStepFor({ width: halfWidth, height: null })).toBe(50);
    expect(zoomStepFor({ width: halfWidth - 1, height: null })).toBe(45);
  });

  it("also fits the free height when the page must fit whole", () => {
    const height = A4_PAGE_PX.height * 0.6;
    expect(zoomStepFor({ width: A4_PAGE_PX.width, height })).toBe(60);
  });

  it("never enlarges past 100 %", () => {
    expect(zoomStepFor({ width: A4_PAGE_PX.width * 3, height: null })).toBe(100);
  });

  it("never shrinks below 30 %, so the page stays readable on a 320 px phone", () => {
    expect(zoomStepFor({ width: 10, height: 10 })).toBe(30);
  });

  it("starts from a step that is one of the styled classes", () => {
    expect(DEFAULT_ZOOM_STEP % 5).toBe(0);
  });
});
