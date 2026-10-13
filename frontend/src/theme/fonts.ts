import localFont from "next/font/local";

// The woff2 files come from the pinned @fontsource packages, so they are versioned by
// pnpm-lock.yaml instead of being committed. Same files and axes as the prototype.
const displayFont = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
  display: "swap",
});

const uiFont = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../../node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-600-normal.woff2",
      weight: "600",
    },
  ],
  variable: "--font-hanken",
  display: "swap",
});

// Only the A4 document previews use the serif, so it is not preloaded on every page.
const serifFont = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2",
      weight: "600",
    },
  ],
  variable: "--font-source-serif",
  display: "swap",
  preload: false,
});

/** Class names that define --font-bricolage, --font-hanken and --font-source-serif on <html>. */
export const FONT_VARIABLE_CLASSES = [
  displayFont.variable,
  uiFont.variable,
  serifFont.variable,
].join(" ");
