const DEGREES_PER_RADIAN = Math.PI / 180;

function toLinearSrgb(l: number, a: number, b: number): [number, number, number] {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** WCAG 2 relative luminance of an `oklch(L C H)` string (gamut-clipped, like browsers do for sRGB). */
export function luminance(oklch: string): number {
  const match = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(oklch);
  if (!match) throw new Error(`not an oklch colour: ${oklch}`);
  const [lightness, chroma, hue] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const radians = hue * DEGREES_PER_RADIAN;
  const [r, g, b] = toLinearSrgb(
    lightness,
    chroma * Math.cos(radians),
    chroma * Math.sin(radians),
  ).map((c) => Math.min(1, Math.max(0, c)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}
