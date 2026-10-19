import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DeepDiveRun } from "@/api/companies";
import { CompanyTab } from "@/features/job/company/CompanyTab";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const PROFILE = {
  domain: "acme.de",
  name: "ACME GmbH",
  executive_summary: {
    assessment: "Solider Mittelständler.",
    confidence: "Moderate",
    suitable_for: ["Backend"],
    not_suitable_for: [],
  },
  analysis: [{ area: "Kultur", assessment: "Offen und direkt.", confidence: "Low" }],
  key_insights: null,
  risks: [
    { title: "Fluktuation", probability: "Medium", impact: "High", description: "Viele Wechsel." },
  ],
  market_comparison: null,
  deep_dive_buttons: [
    {
      title: "Gehalt",
      focus: "Gehaltsband",
      how_to_proceed: "Portale",
      why_it_matters: "Verhandlung",
    },
  ],
  online_resources: ["https://acme.de/karriere", "javascript:alert(1)"],
  analyzed_at: "2026-10-07T10:00:00Z",
};
const RUN: DeepDiveRun = {
  focus: "Gehaltsband",
  deep_dive_running: false,
  deep_dive_started_at: null,
  deep_dive_error: null,
  deep_dive_result: null,
};
const STARTED_AT = "2026-10-16T09:30:00+00:00";
const DEEP_DIVE_RUNNING =
  "Die Tiefenrecherche läuft. Das kann bis zu einer Minute dauern, du kannst weiterarbeiten.";
const DEEP_DIVE_FAILED = "Die Tiefenrecherche ist fehlgeschlagen. Bitte versuche es erneut.";
const withRuns = (...runs: Partial<DeepDiveRun>[]) => ({
  ...PROFILE,
  deep_dive_runs: runs.map((run) => ({ ...RUN, ...run })),
});
const notFound = () => jsonResponse(404, { detail: "Company profile not found" });
const RESEARCH = "POST /jobs/job-1/company-research";
const QUEUED = (domain: string | null) => ({ status: "queued", domain });
const researchBodies = (calls: RecordedCall[]) => bodies(calls, "/company-research");
const bodies = (calls: RecordedCall[], suffix: string) =>
  calls
    .filter((call) => call.method !== "GET" && call.url.endsWith(suffix))
    .map((call) => JSON.parse(call.body ?? "null"));

describe("CompanyTab", () => {
  it("asks for the company's web address once and starts the research with it", async () => {
    const calls = stubRoutes({ [RESEARCH]: QUEUED("acme.de") });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.type(
      screen.getByLabelText("Web-Adresse der Firma"),
      "https://www.acme.de/jobs",
    );
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    await waitFor(() =>
      expect(researchBodies(calls)).toEqual([{ company_domain: "acme.de", force_refresh: false }]),
    );
  });

  it("researches the typed address as typed, not the stored suggestion", async () => {
    const calls = stubRoutes({
      "GET /companies/google.com": notFound,
      [RESEARCH]: QUEUED("wwww.bahn.de"),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "google.com" })} />);
    const field = await screen.findByLabelText("Web-Adresse der Firma");
    await userEvent.clear(field);
    await userEvent.type(field, "wwww.bahn.de");
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    await waitFor(() =>
      expect(researchBodies(calls)).toEqual([
        { company_domain: "wwww.bahn.de", force_refresh: false },
      ]),
    );
  });

  it("starts the research without an address, so the server identifies it", async () => {
    const calls = stubRoutes({ [RESEARCH]: QUEUED(null) });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    await waitFor(() =>
      expect(researchBodies(calls)).toEqual([{ company_domain: null, force_refresh: false }]),
    );
    expect(screen.queryByText("Bitte eine Web-Adresse wie acme.de eingeben.")).toBeNull();
  });

  it("shows a running research after a reload, also while the address is still unknown", () => {
    stubRoutes({});
    const job = buildJob({ company_domain: null, company_research_running: true });
    renderWithProviders(<CompanyTab job={job} />);
    expect(screen.getByText(/Firmenrecherche läuft/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Web-Adresse der Firma")).not.toBeInTheDocument();
  });

  it("counts a running research from the server's start stamp", () => {
    stubRoutes({});
    const startedAt = new Date(Date.now() - (3 * 60_000 + 1_000)).toISOString();
    const job = buildJob({
      company_domain: null,
      company_research_running: true,
      company_research_started_at: startedAt,
    });
    renderWithProviders(<CompanyTab job={job} />);
    expect(screen.getByText("läuft seit 3 Minuten")).toBeInTheDocument();
  });

  it("shows a running research of a stored address after a reload", async () => {
    stubRoutes({ "GET /companies/acme.de": notFound });
    const job = buildJob({ company_domain: "acme.de", company_research_running: true });
    renderWithProviders(<CompanyTab job={job} />);
    expect(await screen.findByText(/Firmenrecherche läuft/)).toBeInTheDocument();
    expect(screen.queryByText("Stimmt die Web-Adresse?")).not.toBeInTheDocument();
  });

  it("asks for the address when the AI found none", () => {
    stubRoutes({});
    const job = buildJob({ company_domain: null, company_research_error: "DOMAIN_NOT_FOUND" });
    renderWithProviders(<CompanyTab job={job} />);
    expect(
      screen.getByText(/Die KI hat die Web-Adresse der Firma nicht gefunden/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Web-Adresse der Firma")).toHaveValue("");
  });

  it("offers the stored address again after a failed research, with a fixed text", async () => {
    stubRoutes({ "GET /companies/acme.de": notFound });
    const job = buildJob({ company_domain: "acme.de", company_research_error: "RESEARCH_FAILED" });
    renderWithProviders(<CompanyTab job={job} />);
    expect(await screen.findByText("Stimmt die Web-Adresse?")).toBeInTheDocument();
    expect(
      screen.getByText("Die Firmenrecherche ist fehlgeschlagen. Bitte versuche es erneut."),
    ).toBeInTheDocument();
    expect(screen.queryByText("RESEARCH_FAILED")).not.toBeInTheDocument();
  });

  it("shows a refused address under the field, not the server text", async () => {
    stubRoutes({
      [RESEARCH]: jsonResponse(422, {
        detail: [{ loc: ["body", "company_domain"], msg: "String should match pattern" }],
      }),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.type(screen.getByLabelText("Web-Adresse der Firma"), "acme.de");
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    const field = screen.getByLabelText("Web-Adresse der Firma");
    await waitFor(() => expect(field).toHaveAccessibleDescription(/Bitte eine Web-Adresse/));
    expect(screen.queryByText(/should match/)).not.toBeInTheDocument();
  });

  it("stays busy until the research has started", async () => {
    const started: Array<(response: Response) => void> = [];
    stubRoutes({
      [RESEARCH]: () =>
        new Promise<Response>((resolve) => started.push(resolve)) as unknown as Response,
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.type(screen.getByLabelText("Web-Adresse der Firma"), "acme.de");
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    await waitFor(() => expect(started).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Firma recherchieren" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("rejects something that is not a web address", async () => {
    const calls = stubRoutes({});
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.type(screen.getByLabelText("Web-Adresse der Firma"), "ACME GmbH");
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    expect(screen.getByText("Bitte eine Web-Adresse wie acme.de eingeben.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("asks to confirm the stored web address before the first research and then runs it", async () => {
    const calls = stubRoutes({
      "GET /companies/acme.de": notFound,
      [RESEARCH]: QUEUED("acme.de"),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("Stimmt die Web-Adresse?")).toBeInTheDocument();
    expect(screen.getByLabelText("Web-Adresse der Firma")).toHaveValue("acme.de");
    expect(researchBodies(calls)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    expect(await screen.findByText(/Firmenrecherche läuft/)).toBeInTheDocument();
    expect(researchBodies(calls)).toEqual([{ company_domain: "acme.de", force_refresh: false }]);
    expect(screen.queryByText("Stimmt die Web-Adresse?")).not.toBeInTheDocument();
  });

  it("warns when the stored domain is the job board and does not research on its own", async () => {
    const calls = stubRoutes({ "GET /companies/stepstone.de": notFound });
    const job = buildJob({ company_domain: "stepstone.de", url: "https://www.stepstone.de/job/1" });
    renderWithProviders(<CompanyTab job={job} />);
    expect(
      await screen.findByText(/Adresse der Stellenbörse, nicht der Firma/),
    ).toBeInTheDocument();
    expect(researchBodies(calls)).toEqual([]);
  });

  it("shows no job board warning for a job without url and an empty address", async () => {
    stubRoutes({});
    renderWithProviders(<CompanyTab job={buildJob({ url: null, company_domain: null })} />);
    expect(await screen.findByLabelText("Web-Adresse der Firma")).toHaveValue("");
    expect(screen.queryByText(/Adresse der Stellenbörse, nicht der Firma/)).not.toBeInTheDocument();
  });

  it("prefills the normalised address and stays quiet when it cannot be normalised", async () => {
    stubRoutes({ "GET /companies/acme.de": notFound });
    const first = renderWithProviders(
      <CompanyTab job={buildJob({ company_domain: "https://www.Acme.de/x" })} />,
    );
    expect(await screen.findByLabelText("Web-Adresse der Firma")).toHaveValue("acme.de");
    first.unmount();
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme gmbh" })} />);
    expect(await screen.findByLabelText("Web-Adresse der Firma")).toHaveValue("");
    expect(
      screen.queryByText("Bitte eine Web-Adresse wie acme.de eingeben."),
    ).not.toBeInTheDocument();
  });

  it("shows the profile with sections and refreshes it on request", async () => {
    const calls = stubRoutes({ "GET /companies/acme.de": PROFILE, [RESEARCH]: QUEUED("acme.de") });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("Solider Mittelständler.")).toBeInTheDocument();
    expect(screen.getByText("Fluktuation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://acme.de/karriere" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.queryByText(/javascript:/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alle Firmen" })).toHaveAttribute(
      "href",
      "/companies?domain=acme.de",
    );
    await userEvent.click(screen.getByRole("button", { name: "Neu recherchieren" }));
    expect(screen.getByText("Das Profil wird für alle Benutzer aktualisiert.")).toBeInTheDocument();
    expect(researchBodies(calls)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));
    await waitFor(() =>
      expect(researchBodies(calls)).toEqual([{ company_domain: "acme.de", force_refresh: true }]),
    );
  });

  it("translates AI levels instead of showing raw enums", async () => {
    stubRoutes({ "GET /companies/acme.de": PROFILE });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("Sicherheit: Mittel")).toBeInTheDocument();
    expect(screen.getByText("Wahrscheinlichkeit: Mittel · Auswirkung: Hoch")).toBeInTheDocument();
    expect(screen.queryByText(/Moderate|Medium|High/)).not.toBeInTheDocument();
  });

  it("shows an unknown AI level as plain text without the label", async () => {
    const summary = { ...PROFILE.executive_summary, confidence: "constructor" };
    const risks = [{ ...PROFILE.risks[0], probability: "sehr selten", impact: null }];
    stubRoutes({ "GET /companies/acme.de": { ...PROFILE, executive_summary: summary, risks } });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("constructor")).toBeInTheDocument();
    expect(screen.queryByText(/Sicherheit:/)).not.toBeInTheDocument();
    expect(screen.getByText("sehr selten")).toBeInTheDocument();
    expect(screen.queryByText(/Wahrscheinlichkeit:|Auswirkung:/)).not.toBeInTheDocument();
  });

  it("does not refresh when the dialog is cancelled", async () => {
    const calls = stubRoutes({ "GET /companies/acme.de": PROFILE });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Neu recherchieren" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(researchBodies(calls)).toEqual([]);
  });

  it("says the profile is visible to all users", async () => {
    stubRoutes({ "GET /companies/acme.de": PROFILE });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(
      await screen.findByText(
        /Firmenprofile sind für alle Benutzer dieser Installation sichtbar\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/persönliche/)).not.toBeInTheDocument();
  });

  it("renders AI text as text, not as markup", async () => {
    const hostile = {
      ...PROFILE,
      executive_summary: {
        ...PROFILE.executive_summary,
        assessment: "<img src=x onerror=alert(1)>",
      },
    };
    stubRoutes({ "GET /companies/acme.de": hostile });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("runs a deep dive and shows its result", async () => {
    stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/deep-dive": { result: "## Ergebnis\n- 75 bis 90 k" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    await userEvent.click(screen.getByRole("button", { name: "Jetzt recherchieren" }));
    expect(await screen.findByText("75 bis 90 k")).toBeInTheDocument();
  });

  it("re-runs a deep dive on restart", async () => {
    const calls = stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/deep-dive": { result: "Ergebnis" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    await userEvent.click(screen.getByRole("button", { name: "Jetzt recherchieren" }));
    await userEvent.click(await screen.findByRole("button", { name: "Neu starten" }));
    await waitFor(() => expect(bodies(calls, "/deep-dive")).toHaveLength(2));
  });

  it("a failed refresh offers a retry that researches the stored address again", async () => {
    const calls = stubRoutes({ "GET /companies/acme.de": PROFILE, [RESEARCH]: QUEUED("acme.de") });
    const job = buildJob({ company_domain: "acme.de", company_research_error: "RESEARCH_FAILED" });
    renderWithProviders(<CompanyTab job={job} />);
    await userEvent.click(await screen.findByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() =>
      expect(researchBodies(calls)).toEqual([{ company_domain: "acme.de", force_refresh: true }]),
    );
  });

  it("a refresh that ended with AI_UNREACHABLE says the AI service was unreachable", async () => {
    stubRoutes({ "GET /companies/acme.de": PROFILE });
    const job = buildJob({ company_domain: "acme.de", company_research_error: "AI_UNREACHABLE" });
    renderWithProviders(<CompanyTab job={job} />);
    expect(
      await screen.findByText(/Der KI-Dienst ist gerade nicht erreichbar/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Das hat nicht geklappt/)).not.toBeInTheDocument();
  });

  it("a double click on a deep dive sends one request (dblClick before the busy state)", async () => {
    const answers: Array<(response: Response) => void> = [];
    const calls = stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/deep-dive": () =>
        new Promise<Response>((resolve) => answers.push(resolve)) as unknown as Response,
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    // Two clicks in one task, before the busy state can render: only the ref guard stops the second.
    const run = screen.getByRole("button", { name: "Jetzt recherchieren" });
    fireEvent.click(run);
    fireEvent.click(run);
    await waitFor(() => expect(answers).toHaveLength(1));
    answers[0](jsonResponse(200, { result: "Ergebnis" }));
    expect(await screen.findByText("Ergebnis")).toBeInTheDocument();
    expect(bodies(calls, "/deep-dive")).toHaveLength(1);
  });

  it("the refresh dialog carries company-dialog for its 44 px buttons", async () => {
    stubRoutes({ "GET /companies/acme.de": PROFILE });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Neu recherchieren" }));
    const dialog = screen.getByRole("dialog", { name: "Profil neu recherchieren?" });
    expect(dialog.querySelector(".company-dialog")).not.toBeNull();
  });

  it("shows a deep dive failure with the fixed server message", async () => {
    stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/deep-dive": () => jsonResponse(502, { detail: "Deep dive failed" }),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    await userEvent.click(screen.getByRole("button", { name: "Jetzt recherchieren" }));
    expect(
      await screen.findByText(/Etwas ist schiefgelaufen|Der Server hat|Die Quelle/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Deep dive failed/)).not.toBeInTheDocument();
  });

  it("after a reload shows a deep dive the server still runs, open and busy", async () => {
    stubRoutes({
      "GET /companies/acme.de": withRuns({
        deep_dive_running: true,
        deep_dive_started_at: STARTED_AT,
      }),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText(DEEP_DIVE_RUNNING)).toBeVisible();
    expect(screen.getByRole("button", { name: "Jetzt recherchieren" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("counts a deep dive the server still runs from its stored start", async () => {
    const startedAt = new Date(Date.now() - (4 * 60_000 + 1_000)).toISOString();
    stubRoutes({
      "GET /companies/acme.de": withRuns({
        deep_dive_running: true,
        deep_dive_started_at: startedAt,
      }),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("läuft seit 4 Minuten")).toBeInTheDocument();
  });

  it("shows the stored result of an earlier deep dive and offers a restart", async () => {
    stubRoutes({
      "GET /companies/acme.de": withRuns({ deep_dive_result: "## Ergebnis\n- 75 bis 90 k" }),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    expect(screen.getByText("75 bis 90 k")).toBeVisible();
    expect(screen.getByRole("button", { name: "Neu starten" })).toBeVisible();
  });

  it("shows a deep dive the server ended with an error with the fixed text, open", async () => {
    stubRoutes({ "GET /companies/acme.de": withRuns({ deep_dive_error: "DEEP_DIVE_FAILED" }) });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText(DEEP_DIVE_FAILED)).toBeVisible();
    expect(screen.queryByText(/DEEP_DIVE_FAILED/)).not.toBeInTheDocument();
  });

  it("a run of another focus leaves the deep dive alone", async () => {
    stubRoutes({
      "GET /companies/acme.de": withRuns({ focus: "Andere", deep_dive_running: true }),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    expect(screen.queryByText(DEEP_DIVE_RUNNING)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jetzt recherchieren" })).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("refetches the company after a deep dive, so its stored state wins", async () => {
    const calls = stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/deep-dive": { result: "Ergebnis" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    const loads = () =>
      calls.filter((call) => call.method === "GET" && call.url.endsWith("/companies/acme.de"));
    const before = loads().length;
    await userEvent.click(screen.getByRole("button", { name: "Jetzt recherchieren" }));
    await waitFor(() => expect(loads().length).toBeGreaterThan(before));
  });

  it("a deep dive refused because every AI slot is taken reads the fixed busy sentence", async () => {
    stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/deep-dive": () => jsonResponse(503, { detail: "ai_busy" }),
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gehalt" }));
    await userEvent.click(screen.getByRole("button", { name: "Jetzt recherchieren" }));
    expect(
      await screen.findByText(
        "Gerade laufen zu viele KI-Vorgänge. Bitte versuche es gleich noch einmal.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/ai_busy/)).not.toBeInTheDocument();
  });
});
