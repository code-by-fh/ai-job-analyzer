"use client";

import type { ReactNode } from "react";
import { useApplyThemeMode, useTheme } from "./useTheme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preference } = useTheme();
  useApplyThemeMode(preference);
  return children;
}
