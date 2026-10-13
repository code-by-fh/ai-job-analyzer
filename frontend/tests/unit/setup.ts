import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { languageStore } from "@/i18n/useI18n";
import { themeStore } from "@/theme/useTheme";

// Stores cache their value per module; reset them so every test starts from the defaults.
// jsdom reports navigator.language "en-US", so German is set explicitly.
beforeEach(() => {
  themeStore.set("system");
  languageStore.set("de");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
