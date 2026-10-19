import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { pendingTaskId, STALL_AFTER_MS } from "@/domain/pendingTasks";
import { InterviewTab } from "@/features/job/interview/InterviewTab";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

const NOW = new Date("2026-10-08T10:00:00Z");
const PREP = JSON.stringify({
  report_output: { executive_summary: "Gute Ausgangslage.", deep_dive_analysis: "Mehr Tiefe." },
  structured_prep: {
    elevator_pitch: "Ich baue robuste Systeme.",
    gap_analysis: [
      {
        requirement: "GCP",
        cv_status: "fehlt",
        gap_severity: "High",
        interview_strategy: "AWS-Erfahrung übertragen",
      },
      "kaputter Eintrag",
    ],
  },
  deep_dive_buttons: [],
  confidence_assessment: { overall_confidence: "Moderate", uncertainties: ["Budget"] },
  online_resources: ["https://acme.de/karriere", "javascript:alert(1)"],
});
const QUEUED = { status: "queued", message: "", job_id: "job-1" };

describe("InterviewTab", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a preparation and shows that it runs", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/interview-prep": QUEUED });
    renderWithProviders(<InterviewTab job={buildJob({ status: "INTERVIEW" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Vorbereitung erstellen" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByText("Vorbereitung wird erstellt …")).toBeInTheDocument();
  });

  it("renders the preparation and the interview date", () => {
    stubRoutes({});
    renderWithProviders(
      <InterviewTab
        job={buildJob({
          status: "INTERVIEW",
          interview_prep_material: PREP,
          interview_at: "2026-10-12T08:00:00Z",
          next_follow_up_at: "2026-10-30T08:00:00Z",
        })}
      />,
    );
    expect(screen.getByText("Gute Ausgangslage.")).toBeInTheDocument();
    expect(screen.getByText("Ich baue robuste Systeme.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GCP" })).toBeInTheDocument();
    expect(screen.getByText("AWS-Erfahrung übertragen")).toBeInTheDocument();
    expect(screen.getByText(/Termin:/)).toHaveTextContent("12.10.");
    expect(screen.queryByText(/30\.10\./)).not.toBeInTheDocument();
  });

  it("shows only http links, opened safely", () => {
    stubRoutes({});
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: PREP })} />,
    );
    const link = screen.getByRole("link", { name: "https://acme.de/karriere" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const hrefs = screen.getAllByRole("link").map((anchor) => anchor.getAttribute("href"));
    expect(hrefs.filter((href) => !href?.startsWith("#"))).toEqual(["https://acme.de/karriere"]);
  });

  it("regenerates on request", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/interview-prep/regenerate": QUEUED });
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: PREP })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Neu erstellen" }));
    await waitFor(() => expect(calls[0].url).toContain("/interview-prep/regenerate"));
  });

  it("offers a new attempt when the stored preparation is unreadable", () => {
    stubRoutes({});
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: "{}" })} />,
    );
    expect(
      screen.getByText("Die gespeicherte Vorbereitung ließ sich nicht lesen."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neu erstellen" })).toBeInTheDocument();
  });

  it("shows a preparation the server reports as running, e.g. after a reload", () => {
    stubRoutes({});
    renderWithProviders(<InterviewTab job={buildJob({ interview_prep_running: true })} />);
    expect(screen.getByText("Vorbereitung wird erstellt …")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vorbereitung erstellen" }),
    ).not.toBeInTheDocument();
  });

  it("counts a running preparation from the server's start, so a reload keeps the time", () => {
    stubRoutes({});
    const job = buildJob({
      interview_prep_running: true,
      interview_prep_started_at: "2026-10-08T09:57:30Z",
    });
    const { container } = renderWithProviders(<InterviewTab job={job} />);
    expect(container.querySelector(".elapsed-ticking")).toHaveTextContent("seit 02:30");
    expect(screen.getByText("läuft seit 2 Minuten")).toBeInTheDocument();
  });

  it("counts a just started preparation from this tab's start", async () => {
    stubRoutes({ "POST /jobs/job-1/interview-prep": QUEUED });
    const { container } = renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW" })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Vorbereitung erstellen" }));
    await screen.findByText("Vorbereitung wird erstellt …");
    expect(container.querySelector(".elapsed-ticking")).toHaveTextContent("seit 00:00");
  });

  it("shows a failed preparation and restarts it on retry", async () => {
    const calls = stubRoutes({ "POST /jobs/job-1/interview-prep": QUEUED });
    renderWithProviders(<InterviewTab job={buildJob({ interview_prep_error: "server text" })} />);
    expect(screen.getByText(/Das hat nicht geklappt/)).toBeInTheDocument();
    expect(screen.queryByText(/server text/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(await screen.findByText("Vorbereitung wird erstellt …")).toBeInTheDocument();
  });

  it("shows a failed new attempt next to the stored preparation", () => {
    stubRoutes({});
    renderWithProviders(
      <InterviewTab job={buildJob({ interview_prep_material: PREP, interview_prep_error: "x" })} />,
    );
    expect(screen.getByText("Gute Ausgangslage.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("offers a retry when the preparation stalls", async () => {
    stubRoutes({});
    const { queryClient } = renderWithProviders(<InterviewTab job={buildJob({})} />);
    act(() =>
      queryClient.setQueryData(queryKeys.pendingTasks, {
        [pendingTaskId.prep("job-1")]: { startedAt: NOW.getTime() - STALL_AFTER_MS, failed: false },
      }),
    );
    expect(await screen.findByText(/dauert ungewöhnlich lange/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("translates levels and shows unknown ones neutrally", () => {
    stubRoutes({});
    const prep = JSON.stringify({
      structured_prep: {
        gap_analysis: [
          { requirement: "A", gap_severity: "High", cv_status: "du hast 3 Jahre Erfahrung" },
          { requirement: "B", gap_severity: "katastrophal" },
        ],
      },
      confidence_assessment: { overall_confidence: "Moderate", uncertainties: [] },
    });
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: prep })} />,
    );
    // Each weight shows on the gap card and in the overview's heaviest gaps.
    expect(screen.getAllByText("Gewicht: Hoch")).toHaveLength(2);
    expect(screen.getAllByText("katastrophal")).toHaveLength(2);
    expect(screen.getByText("Sicherheit der Einschätzung: Mittel")).toBeInTheDocument();
    expect(screen.getByText("du hast 3 Jahre Erfahrung")).toBeInTheDocument();
    expect(screen.queryByText(/Im Lebenslauf/)).not.toBeInTheDocument();
  });

  it("shows contacts without a name, sources and the caveat", () => {
    stubRoutes({});
    const prep = JSON.stringify({
      social_intelligence_research: {
        potential_contacts: [{ role: "CTO" }, {}],
        research_sources: ["https://acme.de/blog", "Interview im Podcast"],
      },
      online_resources: ["https://acme.de/karriere"],
    });
    renderWithProviders(
      <InterviewTab
        job={buildJob({ status: "INTERVIEW", company: null, interview_prep_material: prep })}
      />,
    );
    expect(screen.getByText("CTO")).toBeInTheDocument();
    expect(screen.getByText("Kontakt")).toBeInTheDocument();
    expect(screen.getByText(/Unbestätigte Vorschläge der KI/)).toBeInTheDocument();
    expect(screen.getByText("Interview im Podcast")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://acme.de/blog" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("heading", { name: "Quellen" })).toBeInTheDocument();
  });

  it("names a titled source by its title and lists each URL once", () => {
    stubRoutes({});
    const prep = JSON.stringify({
      social_intelligence_research: {
        research_sources: [{ title: "Engineering Blog", url: "https://acme.de/blog" }],
      },
      online_resources: ["https://acme.de/blog", "https://acme.de/karriere"],
    });
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: prep })} />,
    );
    expect(screen.getByRole("link", { name: "Engineering Blog" })).toHaveAttribute(
      "href",
      "https://acme.de/blog",
    );
    expect(screen.queryByRole("link", { name: "https://acme.de/blog" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://acme.de/karriere" })).toBeInTheDocument();
  });

  it("opens with an overview: confidence, the heaviest gaps first and a jump list", () => {
    stubRoutes({});
    const prep = JSON.stringify({
      report_output: { executive_summary: "Gute Ausgangslage.", deep_dive_analysis: "Mehr Tiefe." },
      structured_prep: {
        elevator_pitch: "Ich baue robuste Systeme.",
        gap_analysis: [
          { requirement: "Scrum", gap_severity: "Low" },
          { requirement: "GCP", gap_severity: "High" },
          { requirement: "Kafka", gap_severity: "Medium" },
          { requirement: "Go", gap_severity: "High" },
        ],
      },
      confidence_assessment: { overall_confidence: "High", uncertainties: ["Budget", "Team"] },
    });
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: prep })} />,
    );
    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Überblick");
    expect(screen.getByText("Sicherheit der Einschätzung: Hoch")).toBeInTheDocument();
    const top = within(screen.getByRole("list", { name: "Worauf es ankommt" }));
    expect(top.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "GCPGewicht: Hoch",
      "GoGewicht: Hoch",
      "KafkaGewicht: Mittel",
    ]);
    const contents = within(screen.getByRole("navigation", { name: "Inhalt" }));
    expect(contents.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "#prep-pitch",
      "#prep-gaps",
      "#prep-uncertainties",
      "#prep-depth",
    ]);
    expect(contents.getByRole("link", { name: "Lücken und Strategie 4" })).toBeInTheDocument();
    expect(document.getElementById("prep-gaps")).toHaveTextContent("Lücken und Strategie");
  });

  it("orders the gap cards by weight and keeps the strategy behind a toggle", async () => {
    stubRoutes({});
    const prep = JSON.stringify({
      structured_prep: {
        gap_analysis: [
          { requirement: "Scrum", gap_severity: "Low", interview_strategy: "Retro-Beispiel" },
          { requirement: "GCP", cv_status: "fehlt", gap_severity: "High" },
        ],
      },
    });
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: prep })} />,
    );
    const cards = screen.getAllByRole("heading", { level: 4 }).map((title) => title.textContent);
    expect(cards.filter((title) => title === "GCP" || title === "Scrum")).toEqual(["GCP", "Scrum"]);
    expect(screen.getByText("fehlt")).toBeVisible();
    expect(screen.getByText("Retro-Beispiel")).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "So gehst du darauf ein" }));
    expect(screen.getByText("Retro-Beispiel")).toBeVisible();
  });

  it("keeps the long analysis collapsed until asked for", async () => {
    stubRoutes({});
    renderWithProviders(
      <InterviewTab job={buildJob({ status: "INTERVIEW", interview_prep_material: PREP })} />,
    );
    expect(screen.getByText("Mehr Tiefe.")).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Analyse lesen" }));
    expect(screen.getByText("Mehr Tiefe.")).toBeVisible();
  });

  it("does not read 'an .' when the company is unknown", () => {
    stubRoutes({});
    renderWithProviders(<InterviewTab job={buildJob({ company: null })} />);
    expect(screen.getByText(/Rückfragen an die Firma\./)).toBeInTheDocument();
  });
});
