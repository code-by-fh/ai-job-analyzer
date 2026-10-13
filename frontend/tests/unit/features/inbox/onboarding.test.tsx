import { onlineManager } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/api/auth";
import { dueListPath, inboxListPath } from "@/api/jobListPaths";
import type { SetupStatus } from "@/api/setup";
import { InboxPage } from "@/features/inbox/InboxPage";
import { jsonResponse } from "../../support/fakeFetch";
import { installFakeMatchMedia } from "../../support/fakeMatchMedia";
import { HTTP_OK, inboxStubs, SETUP_DONE } from "../../support/inboxRoutes";
import { buildListItem } from "../../support/listItemFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
  useSearchParams: () => navigation.params,
  usePathname: () => "/inbox",
}));

const HTTP_SERVER_ERROR = 500;
const FIRST_RUN: SetupStatus = {
  has_source: false,
  ai_configured: false,
  profile_complete: true,
  has_jobs: false,
};
const ADMIN: CurrentUser = { id: 1, username: "fhamann", is_admin: true };
const MEMBER: CurrentUser = { ...ADMIN, is_admin: false };
const AI_MISSING = "Kein KI-Anbieter eingerichtet: Neue Stellen werden nicht bewertet.";
const OPEN_IMPORT = "Per URL importieren: eine einzelne Stelle";
const NEVER = () => new Promise<Response>(() => undefined);

/** A response the test releases later. */
function deferred() {
  let release: (response: Response) => void = () => undefined;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { response, release };
}

function open(setup: unknown, user: unknown = ADMIN) {
  const server = {
    new: [buildListItem({ title: "Senior Kotlin Engineer" })],
    below: [],
    dismissed: [],
    due: [],
  };
  return stubRoutes(inboxStubs(server, { "GET /setup-status": setup, "GET /me": user }));
}

beforeEach(() => {
  navigation.params = new URLSearchParams();
  installFakeMatchMedia(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("onboarding", () => {
  it("shows the three steps on the first run, the next one as the primary action", async () => {
    open(FIRST_RUN);
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Drei Schritte bis zur ersten Liste passender Stellen. 1 von 3 erledigt."),
    ).toBeInTheDocument();
    const source = screen.getByRole("link", { name: "Quelle hinzufügen" });
    expect(source).toHaveAttribute("href", "/sources?add=1");
    expect(source).toHaveClass("btn-primary");
    const ai = await screen.findByRole("link", { name: "KI-Anbieter einrichten" });
    expect(ai).toHaveAttribute("href", "/settings?section=ai");
    expect(ai).not.toHaveClass("btn-primary");
    expect(screen.getByText("Erledigt")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Profil öffnen" })).not.toBeInTheDocument();
  });

  it("opens the profile first while it is incomplete", async () => {
    open({ ...FIRST_RUN, profile_complete: false });
    renderWithProviders(<InboxPage />);
    const profile = await screen.findByRole("link", { name: "Profil öffnen" });
    expect(profile).toHaveAttribute("href", "/profile");
    expect(profile).toHaveClass("btn-primary");
    expect(screen.getByRole("link", { name: "Quelle hinzufügen" })).not.toHaveClass("btn-primary");
  });

  it("asks a non-admin to contact the administration", async () => {
    open(FIRST_RUN, MEMBER);
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByText("Das richtet die Administration ein. Bitte sie darum."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "KI-Anbieter einrichten" })).not.toBeInTheDocument();
  });

  it("shows the inbox with a warning when jobs exist but no AI provider", async () => {
    open({ ...SETUP_DONE, ai_configured: false });
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
    expect(await screen.findByText(AI_MISSING)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "KI-Anbieter einrichten" })).toHaveAttribute(
      "href",
      "/settings?section=ai",
    );
  });

  it("warns a non-admin without a link to the admin settings", async () => {
    open({ ...SETUP_DONE, ai_configured: false }, MEMBER);
    renderWithProviders(<InboxPage />);
    expect(await screen.findByText(AI_MISSING)).toBeInTheDocument();
    expect(
      await screen.findByText("Das richtet die Administration ein. Bitte sie darum."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "KI-Anbieter einrichten" })).not.toBeInTheDocument();
  });

  it("shows the inbox once everything is set up, with a way to the setup view", async () => {
    const calls = open(SETUP_DONE);
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ersteinrichtung ansehen" })).toHaveAttribute(
      "href",
      "/inbox?view=setup",
    );
    expect(screen.queryByText(AI_MISSING)).not.toBeInTheDocument();
    // Ruling 4: the user is only loaded where a branch needs it.
    expect(calls.some((call) => new URL(call.url).pathname === "/me")).toBe(false);
  });

  it("opens the setup view on request, with a way back", async () => {
    navigation.params = new URLSearchParams("view=setup");
    open(SETUP_DONE);
    renderWithProviders(<InboxPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 von 3 erledigt/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Zum Eingang" })).toHaveAttribute("href", "/inbox");
  });

  it("offers no way back on the first run, where there is no inbox to go to", async () => {
    open(FIRST_RUN);
    renderWithProviders(<InboxPage />);
    await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" });
    expect(screen.queryByRole("link", { name: "Zum Eingang" })).not.toBeInTheDocument();
  });

  it("shows the inbox when the setup status cannot be loaded", async () => {
    open(jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Senior Kotlin Engineer" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ersteinrichtung ansehen" })).not.toBeInTheDocument();
  });

  it("ignores ?view=setup when the setup status cannot be loaded", async () => {
    navigation.params = new URLSearchParams("view=setup");
    open(jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }));
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
  });

  it("does not hold the inbox in a skeleton while offline", async () => {
    onlineManager.setOnline(false);
    open(FIRST_RUN);
    renderWithProviders(<InboxPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
  });

  it("starts the lists with the setup status and keeps the inbox grid while waiting", async () => {
    navigation.params = new URLSearchParams("tab=unter");
    const held = deferred();
    const calls = open(() => held.response);
    const { container } = renderWithProviders(<InboxPage />);
    const requested = () => calls.map((call) => call.url);
    await waitFor(() => {
      expect(requested().some((url) => url.endsWith(inboxListPath("below", 0)))).toBe(true);
      expect(requested().some((url) => url.endsWith(dueListPath()))).toBe(true);
    });
    expect(container.querySelector(".inbox > .inbox-list")).not.toBeNull();
    expect(container.querySelector(".inbox > .inbox-detail")).not.toBeNull();
    expect(container.querySelector(".inbox-list [role='status']")).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    held.release(jsonResponse(HTTP_OK, SETUP_DONE));
    expect(await screen.findByRole("heading", { level: 1, name: "Eingang" })).toBeInTheDocument();
  });

  it("offers the import by URL when an AI provider can score the job", async () => {
    open({ ...FIRST_RUN, ai_configured: true });
    renderWithProviders(<InboxPage />);
    await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" });
    expect(screen.getByRole("button", { name: OPEN_IMPORT })).toBeInTheDocument();
  });

  it("hides the import by URL without an AI provider", async () => {
    open(FIRST_RUN);
    renderWithProviders(<InboxPage />);
    await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" });
    expect(screen.queryByRole("button", { name: OPEN_IMPORT })).not.toBeInTheDocument();
  });

  it("greets without a name while the user is not known yet", async () => {
    open(FIRST_RUN, NEVER);
    renderWithProviders(<InboxPage />);
    // The accessible name is matched exactly: no trailing comma.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Willkommen" }),
    ).toBeInTheDocument();
  });

  it("offers no way back from ?view=setup on the first run, where no inbox exists", async () => {
    navigation.params = new URLSearchParams("view=setup");
    open(FIRST_RUN);
    renderWithProviders(<InboxPage />);
    await screen.findByRole("heading", { level: 1, name: "Willkommen, fhamann" });
    expect(screen.queryByRole("link", { name: "Zum Eingang" })).not.toBeInTheDocument();
  });
});
