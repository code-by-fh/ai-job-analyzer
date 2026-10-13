import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { EMPTY_PENDING, failTasks, pendingTaskId, startTask } from "@/domain/pendingTasks";
import { CompanyTab } from "@/features/job/company/CompanyTab";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
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
const notFound = () => jsonResponse(404, { detail: "Company profile not found" });
const bodies = (calls: RecordedCall[], suffix: string) =>
  calls
    .filter((call) => call.method !== "GET" && call.url.endsWith(suffix))
    .map((call) => JSON.parse(call.body ?? "null"));

describe("CompanyTab", () => {
  it("asks for the company's web address once and starts the research", async () => {
    const calls = stubRoutes({
      "PATCH /jobs/job-1": { status: "updated" },
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: null })} />);
    await userEvent.type(
      screen.getByLabelText("Web-Adresse der Firma"),
      "https://www.acme.de/jobs",
    );
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    await waitFor(() =>
      expect(bodies(calls, "/jobs/job-1")).toEqual([{ company_domain: "acme.de" }]),
    );
    await waitFor(() => expect(bodies(calls, "/analyze")).toEqual([{ force_refresh: false }]));
  });

  it("shows a refused address under the field, not the server text", async () => {
    stubRoutes({
      "PATCH /jobs/job-1": jsonResponse(422, {
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

  it("stays busy until the research has started, not only while the address is saved", async () => {
    const started: Array<(response: Response) => void> = [];
    stubRoutes({
      "PATCH /jobs/job-1": { status: "updated" },
      "POST /companies/acme.de/analyze": () =>
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
      "PATCH /jobs/job-1": { status: "updated" },
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />);
    expect(await screen.findByText("Stimmt die Web-Adresse?")).toBeInTheDocument();
    expect(screen.getByLabelText("Web-Adresse der Firma")).toHaveValue("acme.de");
    expect(bodies(calls, "/analyze")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Firma recherchieren" }));
    expect(await screen.findByText(/Firmenrecherche läuft/)).toBeInTheDocument();
    expect(bodies(calls, "/jobs/job-1")).toEqual([{ company_domain: "acme.de" }]);
    expect(screen.queryByText("Stimmt die Web-Adresse?")).not.toBeInTheDocument();
  });

  it("warns when the stored domain is the job board and does not research on its own", async () => {
    const calls = stubRoutes({ "GET /companies/stepstone.de": notFound });
    const job = buildJob({ company_domain: "stepstone.de", url: "https://www.stepstone.de/job/1" });
    renderWithProviders(<CompanyTab job={job} />);
    expect(
      await screen.findByText(/Adresse der Stellenbörse, nicht der Firma/),
    ).toBeInTheDocument();
    expect(bodies(calls, "/analyze")).toEqual([]);
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
    const calls = stubRoutes({
      "GET /companies/acme.de": PROFILE,
      "POST /companies/acme.de/analyze": { status: "queued", domain: "acme.de", message: "" },
    });
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
    expect(bodies(calls, "/analyze")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));
    await waitFor(() => expect(bodies(calls, "/analyze")).toEqual([{ force_refresh: true }]));
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
    expect(bodies(calls, "/analyze")).toEqual([]);
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

  it("a retried research answered with 'exists' reloads the profile that appeared meanwhile", async () => {
    let created = false;
    stubRoutes({
      "GET /companies/acme.de": () => (created ? jsonResponse(200, PROFILE) : notFound()),
      "POST /companies/acme.de/analyze": () => {
        created = true;
        return jsonResponse(200, { status: "exists", domain: "acme.de", message: "" });
      },
    });
    const queryClient = createTestQueryClient();
    const started = startTask(EMPTY_PENDING, pendingTaskId.research("acme.de"), Date.now());
    queryClient.setQueryData(queryKeys.pendingTasks, failTasks(started, "research:"));
    renderWithProviders(<CompanyTab job={buildJob({ company_domain: "acme.de" })} />, queryClient);
    await userEvent.click(await screen.findByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Solider Mittelständler.")).toBeInTheDocument();
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
});
