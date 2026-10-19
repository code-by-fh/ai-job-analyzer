import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { JobDetail } from "@/api/jobs";
import { DatesCard as Card } from "@/features/job/dates/DatesCard";
import { DatesDrawerProvider } from "@/features/job/dates/DatesDrawerProvider";
import { buildJob } from "../../support/jobFactory";
import { renderWithProviders } from "../../support/render";
import { jsonResponse } from "../../support/fakeFetch";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/job-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** The card as the job page mounts it: inside the provider that owns its drawer. */
function DatesCard({ job }: { job: JobDetail }) {
  return (
    <DatesDrawerProvider job={job}>
      <Card job={job} />
    </DatesDrawerProvider>
  );
}

const PATCH_ROUTE = { "PATCH /jobs/job-1": { status: "updated" } };

async function openDrawer() {
  await userEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
  return screen.getByRole("dialog", { name: "Termine & Daten" });
}

describe("DatesCard", () => {
  it("shows the interview date and the follow-up date under their own names", () => {
    stubRoutes({});
    renderWithProviders(
      <DatesCard
        job={buildJob({
          status: "INTERVIEW",
          next_follow_up_at: "2026-10-20T07:00:00Z",
          interview_at: "2026-10-25T07:00:00Z",
        })}
      />,
    );
    const card = screen.getByRole("region", { name: "Termine & Daten" });
    expect(within(card).getByText("Interviewtermin")).toBeInTheDocument();
    expect(within(card).getByText(/25\.10\./)).toBeInTheDocument();
    expect(within(card).getByText("Nachfassen am")).toBeInTheDocument();
    expect(within(card).getByText(/20\.10\./)).toBeInTheDocument();
  });

  it("calls the follow-up date the answer deadline in the offer phase", () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ status: "OFFER" })} />);
    expect(screen.getByText("Antwort bis")).toBeInTheDocument();
  });

  it("marks only the values that came from the posting", () => {
    stubRoutes({});
    renderWithProviders(
      <DatesCard
        job={buildJob({
          salary_benchmark: { min: 60000, max: 75000, note: "" },
          recruiter_info: { name: "Bob", role: "", email: "", phone: "" },
          posting_extracted: ["salary_benchmark"],
        })}
      />,
    );
    expect(screen.getAllByText("aus der Anzeige")).toHaveLength(1);
    const salary = screen.getByText(/60000/);
    expect(within(salary).getByText("aus der Anzeige")).toBeInTheDocument();
  });

  it("saves only the changed salary, not contacts or recruiter", async () => {
    const calls = stubRoutes(PATCH_ROUTE);
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    const drawer = await openDrawer();
    await userEvent.type(within(drawer).getByLabelText("Gehalt von (€ im Jahr)"), "75000");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      salary_benchmark: { min: 75000, max: null, note: "" },
    });
  });

  it("adds a contact", async () => {
    const calls = stubRoutes(PATCH_ROUTE);
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    const drawer = await openDrawer();
    await userEvent.click(within(drawer).getByRole("button", { name: "Kontakt hinzufügen" }));
    await userEvent.type(within(drawer).getByLabelText("Name 1"), "Anna Muster");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      contact_persons: [{ name: "Anna Muster", role: "", email: "", phone: "" }],
    });
  });

  it("shows the contact phone and keeps it when the contact is saved", async () => {
    const calls = stubRoutes(PATCH_ROUTE);
    const anna = { name: "Anna", role: "", email: "", phone: "+49 40 1" };
    renderWithProviders(
      <DatesCard job={buildJob({ status: "APPLIED", contact_persons: [anna] })} />,
    );
    expect(screen.getByText(/\+49 40 1/)).toBeInTheDocument();
    const drawer = await openDrawer();
    expect(within(drawer).getByLabelText("Telefon 1")).toHaveValue("+49 40 1");
    await userEvent.type(within(drawer).getByLabelText("Rolle 1"), "Teamlead");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      contact_persons: [{ ...anna, role: "Teamlead" }],
    });
  });

  it("clears a stored date with an explicit null", async () => {
    const calls = stubRoutes(PATCH_ROUTE);
    const job = buildJob({ status: "APPLIED", next_follow_up_at: "2026-10-20T07:00:00Z" });
    renderWithProviders(<DatesCard job={job} />);
    const drawer = await openDrawer();
    await userEvent.click(within(drawer).getByRole("button", { name: /Datum entfernen/ }));
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(calls[0].body ?? "")).toEqual({ next_follow_up_at: null });
  });

  it("does not save an invalid salary range", async () => {
    const calls = stubRoutes(PATCH_ROUTE);
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    await openDrawer();
    await userEvent.type(screen.getByLabelText("Gehalt von (€ im Jahr)"), "90000");
    await userEvent.type(screen.getByLabelText("Gehalt bis (€ im Jahr)"), "80000");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByText("Das Minimum liegt über dem Maximum.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("shows the interview time on the card when it is not 09:00", () => {
    stubRoutes({});
    const interview_at = new Date(2026, 9, 25, 14, 30).toISOString();
    renderWithProviders(<DatesCard job={buildJob({ status: "INTERVIEW", interview_at })} />);
    expect(screen.getByText(/25\.10\..*14:30/)).toBeInTheDocument();
  });

  it("shows only the date for the 09:00 default", () => {
    stubRoutes({});
    const interview_at = new Date(2026, 9, 25, 9, 0).toISOString();
    renderWithProviders(<DatesCard job={buildJob({ status: "INTERVIEW", interview_at })} />);
    expect(screen.getByText(/25\.10\./)).not.toHaveTextContent("09:00");
  });

  it("offers the interview time only once there is an interview date", async () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ status: "INTERVIEW" })} />);
    const drawer = await openDrawer();
    const time = within(drawer).getByLabelText("Uhrzeit (optional)");
    expect(time).toBeDisabled();
    await userEvent.type(within(drawer).getByLabelText("Interviewtermin"), "2026-10-20");
    expect(time).toBeEnabled();
  });

  it("saves a time-only change of the interview", async () => {
    const calls = stubRoutes(PATCH_ROUTE);
    const interview_at = new Date(2026, 9, 25, 14, 30).toISOString();
    renderWithProviders(<DatesCard job={buildJob({ status: "INTERVIEW", interview_at })} />);
    const drawer = await openDrawer();
    const time = within(drawer).getByLabelText("Uhrzeit (optional)");
    await userEvent.clear(time);
    await userEvent.type(time, "16:00");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(calls[0].body ?? "")).toEqual({
      interview_at: new Date(2026, 9, 25, 16, 0).toISOString(),
    });
  });

  it("focuses the first invalid field and announces its message as an alert", async () => {
    stubRoutes(PATCH_ROUTE);
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    const drawer = await openDrawer();
    await userEvent.type(within(drawer).getByLabelText("E-Mail des Recruiters"), "kaputt");
    await userEvent.type(within(drawer).getByLabelText("Gehalt von (€ im Jahr)"), "1e5");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    expect(within(drawer).getByLabelText("E-Mail des Recruiters")).toHaveFocus();
    const alert = within(drawer).getByText("Bitte eine gültige E-Mail-Adresse eingeben.");
    expect(alert.closest('[role="alert"]')).not.toBeNull();
  });

  it("limits the text inputs", async () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    const drawer = await openDrawer();
    expect(within(drawer).getByLabelText("Name des Recruiters")).toHaveAttribute(
      "maxlength",
      "200",
    );
    expect(within(drawer).getByLabelText("Quelle oder Notiz zum Gehalt")).toHaveAttribute(
      "maxlength",
      "500",
    );
  });

  it("shows a refused salary maximum under its field", async () => {
    stubRoutes({
      "PATCH /jobs/job-1": jsonResponse(422, {
        detail: [{ loc: ["body", "salary_benchmark", "max"], msg: "Value error, min > max" }],
      }),
    });
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    const drawer = await openDrawer();
    await userEvent.type(within(drawer).getByLabelText("Gehalt bis (€ im Jahr)"), "75000");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    const max = within(drawer).getByLabelText("Gehalt bis (€ im Jahr)");
    await waitFor(() =>
      expect(max).toHaveAccessibleDescription("Diesen Wert hat der Server nicht angenommen."),
    );
    expect(max).toHaveFocus();
    expect(screen.queryByText(/min > max/)).not.toBeInTheDocument();
    expect(screen.queryByText("Die Eingabe ist ungültig.")).not.toBeInTheDocument();
  });

  it("keeps the drawer open and tells the user when saving fails", async () => {
    stubRoutes({ "PATCH /jobs/job-1": jsonResponse(500, { detail: "boom" }) });
    renderWithProviders(<DatesCard job={buildJob({ status: "APPLIED" })} />);
    const drawer = await openDrawer();
    await userEvent.type(within(drawer).getByLabelText("Gehalt von (€ im Jahr)"), "75000");
    await userEvent.click(within(drawer).getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText(/Der Server hat einen Fehler gemeldet/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Termine & Daten" })).toBeInTheDocument();
  });
});

const TAKE_FROM_POSTING = "Aus der Anzeige übernehmen";
const POSTING_ROUTE = "POST /jobs/job-1/posting-details";

describe("DatesCard: Aus der Anzeige übernehmen", () => {
  it("starts the extraction for a job with posting text and no extracted mark", async () => {
    const calls = stubRoutes({ [POSTING_ROUTE]: { status: "queued" } });
    renderWithProviders(<DatesCard job={buildJob()} />);
    await userEvent.click(screen.getByRole("button", { name: TAKE_FROM_POSTING }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe("POST");
    expect(await screen.findByText(/Die Anzeige wird nach Kontakten/)).toBeVisible();
  });

  it("is not offered when a field already carries the extracted mark", () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ posting_extracted: ["contact_persons"] })} />);
    expect(screen.queryByRole("button", { name: TAKE_FROM_POSTING })).toBeNull();
  });

  it("is not offered for a job without posting text", () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ description: null })} />);
    expect(screen.queryByRole("button", { name: TAKE_FROM_POSTING })).toBeNull();
  });

  it("shows a run the server still runs, with its elapsed time, and no start button", () => {
    stubRoutes({});
    const startedAt = new Date(Date.now() - 4 * 60_000 - 1_000).toISOString();
    renderWithProviders(
      <DatesCard
        job={buildJob({ posting_details_running: true, posting_details_started_at: startedAt })}
      />,
    );
    expect(screen.getByText(/Die Anzeige wird nach Kontakten/)).toBeVisible();
    expect(screen.getByText("läuft seit 4 Minuten")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: TAKE_FROM_POSTING })).toBeNull();
  });

  it("says when the run found nothing new and keeps the action", () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ posting_details_error: "NOTHING_NEW" })} />);
    expect(screen.getByText(/In der Anzeige wurde nichts Neues gefunden/)).toBeVisible();
    expect(screen.getByRole("button", { name: TAKE_FROM_POSTING })).toBeVisible();
  });

  it("confirms with a toast when a run this view saw filled fields", async () => {
    stubRoutes({});
    const running = buildJob({ posting_details_running: true });
    const filled = buildJob({ posting_extracted: ["contact_persons"] });
    function Harness() {
      const [job, setJob] = useState(running);
      return (
        <>
          <button onClick={() => setJob(filled)}>Lauf beenden</button>
          <DatesCard job={job} />
        </>
      );
    }
    renderWithProviders(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Lauf beenden" }));
    expect(await screen.findByText("Angaben aus der Anzeige übernommen.")).toBeVisible();
  });

  it("shows no confirmation for a job that already carries extracted fields", () => {
    stubRoutes({});
    renderWithProviders(<DatesCard job={buildJob({ posting_extracted: ["contact_persons"] })} />);
    expect(screen.queryByText("Angaben aus der Anzeige übernommen.")).toBeNull();
  });

  it("offers a retry after a failed run", () => {
    stubRoutes({});
    renderWithProviders(
      <DatesCard job={buildJob({ posting_details_error: "EXTRACTION_FAILED" })} />,
    );
    expect(screen.getByText(/Das hat nicht geklappt/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  });
});
