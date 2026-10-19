import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import {
  CHANNELS,
  PUSHOVER_CHANNEL,
  SMTP_CHANNEL,
} from "../../../e2e/support/notificationFixtures";
import { SOURCE_A, sourcesStubs, TEMPLATES } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const NOW = new Date("2026-10-08T10:00:00+02:00");
const SERVER_ERROR = 500;
const BAD_GATEWAY = 502;
const TOO_MANY_REQUESTS = 429;
// Long enough that the retry never fires during a test: only the first failure is seen.
const RETRY_DELAY_MS = 60_000;
const RETRIES = 3;

const notify = async () => {
  const panel = await screen.findByRole("dialog", { name: "Quelle StepStone" });
  return within(panel).getByRole("form", { name: "Benachrichtigungen" });
};
const patches = (calls: readonly RecordedCall[]) =>
  calls.filter((call) => call.method === "PATCH").map((call) => JSON.parse(call.body!));
const saveOf = (form: HTMLElement) => within(form).getByRole("button", { name: "Speichern" });
const PUSHOVER_TEST = `POST /notifications/channels/${PUSHOVER_CHANNEL.id}/test`;
const RECIPIENTS_SMTP = "Empfänger für E-Mail (SMTP)";
const INVALID_RECIPIENTS = "Gib nur gültige E-Mail-Adressen ein.";
const listOf = (items: unknown[]) => ({ items, total: items.length });

beforeEach(async () => {
  // A drawer closed by the previous test schedules its focus fallback for the next frame.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  liveNavigation.reset("quelle=1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("notifications of a source", () => {
  it("without channels it points to the settings", async () => {
    sourcesStubs(undefined, { "GET /notifications/channels": listOf([]) });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    expect(await within(form).findByText(/Noch kein Kanal eingerichtet/)).toBeInTheDocument();
    expect(
      within(form).getByRole("link", { name: "In den Einstellungen einrichten" }),
    ).toHaveAttribute("href", "/settings?section=notifications");
  });

  it("offers each of the user's channels with the service's type label", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    expect(await within(form).findByLabelText("Mein Handy benachrichtigen")).toBeChecked();
    expect(within(form).getByLabelText("Firmen-SMTP benachrichtigen")).not.toBeChecked();
    expect(within(form).getByText("E-Mail (SMTP)")).toBeInTheDocument();
    // Only the chosen channel offers a test, and only its type has options.
    expect(within(form).getAllByRole("button", { name: /^Test über/ })).toHaveLength(1);
    expect(within(form).queryByLabelText("Vorlage für E-Mail (SMTP)")).toBeNull();
  });

  it("explains in the drawer that a channel's test skips the source's recipients", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    expect(
      await within(form).findByText(/nicht an die Empfänger dieser Quelle/),
    ).toBeInTheDocument();
  });

  it("refuses recipients that are no addresses", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("Firmen-SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText(RECIPIENTS_SMTP), "ich@example.com, kaputt");
    await userEvent.click(saveOf(form));
    expect(await within(form).findByText(INVALID_RECIPIENTS)).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("saves the chosen channels by id, a chosen template as its content", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("Firmen-SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText(RECIPIENTS_SMTP), "ich@example.com");
    await userEvent.selectOptions(
      within(form).getByLabelText("Vorlage für E-Mail (SMTP)"),
      "Wochenmail (global)",
    );
    await userEvent.click(saveOf(form));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        {
          notification_channel_ids: [PUSHOVER_CHANNEL.id, SMTP_CHANNEL.id],
          pushover_template: null,
          resend_template: null,
          mailjet_template: null,
          smtp_template: TEMPLATES[1]!.content,
          resend_recipients: null,
          mailjet_recipients: null,
          smtp_recipients: ["ich@example.com"],
        },
      ]),
    );
  });

  it("empty recipients are saved as none, so the channel's own recipients get the mail", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("Firmen-SMTP benachrichtigen"));
    await userEvent.click(saveOf(form));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0]).toMatchObject({ smtp_recipients: null });
  });

  it("two channels of one type share one template and one recipient list", async () => {
    const second = {
      ...SMTP_CHANNEL,
      id: "6f1c2a10-0000-4000-8000-000000000009",
      name: "Zweit-SMTP",
    };
    sourcesStubs(undefined, { "GET /notifications/channels": listOf([...CHANNELS, second]) });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("Firmen-SMTP benachrichtigen"));
    await userEvent.click(within(form).getByLabelText("Zweit-SMTP benachrichtigen"));
    expect(within(form).getAllByLabelText("Vorlage für E-Mail (SMTP)")).toHaveLength(1);
    expect(within(form).getAllByLabelText(RECIPIENTS_SMTP)).toHaveLength(1);
  });

  it("saving notifications keeps the schedule draft", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await screen.findByRole("dialog", { name: "Quelle StepStone" });
    fireEvent.change(within(panel).getByLabelText("Uhrzeit 1"), { target: { value: "07:30" } });
    const form = await notify();
    await userEvent.selectOptions(
      await within(form).findByLabelText("Vorlage für Pushover"),
      "Kurz",
    );
    await userEvent.click(saveOf(form));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0]).not.toHaveProperty("schedule_times");
    await waitFor(() => expect(saveOf(form)).toHaveAttribute("aria-disabled", "true"));
    expect(within(panel).getByLabelText("Uhrzeit 1")).toHaveValue("07:30");
  });

  it("a test sends the channel's test message at once, also with unsaved edits", async () => {
    const calls = sourcesStubs(undefined, {
      [PUSHOVER_TEST]: { channel_id: PUSHOVER_CHANNEL.id, delivered: true, reason: null },
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.selectOptions(
      await within(form).findByLabelText("Vorlage für Pushover"),
      "Kurz",
    );
    const test = within(form).getByRole("button", { name: "Test über Mein Handy senden" });
    expect(test).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(test);
    expect(await screen.findByText("Test über Mein Handy gesendet.")).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("a test that was not delivered names the reason in a fixed sentence", async () => {
    sourcesStubs(undefined, {
      [PUSHOVER_TEST]: {
        channel_id: PUSHOVER_CHANNEL.id,
        delivered: false,
        reason: "auth_rejected",
      },
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(
      await within(form).findByRole("button", { name: "Test über Mein Handy senden" }),
    );
    expect(
      await screen.findByText("Der Anbieter von Mein Handy hat die Zugangsdaten abgelehnt."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/auth_rejected/)).toBeNull();
  });

  it("a rate-limited test asks to wait, a down service says so, never the server's text", async () => {
    let answer = TOO_MANY_REQUESTS;
    sourcesStubs(undefined, {
      [PUSHOVER_TEST]: () => jsonResponse(answer, { detail: "notification_service_unavailable" }),
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const test = await within(form).findByRole("button", { name: "Test über Mein Handy senden" });
    await userEvent.click(test);
    expect(await screen.findByText("Zu viele Anfragen, bitte kurz warten.")).toBeInTheDocument();
    answer = BAD_GATEWAY;
    await userEvent.click(test);
    expect(
      await screen.findByText(/Der Benachrichtigungsdienst ist gerade nicht erreichbar/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/notification_service_unavailable/)).toBeNull();
  });

  it("keeps a stored text that matches no template", async () => {
    sourcesStubs([{ ...SOURCE_A, pushover_template: "eigener Text $title" }]);
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    expect(await within(form).findByLabelText("Vorlage für Pushover")).toHaveDisplayValue(
      "Eigene Vorlage (beibehalten)",
    );
  });

  it("the kept text can be chosen again after picking another template", async () => {
    const calls = sourcesStubs([{ ...SOURCE_A, pushover_template: "eigener Text $title" }], {
      "PATCH /platforms/1": SOURCE_A,
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const select = await within(form).findByLabelText("Vorlage für Pushover");
    await userEvent.selectOptions(select, "Kurz");
    await userEvent.selectOptions(select, "Eigene Vorlage (beibehalten)");
    expect(saveOf(form)).toHaveAttribute("aria-disabled", "true");
    await userEvent.selectOptions(select, "Standard");
    await userEvent.click(saveOf(form));
    await waitFor(() => expect(patches(calls)[0]).toMatchObject({ pushover_template: null }));
  });

  it("edits of a type switched off again are no unsaved change and raise no hidden error", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const smtp = await within(form).findByLabelText("Firmen-SMTP benachrichtigen");
    await userEvent.click(smtp);
    await userEvent.type(within(form).getByLabelText(RECIPIENTS_SMTP), "kaputt");
    await userEvent.click(smtp);
    expect(saveOf(form)).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(form).getByLabelText("Mein Handy benachrichtigen"));
    await userEvent.click(saveOf(form));
    await waitFor(() =>
      expect(patches(calls)[0]).toMatchObject({
        notification_channel_ids: [],
        smtp_recipients: null,
      }),
    );
  });

  it("an unused type's stored recipients are neither checked nor rewritten", async () => {
    const legacy = ["admin@localhost", "ops@example.com ; extra"];
    const calls = sourcesStubs([{ ...SOURCE_A, mailjet_recipients: legacy }], {
      "PATCH /platforms/1": SOURCE_A,
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.selectOptions(
      await within(form).findByLabelText("Vorlage für Pushover"),
      "Kurz",
    );
    await userEvent.click(saveOf(form));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].mailjet_recipients).toEqual(legacy);
    expect(within(form).queryByRole("alert")).toBeNull();
  });

  it("editing the recipients clears their error until the next save", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("Firmen-SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText(RECIPIENTS_SMTP), "kaputt");
    await userEvent.click(saveOf(form));
    expect(await within(form).findByText(INVALID_RECIPIENTS)).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText(RECIPIENTS_SMTP), "@example.com");
    expect(within(form).queryByText(INVALID_RECIPIENTS)).toBeNull();
  });

  it("a channel list that keeps failing shows the error with a retry, not a skeleton", async () => {
    sourcesStubs(undefined, {
      "GET /notifications/channels": () => jsonResponse(SERVER_ERROR, {}),
    });
    const retrying = new QueryClient({
      defaultOptions: { queries: { retry: RETRIES, retryDelay: RETRY_DELAY_MS } },
    });
    renderWithProviders(<SourcesPage />, retrying);
    const form = await notify();
    expect(
      await within(form).findByText(
        "Die Benachrichtigungs-Einstellungen konnten nicht geladen werden.",
      ),
    ).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(within(form).queryByLabelText("Mein Handy benachrichtigen")).toBeNull();
    retrying.clear();
  });

  it("retry loads the settings after they failed", async () => {
    let fail = true;
    sourcesStubs(undefined, {
      "GET /notification-templates": () =>
        fail ? jsonResponse(SERVER_ERROR, {}) : jsonResponse(200, TEMPLATES),
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const retry = await within(form).findByRole("button", { name: "Erneut versuchen" });
    fail = false;
    await userEvent.click(retry);
    expect(await within(form).findByLabelText("Mein Handy benachrichtigen")).toBeChecked();
  });
});
