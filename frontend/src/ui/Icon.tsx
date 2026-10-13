import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

// Spec 2.3: lucide-react at stroke 1.75; size comes from .ico / .ico-lg in controls.css.
const ICON_STROKE_WIDTH = 1.75;

export interface IconProps {
  icon: LucideIcon;
  size?: "md" | "lg";
  className?: string;
}

/** Decorative icon; the surrounding control carries the accessible name. */
export function Icon({ icon: Glyph, size = "md", className }: IconProps) {
  return (
    <Glyph
      aria-hidden="true"
      focusable="false"
      strokeWidth={ICON_STROKE_WIDTH}
      className={cx("ico", size === "lg" && "ico-lg", className)}
    />
  );
}
