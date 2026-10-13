import { useQuery } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { profileQueryOptions } from "@/api/profile";
import { SectionState } from "@/features/profile/SectionState";
import { jsonResponse } from "../../support/fakeFetch";
import { STORED_SETTINGS } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

const HTTP_SERVER_ERROR = 500;
const HTTP_OK = 200;

function ProfileRole() {
  const query = useQuery(profileQueryOptions());
  return <SectionState query={query}>{(profile) => <p>{profile.role}</p>}</SectionState>;
}

describe("SectionState", () => {
  it("shows the loading line while the first request runs", () => {
    stubRoutes({ "GET /settings": () => new Promise<Response>(() => undefined) });
    renderWithProviders(<ProfileRole />);
    const loading = screen.getByText("Lädt …").closest("[role=status]");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
  });

  it("shows the error with a retry, and the data once the retry answers", async () => {
    const answers = [
      () => jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" }),
      () => jsonResponse(HTTP_OK, STORED_SETTINGS),
    ];
    stubRoutes({ "GET /settings": () => answers.shift()!() });
    renderWithProviders(<ProfileRole />);
    await userEvent.click(await screen.findByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText(STORED_SETTINGS.role!)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
  });
});
