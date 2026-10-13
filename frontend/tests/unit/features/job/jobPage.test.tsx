import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobPage } from "@/features/job/JobPage";
import { jsonResponse } from "../../support/fakeFetch";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { stubRoutes } from "../../support/stubRoutes";

// next/navigation needs the App Router at runtime; it is the framework boundary here.
const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const JOB_ROUTES = { "GET /jobs/job-1/history": [] };

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = "";
});

function showJob(overrides: Parameters<typeof buildJob>[0] = {}) {
  stubRoutes({ ...JOB_ROUTES, "GET /jobs/job-1": buildJob(overrides) });
  renderWithProviders(<JobPage jobId="job-1" />);
}

describe("JobPage next step column", () => {
  it("names the side column and puts the next step before the tabs", async () => {
    showJob({ status: "OPEN" });
    const side = await screen.findByRole("complementary", { name: "Nächster Schritt" });
    const tabs = screen.getByRole("tablist");
    expect(side.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(side).toHaveTextContent("Passt die Stelle zu dir?");
  });
});

describe("JobPage header", () => {
  it("shows title, company and a strong score", async () => {
    showJob({ match_score: 84.4 });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Senior Backend Engineer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ACME GmbH", { selector: ".jd-meta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Passung 84 von 100")).toHaveTextContent("84");
    expect(screen.getByText("Stark")).toBeInTheDocument();
  });

  it("lets the score recede from Beworben on", async () => {
    showJob({ status: "APPLIED" });
    const score = await screen.findByLabelText("Passung 84 von 100");
    expect(score.closest(".jd-scorebox")).toHaveClass("recede");
  });

  it("says when a job has no score yet", async () => {
    showJob({ match_score: null });
    expect(await screen.findByText("Noch nicht bewertet")).toBeInTheDocument();
  });

  it("leaves out the found date when it is malformed instead of failing", async () => {
    showJob({ created_at: "not a date" });
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/Gefunden am/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Stellenanzeige/ })).toBeInTheDocument();
  });

  it("links the posting in a new tab", async () => {
    showJob();
    const link = await screen.findByRole("link", { name: /Stellenanzeige/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each(["data:text/html,<b>x</b>", "ftp://acme.de/job"])(
    "shows no posting link for %s",
    async (url) => {
      showJob({ url });
      await screen.findByRole("heading", { level: 1 });
      expect(screen.queryByRole("link", { name: /Stellenanzeige/ })).not.toBeInTheDocument();
    },
  );

  it("leads back to Eingang for a match and to Bewerbungen for an application", async () => {
    showJob({ status: "APPLIED" });
    const crumbs = await screen.findByRole("navigation", { name: "Brotkrumen" });
    expect(crumbs.querySelector("a")).toHaveAttribute("href", "/applications");
  });

  it("explains a job below the threshold", async () => {
    showJob({ is_archived: true, archive_reason: "THRESHOLD" });
    expect(await screen.findByText(/unter deinem Schwellwert/)).toBeInTheDocument();
  });
});

describe("JobPage states", () => {
  it("shows a not-found page for an unknown id", async () => {
    stubRoutes({ "GET /jobs/job-1": jsonResponse(404, { detail: "Job not found" }) });
    renderWithProviders(<JobPage jobId="job-1" />);
    expect(
      await screen.findByRole("heading", { name: "Stelle nicht gefunden" }),
    ).toBeInTheDocument();
  });

  it("shows a generic error with retry, never the server text", async () => {
    stubRoutes({ "GET /jobs/job-1": jsonResponse(500, { detail: "psycopg2 exploded" }) });
    renderWithProviders(<JobPage jobId="job-1" />);
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(screen.queryByText(/psycopg2/)).not.toBeInTheDocument();
  });
});

describe("JobPage tabs", () => {
  it("opens the tab of the phase by default", async () => {
    showJob({ status: "DRAFTED" });
    expect(await screen.findByRole("tab", { name: "Unterlagen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("restores the tab from the URL", async () => {
    navigation.search = "tab=verlauf";
    showJob();
    expect(await screen.findByRole("tab", { name: "Verlauf" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("writes the chosen tab into the URL", async () => {
    showJob();
    await userEvent.click(await screen.findByRole("tab", { name: "Firma" }));
    expect(navigation.replace).toHaveBeenCalledWith("/jobs/job-1?tab=firma", { scroll: false });
  });

  it("falls back to the phase tab for an unknown ?tab value", async () => {
    navigation.search = "tab=constructor";
    showJob({ status: "DRAFTED" });
    expect(await screen.findByRole("tab", { name: "Unterlagen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it.each([
    ["passung", "Passung", { status: "OPEN" }],
    ["unterlagen", "Unterlagen", { status: "DRAFTED" }],
    ["unterlagen", "Unterlagen", { status: "OPEN" }],
    ["firma", "Firma", { status: "DRAFTED" }],
    ["interview", "Interview", { status: "DRAFTED" }],
    ["interview", "Interview", { status: "INTERVIEW" }],
    ["verlauf", "Verlauf", { status: "APPLIED" }],
  ] as const)(
    "starts the %s panel with an h2 named after the tab (%#)",
    async (param, name, job) => {
      navigation.search = `tab=${param}`;
      showJob(job);
      const panel = await screen.findByRole("tabpanel");
      const headings = within(panel).getAllByRole("heading");
      expect(headings[0]).toHaveAccessibleName(name);
      expect(headings[0].tagName).toBe("H2");
      expect(headings.slice(1).map((heading) => heading.tagName)).not.toContain("H2");
    },
  );

  it("dims Unterlagen for a match and still opens it on request", async () => {
    navigation.search = "tab=unterlagen";
    showJob({ status: "OPEN" });
    expect(await screen.findByText("Unterlagen werden ab Vorgemerkt erstellt")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trotzdem öffnen" }));
    expect(screen.queryByText("Unterlagen werden ab Vorgemerkt erstellt")).not.toBeInTheDocument();
  });
});
