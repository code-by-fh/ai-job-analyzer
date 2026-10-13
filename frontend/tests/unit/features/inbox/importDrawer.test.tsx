import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import { STALL_AFTER_MS } from "@/domain/pendingTasks";
import { ImportButton } from "@/features/inbox/import/ImportButton";
import type { Language } from "@/i18n/languages";
import { languageStore } from "@/i18n/useI18n";
import { CLOCK_TICK_MS } from "@/lib/clock";
import {
  EMPTY_IMPORTS,
  IMPORT_EXPIRE_AFTER_MS,
  trackImport,
  type ImportState,
} from "@/realtime/imports";
import { expireStalledImports, setImportFinishedListener } from "@/realtime/importSignals";
import { jsonResponse } from "../../support/fakeFetch";
import { HTTP_OK, SETUP_DONE } from "../../support/inboxRoutes";
import { renderWithProviders } from "../../support/render";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

const URL_OK = "https://karriere.example.de/jobs/1";
const CRAWL_ID = "crawl-9";
const STARTED = { status: "Started", job_id: CRAWL_ID };
const HTTP_UNPROCESSABLE = 422;
// useNow() keeps the snapshot taken at mount, so the entry must start one clock tick past the
// stall time before that snapshot; it stays short of the expiry (2 x STALL_AFTER_MS).
const STALLED_START = () => Date.now() - STALL_AFTER_MS - CLOCK_TICK_MS;
const OPEN_IMPORT = "Per URL importieren: eine einzelne Stelle";

function setup(routes: RouteTable = {}) {
  const calls = stubRoutes({
    "GET /setup-status": SETUP_DONE,
    "GET /scraper/crawl-status": { jobs: [] },
    "POST /scraper/import-job": STARTED,
    ...routes,
  });
  return { calls, ...renderWithProviders(<ImportButton />) };
}

async function openDrawer() {
  await userEvent.click(screen.getByRole("button", { name: OPEN_IMPORT }));
}

async function submit(url: string) {
  await openDrawer();
  await userEvent.type(screen.getByLabelText("Link zur Stellenanzeige"), url);
  await userEvent.click(screen.getByRole("button", { name: "Importieren und bewerten" }));
}

const imports = (queryClient: QueryClient) =>
  queryClient.getQueryData<ImportState>(queryKeys.imports);

afterEach(() => {
  languageStore.set("de");
});

describe("import drawer", () => {
  // WCAG 2.5.3 (label in name): speech users say what they see, so the name starts with it.
  it.each<Language>(["de", "en"])(
    "names the trigger starting with its visible label (%s)",
    (lang) => {
      languageStore.set(lang);
      setup();
      const trigger = screen.getByRole("button");
      const visible = trigger.textContent ?? "";
      expect(visible).not.toBe("");
      expect(trigger.getAttribute("aria-label")?.startsWith(visible)).toBe(true);
    },
  );

  it("shows its short label next to the icon, named in full", () => {
    setup();
    expect(screen.getByRole("button", { name: OPEN_IMPORT })).toHaveTextContent(
      "Per URL importieren",
    );
  });

  it("focuses the link field when it opens", async () => {
    setup();
    await openDrawer();
    expect(screen.getByLabelText("Link zur Stellenanzeige")).toHaveFocus();
  });

  it("checks the link before sending it", async () => {
    const { calls } = setup();
    await submit("karriere.example/job");
    expect(
      screen.getByText("Bitte einen vollständigen Link angeben, der mit https:// beginnt."),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("starts the import, tracks its crawl and focuses the progress", async () => {
    const { calls, queryClient } = setup();
    await submit(URL_OK);
    const status = await within(screen.getByRole("dialog")).findByRole("status");
    expect(status).toHaveTextContent("Anzeige wird gelesen …");
    expect(status).toHaveFocus();
    const post = calls.find((call) => call.method === "POST");
    expect(JSON.parse(post?.body ?? "null")).toEqual({ url: URL_OK });
    expect(imports(queryClient)).toHaveProperty(CRAWL_ID);
  });

  it("closes when the server reports the end and opens fresh again", async () => {
    const { queryClient } = setup();
    await submit(URL_OK);
    await screen.findByText("Anzeige wird gelesen …");
    act(() => queryClient.setQueryData(queryKeys.imports, EMPTY_IMPORTS));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openDrawer();
    expect(screen.getByLabelText("Link zur Stellenanzeige")).toHaveValue("");
  });

  it("sends the link once while the start is still running", async () => {
    let answer: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { calls } = setup({ "POST /scraper/import-job": () => pending });
    await submit(URL_OK);
    await userEvent.click(screen.getByRole("button", { name: "Importieren und bewerten" }));
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    await act(async () => answer(jsonResponse(HTTP_OK, STARTED)));
    expect(await screen.findByText("Anzeige wird gelesen …")).toBeInTheDocument();
  });

  it("says when the import could not start, without the server text", async () => {
    setup({
      "POST /scraper/import-job": { status: "Error", message: "URL muss mit http(s) beginnen." },
    });
    await submit(URL_OK);
    expect(
      await screen.findByText("Der Import konnte nicht starten. Bitte prüfe den Link."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/URL muss/)).not.toBeInTheDocument();
  });

  it("reads a refused link (422) like the scraper's refusal", async () => {
    const refused = jsonResponse(HTTP_UNPROCESSABLE, {
      detail: [{ loc: ["body", "url"], msg: "invalid url", type: "value_error" }],
    });
    setup({ "POST /scraper/import-job": () => refused });
    await submit(URL_OK);
    expect(
      await screen.findByText("Der Import konnte nicht starten. Bitte prüfe den Link."),
    ).toBeInTheDocument();
  });

  it("announces when the import takes unusually long", async () => {
    const { queryClient } = setup();
    await submit(URL_OK);
    await screen.findByText("Anzeige wird gelesen …");
    const stalled = trackImport(EMPTY_IMPORTS, CRAWL_ID, STALLED_START());
    act(() => queryClient.setQueryData(queryKeys.imports, stalled));
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent(
        "Das dauert ungewöhnlich lange.",
      ),
    );
  });

  it("forgets a stalled import on a new attempt and focuses the field", async () => {
    const { queryClient } = setup();
    const finished = vi.fn();
    setImportFinishedListener(queryClient, finished);
    await submit(URL_OK);
    await screen.findByText("Anzeige wird gelesen …");
    const stalled = trackImport(EMPTY_IMPORTS, CRAWL_ID, STALLED_START());
    act(() => queryClient.setQueryData(queryKeys.imports, stalled));
    await userEvent.click(await screen.findByRole("button", { name: "Noch einmal versuchen" }));
    expect(screen.getByLabelText("Link zur Stellenanzeige")).toHaveFocus();
    expireStalledImports(queryClient, Date.now() + IMPORT_EXPIRE_AFTER_MS);
    expect(finished).not.toHaveBeenCalled();
    expect(imports(queryClient)).not.toHaveProperty(CRAWL_ID);
  });

  it("warns that a job cannot be scored without a profile", async () => {
    setup({ "GET /setup-status": { ...SETUP_DONE, profile_complete: false } });
    await openDrawer();
    expect(
      await screen.findByText("Ohne Profil kann die Stelle nicht bewertet werden."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profil öffnen" })).toHaveAttribute("href", "/profile");
  });

  it("opens a fresh form after it was closed", async () => {
    setup();
    await openDrawer();
    await userEvent.type(screen.getByLabelText("Link zur Stellenanzeige"), "karriere");
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await openDrawer();
    expect(screen.getByLabelText("Link zur Stellenanzeige")).toHaveValue("");
  });

  it("gives the focus back to the trigger when it is closed", async () => {
    setup();
    await openDrawer();
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.getByRole("button", { name: OPEN_IMPORT })).toHaveFocus();
  });

  it("gives the focus back to the trigger on Escape", async () => {
    setup();
    await openDrawer();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: OPEN_IMPORT })).toHaveFocus();
  });

  it("gives the focus back to the trigger when the import ends", async () => {
    const { queryClient } = setup();
    await submit(URL_OK);
    await screen.findByText("Anzeige wird gelesen …");
    act(() => queryClient.setQueryData(queryKeys.imports, EMPTY_IMPORTS));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: OPEN_IMPORT })).toHaveFocus();
  });
});
