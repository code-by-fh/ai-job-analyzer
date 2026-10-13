import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { languageStore, useI18n } from "@/i18n/useI18n";
import { languageFromLocale } from "@/i18n/languages";

function InboxLabel() {
  const { t } = useI18n();
  return <span>{t("nav.inbox")}</span>;
}

describe("useI18n", () => {
  it("renders German by default", () => {
    render(<InboxLabel />);
    expect(screen.getByText("Eingang")).toBeInTheDocument();
  });

  it("switches language and updates <html lang>", () => {
    render(
      <LanguageProvider>
        <InboxLabel />
      </LanguageProvider>,
    );
    act(() => languageStore.set("en"));
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("languageFromLocale", () => {
  it("maps a regional tag to its language", () => {
    expect(languageFromLocale("en-US")).toBe("en");
  });

  it("falls back to German for unsupported or missing locales", () => {
    expect(languageFromLocale("fr-FR")).toBe("de");
    expect(languageFromLocale(undefined)).toBe("de");
  });
});
