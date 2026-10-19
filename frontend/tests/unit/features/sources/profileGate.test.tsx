import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { sourcesStubs } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const HTTP_CONFLICT = 409;
const SETUP = { has_source: true, ai_configured: true, has_jobs: false };
const NO_PROFILE = { ...SETUP, profile_complete: false };
const WITH_PROFILE = { ...SETUP, profile_complete: true };

const addButton = () => screen.findByRole("button", { name: "Quelle hinzufügen" });
const startButton = () => screen.findByRole("button", { name: "StepStone jetzt durchsuchen" });
const crawlPosts = (calls: readonly RecordedCall[]) =>
  calls.filter((call) => call.method === "POST" && call.url.endsWith("/platforms/1/crawl"));

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

describe("Quellen without a maintained profile", () => {
  it("disables adding and searching, says why and links to the profile", async () => {
    const calls = sourcesStubs(undefined, { "GET /setup-status": NO_PROFILE });
    renderWithProviders(<SourcesPage />);
    const notice = await screen.findByText(/Quellen brauchen ein gepflegtes Profil/);
    expect(screen.getByRole("link", { name: "Profil öffnen" })).toHaveAttribute("href", "/profile");
    expect(await addButton()).toHaveAttribute("aria-disabled", "true");
    expect(await addButton()).toHaveAccessibleDescription(notice.textContent ?? "");
    const start = await startButton();
    expect(start).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(start);
    expect(crawlPosts(calls)).toHaveLength(0);
  });

  it("does not open the wizard from ?add=1 and drops the parameter", async () => {
    liveNavigation.reset("add=1");
    sourcesStubs(undefined, { "GET /setup-status": NO_PROFILE });
    renderWithProviders(<SourcesPage />);
    await screen.findByText(/Quellen brauchen ein gepflegtes Profil/);
    await waitFor(() =>
      expect(liveNavigation.replace).toHaveBeenCalledWith("/sources", expect.anything()),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the wizard from ?add=1 once the profile is complete", async () => {
    liveNavigation.reset("add=1");
    sourcesStubs(undefined, { "GET /setup-status": WITH_PROFILE });
    renderWithProviders(<SourcesPage />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(liveNavigation.replace).not.toHaveBeenCalled();
  });

  it("leaves everything enabled once the profile is complete", async () => {
    sourcesStubs(undefined, { "GET /setup-status": WITH_PROFILE });
    renderWithProviders(<SourcesPage />);
    expect(await addButton()).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/Quellen brauchen ein gepflegtes Profil/)).not.toBeInTheDocument();
  });

  it("maps the server's profile_required refusal of a crawl to a fixed message", async () => {
    sourcesStubs(undefined, {
      "GET /setup-status": WITH_PROFILE,
      "POST /platforms/1/crawl": () => jsonResponse(HTTP_CONFLICT, { detail: "profile_required" }),
    });
    renderWithProviders(<SourcesPage />);
    await userEvent.click(await startButton());
    expect(await screen.findByText(/Pflege zuerst dein Profil/)).toBeInTheDocument();
    expect(screen.queryByText("StepStone wird schon durchsucht.")).not.toBeInTheDocument();
  });
});
