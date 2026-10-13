import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourcesPage } from "@/features/sources/SourcesPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { SOURCE_A, sourcesStubs, TEMPLATES } from "../../support/sourcesRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/sources"),
);

const NOW = new Date("2026-10-08T10:00:00+02:00");
const BAD_REQUEST = 400;
const SERVER_ERROR = 500;
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
  it("an unconfigured channel cannot be switched on and points to the settings", async () => {
    sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    expect(await within(form).findByLabelText("Mailjet benachrichtigen")).toBeDisabled();
    expect(
      within(form).getAllByRole("link", { name: "In den Einstellungen einrichten" })[0],
    ).toHaveAttribute("href", "/settings?section=notifications");
  });

  it("an active channel without credentials can still be switched off", async () => {
    sourcesStubs([{ ...SOURCE_A, notification_adapters: ["PUSHOVER", "MAILJET"] }]);
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const mailjet = await within(form).findByLabelText("Mailjet benachrichtigen");
    expect(mailjet).toBeEnabled();
    await userEvent.click(mailjet);
    expect(mailjet).not.toBeChecked();
    expect(mailjet).toBeDisabled();
  });

  it("an email channel needs a valid recipient", async () => {
    const calls = sourcesStubs();
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText("Empfänger"), "ich@example.com, kaputt");
    await userEvent.click(saveOf(form));
    expect(
      await within(form).findByText("Gib mindestens eine gültige E-Mail-Adresse ein."),
    ).toBeInTheDocument();
    expect(patches(calls)).toEqual([]);
  });

  it("saves all notification fields, a chosen template as its content", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(await within(form).findByLabelText("SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText("Empfänger"), "ich@example.com");
    await userEvent.selectOptions(
      within(form).getByLabelText("Vorlage für SMTP"),
      "Wochenmail (global)",
    );
    await userEvent.click(saveOf(form));
    await waitFor(() =>
      expect(patches(calls)).toEqual([
        {
          notification_adapters: ["PUSHOVER", "SMTP"],
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

  it("saving notifications keeps the schedule draft", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const panel = await screen.findByRole("dialog", { name: "Quelle StepStone" });
    fireEvent.change(within(panel).getByLabelText("Uhrzeit"), { target: { value: "07:30" } });
    const form = await notify();
    await userEvent.selectOptions(
      await within(form).findByLabelText("Vorlage für Pushover"),
      "Kurz",
    );
    await userEvent.click(saveOf(form));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0]).not.toHaveProperty("schedule_time");
    await waitFor(() => expect(saveOf(form)).toHaveAttribute("aria-disabled", "true"));
    expect(within(panel).getByLabelText("Uhrzeit")).toHaveValue("07:30");
  });

  it("a test send waits for a save and names a missing setup", async () => {
    sourcesStubs(undefined, {
      "PATCH /platforms/1": SOURCE_A,
      "POST /platforms/1/test-pushover": () =>
        jsonResponse(BAD_REQUEST, { detail: "Pushover credentials not configured" }),
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const test = await within(form).findByRole("button", { name: "Test über Pushover senden" });
    await userEvent.selectOptions(within(form).getByLabelText("Vorlage für Pushover"), "Kurz");
    expect(test).toHaveAttribute("aria-disabled", "true");
    expect(test).toHaveAccessibleDescription("Erst speichern.");
    await userEvent.click(saveOf(form));
    await waitFor(() => expect(test).not.toHaveAttribute("aria-disabled", "true"));
    await userEvent.click(test);
    expect(
      await screen.findByText("Für Pushover fehlen Zugangsdaten oder Empfänger."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/credentials not configured/)).toBeNull();
  });

  it("a sent test says so and only active channels offer one", async () => {
    const calls = sourcesStubs(undefined, { "POST /platforms/1/test-pushover": { ok: true } });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(
      await within(form).findByRole("button", { name: "Test über Pushover senden" }),
    );
    expect(await screen.findByText("Test über Pushover gesendet.")).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(within(form).queryByRole("button", { name: "Test über SMTP senden" })).toBeNull();
  });

  it("a failed test send names the channel, not the server's reason", async () => {
    sourcesStubs([{ ...SOURCE_A, notification_adapters: ["SMTP"], smtp_recipients: ["a@b.de"] }], {
      "POST /platforms/1/test-smtp": () => jsonResponse(SERVER_ERROR, { detail: "SMTP boom" }),
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(
      await within(form).findByRole("button", { name: "Test über SMTP senden" }),
    );
    expect(await screen.findByText("Senden über SMTP hat nicht geklappt.")).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it("a rate-limited test send asks to wait, without the server's text", async () => {
    sourcesStubs([{ ...SOURCE_A, notification_adapters: ["PUSHOVER"] }], {
      "POST /platforms/1/test-pushover": () =>
        jsonResponse(TOO_MANY_REQUESTS, { error: "Rate limit exceeded: 5 per 1 minute" }),
    });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    await userEvent.click(
      await within(form).findByRole("button", { name: "Test über Pushover senden" }),
    );
    expect(await screen.findByText("Zu viele Anfragen, bitte kurz warten.")).toBeInTheDocument();
    expect(screen.queryByText(/Rate limit exceeded|hat nicht geklappt/)).toBeNull();
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

  it("edits of a channel switched off again are no unsaved change and raise no hidden error", async () => {
    const calls = sourcesStubs(undefined, { "PATCH /platforms/1": SOURCE_A });
    renderWithProviders(<SourcesPage />);
    const form = await notify();
    const smtp = await within(form).findByLabelText("SMTP benachrichtigen");
    await userEvent.click(smtp);
    await userEvent.type(within(form).getByLabelText("Empfänger"), "kaputt");
    await userEvent.click(smtp);
    expect(saveOf(form)).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(form).getByLabelText("Pushover benachrichtigen"));
    await userEvent.click(saveOf(form));
    await waitFor(() =>
      expect(patches(calls)[0]).toMatchObject({
        notification_adapters: [],
        smtp_recipients: null,
      }),
    );
  });

  it("an off channel's stored recipients are neither checked nor rewritten", async () => {
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
    await userEvent.click(await within(form).findByLabelText("SMTP benachrichtigen"));
    await userEvent.type(within(form).getByLabelText("Empfänger"), "kaputt");
    await userEvent.click(saveOf(form));
    const message = "Gib mindestens eine gültige E-Mail-Adresse ein.";
    expect(await within(form).findByText(message)).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText("Empfänger"), "@example.com");
    expect(within(form).queryByText(message)).toBeNull();
    await userEvent.click(within(form).getByLabelText("SMTP benachrichtigen"));
    await userEvent.click(within(form).getByLabelText("SMTP benachrichtigen"));
    expect(within(form).queryByText(message)).toBeNull();
  });

  it("a channel status that keeps failing shows the error with a retry, not a skeleton", async () => {
    sourcesStubs(undefined, {
      "GET /notification-settings/channels": () => jsonResponse(SERVER_ERROR, {}),
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
    expect(within(form).queryByLabelText("Pushover benachrichtigen")).toBeNull();
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
    expect(await within(form).findByLabelText("Pushover benachrichtigen")).toBeChecked();
  });
});
