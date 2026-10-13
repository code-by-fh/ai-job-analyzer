import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ADMIN, adminStubs, MEMBER } from "../../support/adminRoutes";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=ai"));
afterEach(() => vi.unstubAllGlobals());

const nav = () => screen.getByRole("navigation", { name: "Einstellungsbereiche" });
const linkNames = (list: HTMLElement) =>
  within(list)
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("admin frame", () => {
  it("a member never sees an admin section", async () => {
    const calls = stubRoutes(adminStubs({ "GET /me": MEMBER }));
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/me"))).toBe(true));
    expect(within(nav()).queryByText("Administration")).toBeNull();
    expect(within(nav()).queryByRole("link", { name: "KI" })).toBeNull();
    expect(calls.filter((call) => new URL(call.url).pathname.startsWith("/admin"))).toEqual([]);
    expect(calls.filter((call) => new URL(call.url).pathname === "/users")).toEqual([]);
  });

  it("an admin sees the Administration group after Konto", async () => {
    stubRoutes(adminStubs());
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "KI" })).toBeVisible();
    const lists = within(nav()).getAllByRole("list");
    expect(lists.map(linkNames)).toEqual([
      ["Allgemein", "Benachrichtigungen", "Konto"],
      ["KI", "Benutzer", "Systemfehler"],
    ]);
    expect(within(nav()).getByRole("list", { name: "Administration" })).toBe(lists[1]);
    expect(within(nav()).getByRole("link", { name: "KI" })).toHaveAttribute("aria-current", "page");
    expect(within(nav()).getByRole("link", { name: "Systemfehler" })).toHaveAttribute(
      "href",
      "/settings?section=system",
    );
  });

  it("no Allgemein flash while /me loads for an admin URL", async () => {
    let answerMe: (response: Response) => void = () => undefined;
    const me = new Promise<Response>((resolve) => (answerMe = resolve));
    stubRoutes(adminStubs({ "GET /me": () => me }));
    renderWithProviders(<SettingsPage />);
    const busyRegions = () =>
      screen.getAllByRole("status").filter((region) => region.getAttribute("aria-busy") === "true");
    await waitFor(() => expect(busyRegions()).toHaveLength(1));
    // The settings queries have answered meanwhile; /me still has not.
    await waitFor(() => expect(screen.getByLabelText("Einstellungsbereiche")).toBeVisible());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(busyRegions()).toHaveLength(1);
    answerMe(jsonResponse(200, ADMIN));
    expect(await screen.findByRole("heading", { level: 2, name: "KI" })).toBeVisible();
  });

  it("a failed /me on an admin URL falls back to Allgemein", async () => {
    stubRoutes(adminStubs({ "GET /me": () => jsonResponse(500, { detail: "boom" }) }));
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Allgemein" })).toBeVisible();
  });
});
