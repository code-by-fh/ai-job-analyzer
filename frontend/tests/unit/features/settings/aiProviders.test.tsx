import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_REASONS } from "@/api/adminPaths";
import { de } from "@/i18n/de";
import { REASON_TEXT } from "@/features/settings/admin/testReasons";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { adminStubs, STORED_AI_SETTINGS } from "../../support/adminRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import type { RouteTable } from "../../support/stubRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=ai"));
afterEach(() => vi.unstubAllGlobals());

const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const SETTINGS_PATH = "/admin/settings";
const CLOUD = "OpenRouter";
const LOCAL = "Lokales Modell (LM Studio, Ollama)";
const TYPED_KEY = "neu-key-geheim";
const AVAILABLE = Array.from({ length: 12 }, (_, index) => `model-${index + 1}`);

const isCall = (method: string, path: string) => (call: RecordedCall) =>
  call.method === method && new URL(call.url).pathname === path;
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const form = (name: string) => screen.getByRole("form", { name });
const inForm = (name: string) => within(form(name));
const resultOf = (name: string) =>
  inForm(name)
    .getAllByRole("status")
    .find((region) => region.classList.contains("conn-result"));
/** POST /admin/settings answers the stored state after the sent patch, like the server. */
const saveAnswering = (patch: object) => () =>
  jsonResponse(200, { status: "updated", ...STORED_AI_SETTINGS, ...patch });

async function openAi(routes: RouteTable = {}) {
  const calls = stubRoutes(adminStubs(routes));
  const view = renderWithProviders(<SettingsPage />);
  await screen.findByRole("form", { name: CLOUD });
  return { calls, ...view };
}

describe("KI › OpenRouter", () => {
  it("the key input starts empty and Speichern sends only a typed key", async () => {
    const { calls } = await openAi({
      "POST /admin/settings": saveAnswering({ openrouter_api_key_set: true }),
    });
    const key = inForm(CLOUD).getByLabelText("API-Schlüssel");
    expect(key).toHaveValue("");
    expect(key).toHaveAttribute("type", "password");
    expect(key).toHaveAttribute("autocomplete", "new-password");
    expect(inForm(CLOUD).getByText("Gespeichert. Leer lassen, um ihn zu behalten.")).toBeVisible();
    await userEvent.type(key, "neu");
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Speichern" }));
    await screen.findByText("KI-Einstellungen gespeichert.");
    expect(bodyOf(calls.find(isCall("POST", SETTINGS_PATH)))).toEqual({
      openrouter_api_key: "neu",
    });
    expect(key).toHaveValue("");
  });

  it("the typed key is in no query or mutation cache entry after save", async () => {
    const { queryClient } = await openAi({
      "POST /admin/settings": saveAnswering({ openrouter_api_key_set: true }),
    });
    await userEvent.type(inForm(CLOUD).getByLabelText("API-Schlüssel"), TYPED_KEY);
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Speichern" }));
    await screen.findByText("KI-Einstellungen gespeichert.");
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toEqual([]));
    const queries = queryClient.getQueryCache().getAll();
    expect(JSON.stringify(queries.map((query) => query.state.data))).not.toContain(TYPED_KEY);
  });

  it("Schlüssel entfernen asks, then sends an empty key", async () => {
    const { calls } = await openAi({
      "POST /admin/settings": saveAnswering({ openrouter_api_key_set: false }),
    });
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Schlüssel entfernen" }));
    const dialog = await screen.findByRole("dialog", { name: "OpenRouter-Schlüssel entfernen?" });
    expect(calls.filter(isCall("POST", SETTINGS_PATH))).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Schlüssel entfernen" }));
    expect(await inForm(CLOUD).findByText("Kein Schlüssel gespeichert.")).toBeVisible();
    expect(bodyOf(calls.find(isCall("POST", SETTINGS_PATH)))).toEqual({ openrouter_api_key: "" });
    expect(inForm(CLOUD).queryByRole("button", { name: "Schlüssel entfernen" })).toBeNull();
    await waitFor(() => expect(inForm(CLOUD).getByLabelText("API-Schlüssel")).toHaveFocus());
  });

  it("an empty model is refused before sending", async () => {
    const { calls } = await openAi();
    await userEvent.clear(inForm(CLOUD).getByLabelText("Modell"));
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Speichern" }));
    expect(await inForm(CLOUD).findByText("Bitte ausfüllen.")).toBeVisible();
    expect(calls.filter(isCall("POST", SETTINGS_PATH))).toEqual([]);
  });

  it.each(TEST_REASONS)("maps the test reason %s to its fixed sentence", async (reason) => {
    await openAi({ "POST /admin/test/openrouter": { ok: false, reason } });
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Verbindung prüfen" }));
    await waitFor(() => expect(resultOf(CLOUD)).toHaveTextContent(de[REASON_TEXT[reason]]));
  });

  it("a successful test names the model", async () => {
    await openAi({ "POST /admin/test/openrouter": { ok: true, model: "openai/gpt-4o-mini" } });
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Verbindung prüfen" }));
    await waitFor(() =>
      expect(resultOf(CLOUD)).toHaveTextContent("Verbindung steht · openai/gpt-4o-mini"),
    );
  });

  it("a rate-limited test says wait, not the server's text", async () => {
    await openAi({
      "POST /admin/test/openrouter": () =>
        jsonResponse(HTTP_TOO_MANY, { error: "Rate limit exceeded: 10 per 1 minute" }),
    });
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Verbindung prüfen" }));
    await waitFor(() =>
      expect(resultOf(CLOUD)).toHaveTextContent("Zu viele Anfragen, bitte kurz warten."),
    );
    expect(resultOf(CLOUD)).not.toHaveTextContent("Rate limit exceeded");
  });

  it("Verbindung prüfen waits while the form is dirty", async () => {
    const { calls } = await openAi();
    await userEvent.type(inForm(CLOUD).getByLabelText("Modell"), "-neu");
    const test = inForm(CLOUD).getByRole("button", { name: "Verbindung prüfen" });
    expect(test).toHaveAttribute("aria-disabled", "true");
    expect(test).toHaveAccessibleDescription("Erst speichern.");
    await userEvent.click(test);
    expect(calls.filter(isCall("POST", "/admin/test/openrouter"))).toEqual([]);
  });
});

describe("KI › Lokales Modell", () => {
  it("the local test lists at most 10 available models and the rest as a count", async () => {
    await openAi({
      "POST /admin/test/ollama": {
        ok: true,
        model: "llama3.1:8b",
        model_found: false,
        available_models: AVAILABLE,
      },
    });
    await userEvent.click(inForm(LOCAL).getByRole("button", { name: "Verbindung prüfen" }));
    const shown = AVAILABLE.slice(0, 10).join(", ");
    await waitFor(() =>
      expect(resultOf(LOCAL)).toHaveTextContent(
        `Modell nicht gefunden. Verfügbar: ${shown} und 2 weitere`,
      ),
    );
  });

  it("a found model says so", async () => {
    await openAi({
      "POST /admin/test/ollama": { ok: true, model: "llama3.1:8b", model_found: true },
    });
    await userEvent.click(inForm(LOCAL).getByRole("button", { name: "Verbindung prüfen" }));
    await waitFor(() => expect(resultOf(LOCAL)).toHaveTextContent("Modell gefunden."));
  });

  it("an address without http is refused before sending", async () => {
    const { calls } = await openAi();
    const address = inForm(LOCAL).getByLabelText("Adresse");
    await userEvent.clear(address);
    await userEvent.type(address, "192.168.1.20:1234");
    await userEvent.click(inForm(LOCAL).getByRole("button", { name: "Speichern" }));
    expect(
      await inForm(LOCAL).findByText("Bitte eine Adresse mit http:// oder https:// eingeben."),
    ).toBeVisible();
    expect(calls.filter(isCall("POST", SETTINGS_PATH))).toEqual([]);
  });

  it("the server's refusal of the address shows a fixed text on the field", async () => {
    const { calls } = await openAi({
      "POST /admin/settings": () =>
        jsonResponse(HTTP_UNPROCESSABLE, {
          detail: [{ loc: ["body", "ollama_base_url"], msg: "must not be a link-local address" }],
        }),
    });
    const address = inForm(LOCAL).getByLabelText("Adresse");
    await userEvent.clear(address);
    await userEvent.type(address, "http://169.254.169.254/v1");
    await userEvent.click(inForm(LOCAL).getByRole("button", { name: "Speichern" }));
    expect(await inForm(LOCAL).findByText(de["settings.ai.urlRefused"])).toBeVisible();
    expect(screen.queryByText(/link-local address/)).toBeNull();
    expect(bodyOf(calls.find(isCall("POST", SETTINGS_PATH)))).toEqual({
      ollama_base_url: "http://169.254.169.254/v1",
    });
  });
});

describe("KI › stale results", () => {
  it("a new key clears the old test result, though a key stays stored", async () => {
    await openAi({
      "POST /admin/test/openrouter": { ok: false, reason: "auth" },
      "POST /admin/settings": saveAnswering({ openrouter_api_key_set: true }),
    });
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Verbindung prüfen" }));
    await waitFor(() => expect(resultOf(CLOUD)).toHaveTextContent(de["settings.ai.reason.auth"]));
    await userEvent.type(inForm(CLOUD).getByLabelText("API-Schlüssel"), "neu");
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Speichern" }));
    await screen.findByText("KI-Einstellungen gespeichert.");
    await waitFor(() => expect(resultOf(CLOUD)).toHaveTextContent(""));
    expect(resultOf(CLOUD)).toBeEmptyDOMElement();
  });

  it("a new address clears the old local result", async () => {
    await openAi({
      "POST /admin/test/ollama": { ok: false, reason: "unreachable" },
      "POST /admin/settings": saveAnswering({}),
    });
    await userEvent.click(inForm(LOCAL).getByRole("button", { name: "Verbindung prüfen" }));
    await waitFor(() =>
      expect(resultOf(LOCAL)).toHaveTextContent(de["settings.ai.reason.unreachable"]),
    );
    const address = inForm(LOCAL).getByLabelText("Adresse");
    await userEvent.clear(address);
    await userEvent.type(address, "http://192.168.1.21:1234/v1");
    await userEvent.click(inForm(LOCAL).getByRole("button", { name: "Speichern" }));
    await screen.findByText("KI-Einstellungen gespeichert.");
    await waitFor(() => expect(resultOf(LOCAL)).toBeEmptyDOMElement());
  });

  it("a test answer that arrives after a save landed is ignored", async () => {
    let answerTest: (response: Response) => void = () => undefined;
    const pendingTest = new Promise<Response>((resolve) => (answerTest = resolve));
    await openAi({
      "POST /admin/test/openrouter": () => pendingTest,
      "POST /admin/settings": saveAnswering({ openrouter_api_key_set: true }),
    });
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Verbindung prüfen" }));
    await userEvent.type(inForm(CLOUD).getByLabelText("API-Schlüssel"), "neu");
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Speichern" }));
    await screen.findByText("KI-Einstellungen gespeichert.");
    answerTest(jsonResponse(200, { ok: false, reason: "auth" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await waitFor(() =>
      expect(inForm(CLOUD).getByRole("button", { name: "Verbindung prüfen" })).not.toHaveAttribute(
        "aria-busy",
      ),
    );
    expect(resultOf(CLOUD)).toBeEmptyDOMElement();
  });

  it("removing the key also drops a typed key", async () => {
    await openAi({ "POST /admin/settings": saveAnswering({ openrouter_api_key_set: false }) });
    const key = inForm(CLOUD).getByLabelText("API-Schlüssel");
    await userEvent.type(key, TYPED_KEY);
    await userEvent.click(inForm(CLOUD).getByRole("button", { name: "Schlüssel entfernen" }));
    const dialog = await screen.findByRole("dialog", { name: "OpenRouter-Schlüssel entfernen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Schlüssel entfernen" }));
    expect(await inForm(CLOUD).findByText("Kein Schlüssel gespeichert.")).toBeVisible();
    expect(key).toHaveValue("");
    expect(inForm(CLOUD).getByRole("button", { name: "Speichern" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("an address without a server is refused before sending", async () => {
    const { calls } = await openAi();
    const address = inForm(LOCAL).getByLabelText("Adresse");
    await userEvent.clear(address);
    await userEvent.type(address, "http:///v1");
    await userEvent.click(inForm(LOCAL).getByRole("button", { name: "Speichern" }));
    expect(await inForm(LOCAL).findByText(de["settings.ai.invalidUrl"])).toBeVisible();
    expect(calls.filter(isCall("POST", SETTINGS_PATH))).toEqual([]);
  });
});
