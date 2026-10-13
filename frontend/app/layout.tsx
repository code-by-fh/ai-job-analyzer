import type { Metadata } from "next";
import type { ReactNode } from "react";
import { de } from "@/i18n/de";
import { DEFAULT_LANGUAGE } from "@/i18n/languages";
import { FONT_VARIABLE_CLASSES } from "@/theme/fonts";
import { THEME_BOOT_SCRIPT } from "@/theme/themeScript";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: de["app.name"],
  description: de["app.description"],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-mode is set by the boot script before hydration, so the attribute legitimately differs.
    <html lang={DEFAULT_LANGUAGE} className={FONT_VARIABLE_CLASSES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
