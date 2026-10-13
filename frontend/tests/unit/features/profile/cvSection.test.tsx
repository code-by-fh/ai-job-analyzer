import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROFILE_LIMITS } from "@/api/profilePaths";
import { AnnouncerContext, createAnnouncer } from "@/features/profile/announcer";
import { CvSection } from "@/features/profile/cv/CvSection";
import { ProfilePage } from "@/features/profile/ProfilePage";
import { jsonResponse } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { PROFILE, STORED_SETTINGS, profileStubs } from "../../support/profileRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/profile"),
);

beforeEach(() => liveNavigation.reset("section=lebenslauf"));
afterEach(() => vi.unstubAllGlobals());

const STORED_ENTRY = PROFILE.cv_data!.experience![0]!;
const thin = {
  ...STORED_SETTINGS,
  cv_data: { experience: [{ ...STORED_ENTRY, description: "" }], projects: [], education: "" },
};
const LEGACY_PROJECT = {
  name: "Outbox",
  tech_stack: "x".repeat(PROFILE_LIMITS.entryTitle + 1),
  description: "Transaktionale Outbox.",
};
const TECH_REFUSED = {
  detail: [
    {
      type: "string_too_long",
      loc: ["body", "cv_data", "projects", 0, "tech_stack"],
      msg: "String should have at most 200 characters",
    },
  ],
};

const saveButton = () => screen.getByRole("button", { name: "Speichern" });
const addButtons = async () => [
  await screen.findByRole("button", { name: "Erfahrung hinzufügen" }),
  screen.getByRole("button", { name: "Projekt hinzufügen" }),
];
const refusedAt = (...loc: (string | number)[]) => ({
  detail: [{ type: "value_error", loc: ["body", "cv_data", ...loc], msg: "refused" }],
});
const experiences = (count: number) =>
  Array.from({ length: count }, (_v, i) => ({
    company: `Firma ${i}`,
    role: "Dev",
    duration: "",
    description: "x",
  }));
const sentBody = (calls: { method: string; body?: string | null }[]) =>
  JSON.parse(calls.find((call) => call.method === "POST")!.body!);

describe("Lebenslauf", () => {
  it("adds an entry in edit view, focuses its first field and saves only cv_data", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    const add = await addButtons();
    await userEvent.click(add[0]!);
    expect(screen.getByLabelText("Rolle")).toHaveFocus();
    await userEvent.type(screen.getByLabelText("Rolle"), "Architekt");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    const body = sentBody(calls);
    expect(Object.keys(body)).toEqual(["cv_data"]);
    expect(body.cv_data.experience).toHaveLength(2);
  });

  it("does not count a blank new entry as unsaved", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    const add = await addButtons();
    await userEvent.click(add[0]!);
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("drops an entry of only spaces on save and keeps a partly filled one", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    const [addExperience, addProject] = await addButtons();
    await userEvent.click(addExperience!);
    await userEvent.type(screen.getByLabelText("Rolle"), "   ");
    await userEvent.click(addProject!);
    await userEvent.type(screen.getByLabelText("Technologien"), " Rust ");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    const { cv_data } = sentBody(calls);
    expect(cv_data.experience).toEqual([STORED_ENTRY]);
    expect(cv_data.projects).toEqual([{ name: "", tech_stack: "Rust", description: "" }]);
  });

  it("is clean again after a save", async () => {
    stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ausbildung"), ", MSc");
    expect(saveButton()).not.toHaveAttribute("aria-disabled");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    expect(saveButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps a year stored as a number as text when saving", async () => {
    const legacy = {
      ...STORED_SETTINGS,
      cv_data: { ...thin.cv_data, experience: [{ ...STORED_ENTRY, duration: 2019 }] },
    };
    const calls = stubRoutes(
      profileStubs({ "GET /settings": legacy, "POST /settings": { status: "saved" } }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ausbildung"), "BSc");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    expect(sentBody(calls).cv_data.experience[0].duration).toBe("2019");
  });

  it("removing an entry moves focus to its list's add button", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Dev bearbeiten" }));
    await userEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    expect(screen.queryByRole("button", { name: "Dev bearbeiten" })).toBeNull();
    expect(screen.getByRole("button", { name: "Erfahrung hinzufügen" })).toHaveFocus();
  });

  it("Fertig closes the editor and gives focus back to the entry's edit button", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Dev bearbeiten" }));
    expect(screen.getByLabelText("Rolle")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(screen.getByRole("button", { name: "Dev bearbeiten" })).toHaveFocus();
  });

  it("names what is missing, from the stored profile, in amber", async () => {
    stubRoutes(profileStubs({ "GET /settings": thin }));
    renderWithProviders(<ProfilePage />);
    const hint = await screen.findByText(
      /Noch unvollständig: Ergebnisse in der Berufserfahrung und Ausbildung\./,
    );
    expect(hint).toBeVisible();
    expect(hint.closest(".notice")).toHaveClass("notice-warn");
  });

  it("links to Ziel when the role or skills are missing", async () => {
    stubRoutes(profileStubs({ "GET /settings": { ...STORED_SETTINGS, skills: "" } }));
    renderWithProviders(<ProfilePage />);
    await screen.findByText(/Noch unvollständig: Kenntnisse\./);
    expect(screen.getByRole("link", { name: "Unter Ziel ergänzen" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("shows no hint for a complete profile", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    await screen.findByRole("heading", { level: 4, name: "Berufserfahrung" });
    expect(screen.queryByText(/Noch unvollständig/)).toBeNull();
  });

  it("offers no add button past 30 entries", async () => {
    const full = {
      ...STORED_SETTINGS,
      cv_data: {
        experience: experiences(PROFILE_LIMITS.cvEntries),
        projects: [],
        education: "BSc",
      },
    };
    stubRoutes(profileStubs({ "GET /settings": full }));
    renderWithProviders(<ProfilePage />);
    const [add] = await addButtons();
    expect(add).toHaveAttribute("aria-disabled", "true");
  });

  it("marks a legacy value over the limit on its field, without a toast or server text", async () => {
    const legacy = {
      ...STORED_SETTINGS,
      cv_data: { ...PROFILE.cv_data, projects: [LEGACY_PROJECT] },
    };
    stubRoutes(
      profileStubs({
        "GET /settings": legacy,
        "POST /settings": () => jsonResponse(422, TECH_REFUSED),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ausbildung"), ", MSc");
    await userEvent.click(saveButton());
    expect(await screen.findByText(/Nicht gespeichert/)).toBeVisible();
    expect(screen.getByText("Ein Feld ist zu lang. Zum Kürzen bearbeiten.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Outbox bearbeiten" }));
    const tech = screen.getByLabelText("Technologien");
    expect(tech).toHaveAttribute("aria-invalid", "true");
    expect(tech).toHaveAccessibleDescription("Dieser Text ist zu lang. Bitte kürzen.");
    expect(screen.queryByText("Die Eingabe ist ungültig.")).toBeNull();
    expect(screen.queryByText(/String should have/)).toBeNull();
  });

  it("names each list's add button after what it adds", async () => {
    stubRoutes(profileStubs());
    renderWithProviders(<ProfilePage />);
    const [addExperience, addProject] = await addButtons();
    expect(addExperience).toHaveTextContent("Erfahrung hinzufügen");
    expect(addProject).toHaveTextContent("Projekt hinzufügen");
  });

  it("reads a title of only spaces as untitled", async () => {
    const blankTitle = { company: " ", role: "   ", duration: "2019", description: "APIs" };
    const legacy = {
      ...STORED_SETTINGS,
      cv_data: { ...PROFILE.cv_data, experience: [blankTitle] },
    };
    stubRoutes(profileStubs({ "GET /settings": legacy }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByRole("button", { name: "Ohne Titel bearbeiten" })).toBeVisible();
    expect(screen.getByText("Ohne Titel")).toBeVisible();
  });

  it("uses the employer as the title when the role is only spaces", async () => {
    const legacy = {
      ...STORED_SETTINGS,
      cv_data: { ...PROFILE.cv_data, experience: [{ ...STORED_ENTRY, role: "  " }] },
    };
    stubRoutes(profileStubs({ "GET /settings": legacy }));
    renderWithProviders(<ProfilePage />);
    expect(await screen.findByRole("button", { name: "Acme bearbeiten" })).toBeVisible();
  });

  it("closes the editors when a save drops blank entries, and focus stays on the page", async () => {
    const calls = stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ausbildung"), ", MSc");
    const [, addProject] = await addButtons();
    await userEvent.click(addProject!);
    await userEvent.type(screen.getByLabelText("Name"), "  {Enter}");
    await screen.findByText("Gespeichert.");
    expect(sentBody(calls).cv_data.projects).toEqual([]);
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("heading", { level: 4, name: "Berufserfahrung" })).toHaveFocus();
  });

  it("keeps an open editor when the save drops nothing", async () => {
    stubRoutes(profileStubs({ "POST /settings": { status: "saved" } }));
    renderWithProviders(<ProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Dev bearbeiten" }));
    await userEvent.type(screen.getByLabelText("Rolle"), "-Lead");
    await userEvent.click(saveButton());
    await screen.findByText("Gespeichert.");
    expect(screen.getByLabelText("Rolle")).toBeVisible();
  });

  it("explains a list over 30 entries apart from a text that is too long", async () => {
    const legacy = {
      ...STORED_SETTINGS,
      cv_data: {
        experience: experiences(PROFILE_LIMITS.cvEntries + 1),
        projects: [],
        education: "",
      },
    };
    stubRoutes(
      profileStubs({
        "GET /settings": legacy,
        "POST /settings": () => jsonResponse(422, refusedAt("experience")),
      }),
    );
    renderWithProviders(<ProfilePage />);
    await userEvent.type(await screen.findByLabelText("Ausbildung"), "BSc");
    await userEvent.click(saveButton());
    expect(
      await screen.findByText(
        "Nicht gespeichert: Eine Liste hat mehr als 30 Einträge. Bitte entferne einige.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Höchstens 30 Einträge.", { selector: ".field-error span" }),
    ).toBeVisible();
    expect(screen.queryByText(/zu lang/)).toBeNull();
  });

  it("marks the education refused as too long", async () => {
    stubRoutes(profileStubs({ "POST /settings": () => jsonResponse(422, refusedAt("education")) }));
    renderWithProviders(<ProfilePage />);
    const education = await screen.findByLabelText("Ausbildung");
    await userEvent.type(education, ", MSc");
    await userEvent.click(saveButton());
    expect(
      await screen.findByText("Nicht gespeichert: Einige Angaben sind zu lang. Bitte kürze sie."),
    ).toBeVisible();
    expect(education).toHaveAttribute("aria-invalid", "true");
    expect(education).toHaveAccessibleDescription("Dieser Text ist zu lang. Bitte kürzen.");
  });

  it("names missing results only when experience is the gap", async () => {
    stubRoutes(profileStubs({ "GET /settings": thin }));
    renderWithProviders(<ProfilePage />);
    expect(
      await screen.findByText(/Ein Lebenslauf ohne Ergebnisse führt zu schwächeren Bewertungen\./),
    ).toBeVisible();
  });

  it("uses a neutral sentence when only the education is missing", async () => {
    const noEducation = { ...STORED_SETTINGS, cv_data: { ...PROFILE.cv_data, education: "" } };
    stubRoutes(profileStubs({ "GET /settings": noEducation }));
    renderWithProviders(<ProfilePage />);
    const hint = await screen.findByText(/Noch unvollständig: Ausbildung\./);
    expect(hint).toHaveTextContent(
      "Je vollständiger dein Lebenslauf, desto genauer bewertet die KI jede Stelle.",
    );
    expect(screen.queryByText(/ohne Ergebnisse/)).toBeNull();
  });

  it("reports unsaved edits to the leave guard and clears them on unmount", async () => {
    stubRoutes(profileStubs());
    const report = vi.fn();
    // The section announces the CV import through the page's region (D13).
    const { unmount } = renderWithProviders(
      <AnnouncerContext value={createAnnouncer()}>
        <CvSection report={report} />
      </AnnouncerContext>,
    );
    await userEvent.type(await screen.findByLabelText("Ausbildung"), "x");
    expect(report).toHaveBeenLastCalledWith("lebenslauf", true);
    unmount();
    expect(report).toHaveBeenLastCalledWith("lebenslauf", false);
  });
});
