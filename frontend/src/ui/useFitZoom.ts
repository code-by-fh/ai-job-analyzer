"use client";

import { useEffect, useState, type RefObject } from "react";

/** A4 at 96 dpi in CSS pixels: the HTML is always laid out on this page, as in the PDF. */
export const A4_PAGE_PX = { width: 794, height: 1123 } as const;
// The zoom steps styled in content.css (.zoom-30 ... .zoom-100).
const MIN_ZOOM_STEP = 30;
const MAX_ZOOM_STEP = 100;
const ZOOM_STEP = 5;
const PERCENT = 100;
/** Before the first measurement (server render, no ResizeObserver): about the old 460 px sheet. */
export const DEFAULT_ZOOM_STEP = 55;

/** Free space for the page itself; `height` null when only the width counts. */
export interface FreeSpace {
  width: number;
  height: number | null;
}

/** The largest zoom step (percent) at which the A4 page fits the free space. */
export function zoomStepFor({ width, height }: FreeSpace): number {
  const byWidth = width / A4_PAGE_PX.width;
  const scale = height === null ? byWidth : Math.min(byWidth, height / A4_PAGE_PX.height);
  const step = Math.floor((scale * PERCENT) / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(MAX_ZOOM_STEP, Math.max(MIN_ZOOM_STEP, step));
}

/** The measured parts of the proof: the desk, the cropped sheet around the page, the slug line. */
export interface ProofParts {
  desk: RefObject<HTMLElement | null>;
  proof: RefObject<HTMLElement | null>;
  slug: RefObject<HTMLElement | null>;
}

const px = (value: string) => Number.parseFloat(value) || 0;

function paddingOf(element: HTMLElement) {
  const style = getComputedStyle(element);
  return {
    x: px(style.paddingLeft) + px(style.paddingRight),
    y: px(style.paddingTop) + px(style.paddingBottom),
    gap: px(style.rowGap),
  };
}

interface ProofElements {
  desk: HTMLElement;
  proof: HTMLElement;
  slug: HTMLElement;
}

/** What is left for the page once desk padding, crop margin and slug line are taken off. */
function freeSpace({ desk, proof, slug }: ProofElements, fitHeight: boolean): FreeSpace {
  const [deskPad, proofPad] = [paddingOf(desk), paddingOf(proof)];
  const width = desk.clientWidth - deskPad.x - proofPad.x;
  const used = deskPad.y + deskPad.gap + proofPad.y + slug.offsetHeight;
  return { width, height: fitHeight ? desk.clientHeight - used : null };
}

/**
 * Zoom step for the page, re-measured whenever the desk resizes (a notice strip appearing, a
 * rotated phone). `fitHeight` fits the whole page into the desk, which then needs a fixed height.
 */
export function useFitZoom(parts: ProofParts, fitHeight: boolean): number {
  const [step, setStep] = useState(DEFAULT_ZOOM_STEP);
  const { desk, proof, slug } = parts;
  useEffect(() => {
    const elements = { desk: desk.current, proof: proof.current, slug: slug.current };
    if (!elements.desk || !elements.proof || !elements.slug) return;
    if (typeof ResizeObserver === "undefined") return;
    const measured = elements as ProofElements;
    const measure = () => setStep(zoomStepFor(freeSpace(measured, fitHeight)));
    const observer = new ResizeObserver(measure);
    observer.observe(measured.desk);
    observer.observe(measured.slug);
    return () => observer.disconnect();
  }, [desk, proof, slug, fitHeight]);
  return step;
}
