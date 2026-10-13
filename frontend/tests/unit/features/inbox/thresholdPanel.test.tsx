import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { INBOX_TRIAGE_KEY, INBOX_TRIAGE_SCOPE } from "@/api/queryKeys";
import { SCORE_BUCKETS } from "@/api/threshold";
import { ThresholdPanel } from "@/features/inbox/threshold/ThresholdPanel";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { HTTP_OK } from "../../support/inboxRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

const SCORES = [40, 55, 72, 86];
const SAVED = 60;
const BAND_60 = "Mögliche und starke Treffer kommen in den Eingang";
const HTTP_SERVER_ERROR = 500;
const FAILED = () => jsonResponse(HTTP_SERVER_ERROR, { detail: "boom" });

const countsOf = (scores: readonly number[]) =>
  Array.from({ length: SCORE_BUCKETS }, (_, score) => scores.filter((s) => s === score).length);

const preview = (call: RecordedCall) => {
  const threshold = Number(new URL(call.url).searchParams.get("threshold"));
  return jsonResponse(HTTP_OK, {
    threshold,
    would_archive: threshold >= 70 ? 1 : 0,
    would_restore: 0,
  });
};

/** A stateful settings endpoint: the POST changes what the next GET /settings answers. */
function thresholdServer(saved: number) {
  let current = saved;
  return {
    "GET /settings": () => jsonResponse(HTTP_OK, { language: "de", match_threshold: current }),
    "POST /matching-preference": (call: RecordedCall) => {
      const { match_threshold } = JSON.parse(call.body ?? "{}") as { match_threshold: number };
      current = match_threshold;
      return jsonResponse(HTTP_OK, { status: "saved", match_threshold, archived: 1, restored: 0 });
    },
  };
}

function setup(extra: RouteTable = {}, scores: readonly number[] = SCORES) {
  const calls = stubRoutes({
    ...thresholdServer(SAVED),
    "GET /matching-preference/distribution": { counts: countsOf(scores) },
    "GET /matching-preference/preview": preview,
    ...extra,
  });
  const { queryClient } = renderWithProviders(<ThresholdPanel />);
  return { calls, queryClient };
}

const posts = (calls: RecordedCall[]) =>
  calls
    .filter((call) => call.method === "POST")
    .map((call) => JSON.parse(call.body ?? "null") as unknown);

// The toast stack keeps its own alert region, so the panel's alerts are looked up inside it.
const panelAlerts = () =>
  within(screen.getByRole("region", { name: "Schwellwert" })).queryAllByRole("alert");

const FIELD_LABEL = "Schwellwert für automatisches Aussortieren";
const SERVER_ERROR_TEXT =
  "Der Server hat einen Fehler gemeldet. Bitte versuche es gleich noch einmal.";
const PREVIEW_DEBOUNCE_MS = 300;
const numberField = () => screen.getByRole("spinbutton", { name: FIELD_LABEL });
const applyButton = () => screen.getByRole("button", { name: "Übernehmen" });
const settleDebounce = () =>
  new Promise((resolve) => setTimeout(resolve, PREVIEW_DEBOUNCE_MS + 100));
const previewRequests = (calls: RecordedCall[]) =>
  calls
    .filter((call) => call.url.includes("/matching-preference/preview"))
    .map((call) => new URL(call.url).searchParams.get("threshold"));
const liveRegion = () => {
  const region = screen
    .getByRole("region", { name: "Schwellwert" })
    .querySelector('[aria-live="polite"]');
  if (!region) throw new Error("no persistent live region in the panel");
  return region as HTMLElement;
};

/** A response the test releases later. */
function deferred() {
  let release: () => void = () => undefined;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { response, release };
}

describe("ThresholdPanel", () => {
  it("shows the saved threshold, its band and the distribution", async () => {
    setup();
    expect(await screen.findByText(BAND_60)).toBeInTheDocument();
    expect(numberField()).toHaveValue(SAVED);
    expect(
      await screen.findByRole("img", { name: "Verteilung: 4 Stellen, 2 davon unter 60" }),
    ).toBeInTheDocument();
    expect(applyButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("previews a new value", async () => {
    setup();
    await screen.findByText(BAND_60);
    fireEvent.change(numberField(), { target: { value: "70" } });
    expect(
      await screen.findByText("Bei 70: 1 Treffer würden ausgeblendet, 0 kämen zurück."),
    ).toBeInTheDocument();
    // 70 is still in the "possible" band.
    expect(screen.getByText(BAND_60)).toBeInTheDocument();
  });

  it("shows the server's preview count where the distribution buckets disagree", async () => {
    // A job scored 59.6 sits in bucket 60 of the distribution, but the server archives it at 60
    // (match_score < threshold on the raw float): the client counts 2 below 60, the server 3.
    const serverCount = (call: RecordedCall) =>
      jsonResponse(HTTP_OK, {
        threshold: Number(new URL(call.url).searchParams.get("threshold")),
        would_archive: 3,
        would_restore: 0,
      });
    setup(
      { ...thresholdServer(50), "GET /matching-preference/preview": serverCount },
      [40, 55, 60, 72, 86],
    );
    await screen.findByText("Auch schwache Treffer kommen in den Eingang");
    fireEvent.change(numberField(), { target: { value: "60" } });
    expect(
      await screen.findByText("Bei 60: 3 Treffer würden ausgeblendet, 0 kämen zurück."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Verteilung: 5 Stellen, 2 davon unter 60" }),
    ).toBeInTheDocument();
  });

  it("applies the shown value at once and undoes to the saved one", async () => {
    const { calls } = setup();
    await screen.findByText(BAND_60);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "75" } });
    await userEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(
      await screen.findByText("Schwellwert 75 übernommen: 1 ausgeblendet, 0 zurückgeholt."),
    ).toBeInTheDocument();
    expect(numberField()).toHaveValue(75);
    await userEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
    expect(
      await screen.findByText("Rückgängig gemacht: Schwellwert wieder 60."),
    ).toBeInTheDocument();
    await waitFor(() => expect(numberField()).toHaveValue(SAVED));
    expect(posts(calls)).toEqual([
      { match_threshold: 75, apply_to_existing: true },
      { match_threshold: 60, apply_to_existing: true },
    ]);
  });

  it("resets an unsaved change", async () => {
    setup();
    await screen.findByText(BAND_60);
    fireEvent.change(numberField(), { target: { value: "80" } });
    await userEvent.click(screen.getByRole("button", { name: "Zurücksetzen" }));
    expect(numberField()).toHaveValue(SAVED);
  });

  it("keeps focus on Übernehmen after a keyboard apply and ignores a second Enter", async () => {
    const { calls } = setup();
    await screen.findByText(BAND_60);
    fireEvent.change(numberField(), { target: { value: "75" } });
    applyButton().focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByText("Schwellwert 75 übernommen: 1 ausgeblendet, 0 zurückgeholt.");
    expect(applyButton()).toHaveFocus();
    expect(applyButton()).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Enter}");
    expect(posts(calls)).toEqual([{ match_threshold: 75, apply_to_existing: true }]);
  });

  it("moves focus to the number field after Zurücksetzen", async () => {
    setup();
    await screen.findByText(BAND_60);
    fireEvent.change(numberField(), { target: { value: "80" } });
    await userEvent.click(screen.getByRole("button", { name: "Zurücksetzen" }));
    expect(numberField()).toHaveFocus();
  });

  it("waits for a running inbox triage before it applies", async () => {
    const { calls, queryClient } = setup();
    let finishTriage = () => {};
    const triage = queryClient.getMutationCache().build(queryClient, {
      mutationKey: INBOX_TRIAGE_KEY,
      scope: INBOX_TRIAGE_SCOPE,
      mutationFn: () => new Promise<void>((resolve) => (finishTriage = resolve)),
    });
    const running = triage.execute(undefined);
    await screen.findByText(BAND_60);
    fireEvent.change(numberField(), { target: { value: "75" } });
    await userEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(posts(calls)).toEqual([]);
    finishTriage();
    await running;
    await waitFor(() =>
      expect(posts(calls)).toEqual([{ match_threshold: 75, apply_to_existing: true }]),
    );
  });

  it("shows an error with retry when the threshold cannot be loaded", async () => {
    setup({ "GET /settings": FAILED });
    await waitFor(() => expect(panelAlerts()).toHaveLength(1));
    expect(panelAlerts()[0]).toHaveTextContent("Der Schwellwert konnte nicht geladen werden.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });

  it("shows the distribution and preview failures as errors", async () => {
    setup({
      "GET /matching-preference/distribution": FAILED,
      "GET /matching-preference/preview": FAILED,
    });
    await screen.findByText(BAND_60);
    expect(await screen.findByText("Die Verteilung konnte nicht geladen werden.")).toBeVisible();
    fireEvent.change(numberField(), { target: { value: "70" } });
    await waitFor(() => expect(panelAlerts()).toHaveLength(2));
    const previewError = panelAlerts()[1]!;
    expect(previewError).toHaveTextContent(SERVER_ERROR_TEXT);
    expect(within(previewError).getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  });

  it("labels the slider with the number field's label, not a second string", async () => {
    setup();
    await screen.findByText(BAND_60);
    const slider = screen.getByRole("slider", { name: FIELD_LABEL });
    expect(slider).not.toHaveAttribute("aria-label");
    expect(slider).toHaveAttribute("aria-valuetext", `60: ${BAND_60}`);
  });
});

describe("ThresholdPanel number field (R17)", () => {
  it("keeps an emptied field empty, previews nothing and cannot apply 0", async () => {
    const { calls } = setup();
    await screen.findByText(BAND_60);
    await userEvent.clear(numberField());
    expect(numberField()).toHaveDisplayValue("");
    await settleDebounce();
    expect(previewRequests(calls)).toEqual([]);
    expect(applyButton()).toHaveAttribute("aria-disabled", "true");
    await userEvent.tab();
    expect(numberField()).toHaveValue(SAVED);
  });

  it("disables Übernehmen while a changed value is cleared", async () => {
    const { calls } = setup();
    await screen.findByText(BAND_60);
    fireEvent.change(numberField(), { target: { value: "70" } });
    await screen.findByText("Bei 70: 1 Treffer würden ausgeblendet, 0 kämen zurück.");
    fireEvent.change(numberField(), { target: { value: "" } });
    expect(applyButton()).toHaveAttribute("aria-disabled", "true");
    await settleDebounce();
    expect(previewRequests(calls)).not.toContain("0");
  });

  it("moves the slider to a typed value that is not a multiple of 5", async () => {
    setup();
    await screen.findByText(BAND_60);
    fireEvent.change(numberField(), { target: { value: "72" } });
    expect(screen.getByRole("slider")).toHaveValue("72");
  });
});

describe("ThresholdPanel while saving", () => {
  it("keeps a value changed while the apply was running", async () => {
    const server = thresholdServer(SAVED);
    const held = deferred();
    setup({
      "POST /matching-preference": (call: RecordedCall) =>
        held.response.then(() => server["POST /matching-preference"](call)),
    });
    await screen.findByText(BAND_60);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "75" } });
    await userEvent.click(applyButton());
    fireEvent.change(screen.getByRole("slider"), { target: { value: "80" } });
    held.release();
    await screen.findByText("Schwellwert 75 übernommen: 1 ausgeblendet, 0 zurückgeholt.");
    expect(numberField()).toHaveValue(80);
    expect(applyButton()).not.toHaveAttribute("aria-disabled");
  });

  it("does not apply while an undo is still running", async () => {
    const server = thresholdServer(SAVED);
    const held = deferred();
    let posted = 0;
    const calls = setup({
      "POST /matching-preference": (call: RecordedCall) => {
        posted += 1;
        const answer = () => server["POST /matching-preference"](call);
        return posted === 1 ? answer() : held.response.then(answer);
      },
    }).calls;
    await screen.findByText(BAND_60);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "75" } });
    await userEvent.click(applyButton());
    await userEvent.click(await screen.findByRole("button", { name: "Rückgängig" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "80" } });
    expect(applyButton()).toHaveAttribute("aria-busy", "true");
    await userEvent.click(applyButton());
    expect(posts(calls)).toHaveLength(2);
    held.release();
    await screen.findByText("Rückgängig gemacht: Schwellwert wieder 60.");
  });

  it("announces only the settled server count, never the loading text", async () => {
    setup();
    await screen.findByText(BAND_60);
    const live = liveRegion();
    fireEvent.change(numberField(), { target: { value: "70" } });
    expect(screen.getByText("Wird berechnet …")).toBeInTheDocument();
    expect(live).toHaveTextContent(/^$/);
    await waitFor(() =>
      expect(live).toHaveTextContent("Bei 70: 1 Treffer würden ausgeblendet, 0 kämen zurück."),
    );
    expect(liveRegion()).toBe(live);
  });
});
