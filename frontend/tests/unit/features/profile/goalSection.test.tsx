import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { GoalSection } from "@/features/profile/goal/GoalSection";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { PROFILE, profileStubs } from "../../support/profileRoutes";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset());
afterEach(() => vi.unstubAllGlobals());

const GOAL_KEYS = ["location", "min_salary", "preferences", "role", "skills", "spoken_languages"];
const saveButton = () => screen.getByRole("button", { name: "Speichern" });

describe("Ziel", () => {
  it("keeps Speichern inactive until something changes", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await screen.findByLabelText("Wunschrolle");
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("Speichern sends only the goal fields, skills joined, and toasts", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Kenntnisse"), "Go{Enter}");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    const post = calls.find((call) => call.method === "POST")!;
    const body = JSON.parse(post.body!);
    expect(Object.keys(body).sort()).toEqual(GOAL_KEYS);
    expect(body.skills).toBe("Kotlin, Java, Go");
    expect(post.body).not.toContain("__masked__");
  });

  it("a save makes every template preview stale, since a preview shows the stored profile", async () => {
    stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    const queryClient = createTestQueryClient();
    const previewKey = queryKeys.templatePreview("CV", "classic");
    queryClient.setQueryData(previewKey, "<p>Alt</p>");
    renderWithProviders(<ProfilePage />, queryClient);
    await userEvent.type(await screen.findByLabelText("Kenntnisse"), "Go{Enter}");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    expect(queryClient.getQueryState(previewKey)?.isInvalidated).toBe(true);
  });

  it("does not let a background refetch overwrite a draft", async () => {
    stubRoutes(profileStubs());
    const { queryClient } = renderWithProviders(<ProfilePage />);
    const role = await screen.findByLabelText("Wunschrolle");
    await userEvent.clear(role);
    await userEvent.type(role, "Architekt");
    queryClient.setQueryData(queryKeys.profile, {
      ...PROFILE,
      spoken_languages: [],
      role: "Anders",
    });
    await waitFor(() => expect(role).toHaveValue("Architekt"));
  });

  it("shows a 422 on its field with the app's sentence, never the server's", async () => {
    const refused = {
      detail: [
        {
          type: "string_too_long",
          loc: ["body", "preferences"],
          msg: "String should have at most 5000 characters",
        },
      ],
    };
    stubRoutes(profileStubs({ "POST /settings": () => jsonResponse(422, refused) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ort"), " Nord");
    await userEvent.click(saveButton());
    expect(await screen.findByText("Dieser Text ist zu lang. Bitte kürzen.")).toBeVisible();
    const preferences = screen.getByLabelText("Präferenzen");
    expect(preferences).toHaveAttribute("aria-invalid", "true");
    expect(preferences).toHaveAccessibleDescription(
      expect.stringContaining("Dieser Text ist zu lang. Bitte kürzen."),
    );
    expect(screen.queryByText(/String should have/)).toBeNull();
  });

  it("toasts a refusal of a field Ziel does not show", async () => {
    const refused = { detail: [{ type: "value_error", loc: ["body", "cv_data"], msg: "bad" }] };
    stubRoutes(profileStubs({ "POST /settings": () => jsonResponse(422, refused) }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ort"), " Nord");
    await userEvent.click(saveButton());
    expect(await screen.findByText("Die Eingabe ist ungültig.")).toBeVisible();
    expect(screen.queryByText("bad")).toBeNull();
  });

  it("makes Speichern inactive again after a save", async () => {
    stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ort"), " Nord");
    expect(saveButton()).not.toHaveAttribute("aria-disabled");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("reports unsaved edits to the leave guard and clears them on unmount", async () => {
    stubRoutes(profileStubs());
    const report = vi.fn();
    const { unmount } = renderWithProviders(<GoalSection report={report} />);
    await userEvent.type(await screen.findByLabelText("Ort"), "x");
    expect(report).toHaveBeenLastCalledWith("ziel", true);
    unmount();
    expect(report).toHaveBeenLastCalledWith("ziel", false);
  });

  // Preflight ruling 12: moved here unchanged from Task 6, since Ziel is the first section to read the profile.
  it("shows the error with a retry when the profile cannot be loaded", async () => {
    stubRoutes(profileStubs({ "GET /settings": () => jsonResponse(500, { detail: "boom" }) }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    expect(screen.queryByText("boom")).toBeNull();
  });
});
