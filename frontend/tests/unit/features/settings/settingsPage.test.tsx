import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFICATION_SETTINGS_HREF, SETTINGS_HREF } from "@/features/shell/navigation";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { settingsStubs } from "../../support/settingsRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const nav = () => screen.getByRole("navigation", { name: "Einstellungsbereiche" });

describe("Einstellungen frame", () => {
  it("shows the masthead and opens Allgemein by default, marked current", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
    expect(await screen.findByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Allgemein" })).toHaveAttribute("aria-current", "page");
  });

  it("serves the notifications contract of the source drawer", async () => {
    const contract = new URL(NOTIFICATION_SETTINGS_HREF, "http://app");
    expect(contract.pathname).toBe(SETTINGS_HREF);
    liveNavigation.reset(contract.search);
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Benachrichtigungen" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Benachrichtigungen" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows Allgemein for an unknown section", async () => {
    liveNavigation.reset("section=passwoerter");
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
    expect(liveNavigation.replace).not.toHaveBeenCalled();
  });

  it("links every user section in order", async () => {
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    await screen.findByRole("heading", { level: 2 });
    const names = Array.from(nav().querySelectorAll("a")).map((link) => link.textContent);
    expect(names).toEqual(["Allgemein", "Benachrichtigungen", "Konto"]);
  });

  // Preflight ruling 15: next/link clicks are not routed in unit tests; push and Back are e2e.
  it("links each section by its URL", async () => {
    liveNavigation.reset("section=account");
    stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Konto" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Allgemein" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "Konto" })).toHaveAttribute(
      "href",
      "/settings?section=account",
    );
  });

  it("starts every settings query at mount, whatever section is open", async () => {
    liveNavigation.reset("section=account");
    const calls = stubRoutes(settingsStubs());
    renderWithProviders(<SettingsPage />);
    // The channel types and the user's channels come from /notifications/*; /me decides whether
    // the Administration group shows (7b D1).
    await waitFor(() => {
      const paths = calls.map((call) => new URL(call.url).pathname).sort();
      expect(paths).toEqual([
        "/me",
        "/notification-templates",
        "/notifications/channel-types",
        "/notifications/channels",
        "/platforms",
        "/settings",
      ]);
    });
  });
});
