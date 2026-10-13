import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { liveNavigation } from "../../support/liveNavigation";
import { profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

// Preflight ruling 12: "shows the error with a retry when the profile cannot be loaded" lives in
// goalSection.test.tsx, since Ziel is the first section that reads the profile.
describe("ProfilePage", () => {
  it("shows the masthead, the sub-nav in spec order and Ziel by default", () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Profil" })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Profilbereiche" });
    const links = Array.from(nav.querySelectorAll("a")).map((link) => link.textContent);
    expect(links).toEqual(["Ziel", "Lebenslauf", "Nachweise", "Vorlagen"]);
    expect(screen.getByRole("link", { name: "Ziel" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 2, name: "Ziel" })).toBeVisible();
  });

  it("opens the section named in the URL and links the others", () => {
    liveNavigation.reset("section=vorlagen");
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    expect(screen.getByRole("heading", { level: 2, name: "Vorlagen" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Lebenslauf" })).toHaveAttribute(
      "href",
      "/profile?section=lebenslauf",
    );
  });

  it("starts every profile query at mount, whatever section is open", async () => {
    const calls = stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await waitFor(() => {
      const paths = calls.map((call) => new URL(call.url).pathname);
      expect(paths).toEqual(
        expect.arrayContaining([
          "/settings",
          "/profile/documents",
          "/document-templates",
          "/profile/templates",
          "/setup-status",
        ]),
      );
    });
  });

  it("has exactly one persistent live region", () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    // getAll on purpose: the toast region and the loading line are status regions too; the page
    // itself adds exactly one, the visually hidden one.
    const pageRegions = screen
      .getAllByRole("status")
      .filter((region) => region.classList.contains("sr-only"));
    expect(pageRegions).toHaveLength(1);
  });
});
