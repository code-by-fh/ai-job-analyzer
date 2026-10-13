import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/api/queryClient";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { de } from "@/i18n/de";
import { adminStubs, STORED_AI_SETTINGS } from "../../support/adminRoutes";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { createTestQueryClient, renderWithProviders } from "../../support/render";
import type { RouteTable } from "../../support/stubRoutes";
import { stubRoutes } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=ai"));
afterEach(() => vi.unstubAllGlobals());

const CLOUD = "OpenRouter";
const MODELS_PATH = "/admin/openrouter/models";
const SETTINGS_PATH = "/admin/settings";
const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;
const MODELS = [
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI: GPT-4o mini",
    context_length: 128000,
    pricing: { prompt: "0.00000015", completion: "0.0000006" },
  },
  {
    id: "meta/llama:free",
    name: "Meta: Llama (free)",
    context_length: 8192,
    pricing: { prompt: "0", completion: "0" },
  },
  { id: "x/no-context", name: "X: No context", context_length: null, pricing: {} },
];

const isCall = (method: string, path: string) => (call: RecordedCall) =>
  call.method === method && new URL(call.url).pathname === path;
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const inCloud = () => within(screen.getByRole("form", { name: CLOUD }));
const loadButton = () => inCloud().getByRole("button", { name: "Modelle laden" });

async function openCloud(
  routes: RouteTable = {},
  settings: object = {},
  queryClient = createTestQueryClient(),
) {
  const calls = stubRoutes(
    adminStubs({
      "GET /admin/settings": { ...STORED_AI_SETTINGS, ...settings },
      "GET /admin/openrouter/models": MODELS,
      ...routes,
    }),
  );
  renderWithProviders(<SettingsPage />, queryClient);
  await screen.findByRole("form", { name: CLOUD });
  return calls;
}

async function loadModels() {
  await userEvent.click(loadButton());
  return inCloud().findByRole("combobox", { name: "Modell" });
}

describe("KI › model picker", () => {
  it("loads only on request, then picks a model by its select", async () => {
    const calls = await openCloud({
      "POST /admin/settings": () =>
        jsonResponse(200, {
          status: "updated",
          ...STORED_AI_SETTINGS,
          openrouter_model: "meta/llama:free",
        }),
    });
    expect(calls.filter(isCall("GET", MODELS_PATH))).toEqual([]);
    expect(inCloud().getByRole("textbox", { name: "Modell" })).toHaveValue("openai/gpt-4o-mini");
    const select = await loadModels();
    expect(inCloud().queryByRole("textbox", { name: "Modell" })).toBeNull();
    expect(select).toHaveValue("openai/gpt-4o-mini");
    await userEvent.selectOptions(select, "meta/llama:free");
    await userEvent.click(inCloud().getByRole("button", { name: "Speichern" }));
    await screen.findByText("KI-Einstellungen gespeichert.");
    expect(bodyOf(calls.find(isCall("POST", SETTINGS_PATH)))).toEqual({
      openrouter_model: "meta/llama:free",
    });
  });

  it("names each option with its context and marks free models", async () => {
    await openCloud();
    const select = await loadModels();
    const texts = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(texts).toEqual([
      "OpenAI: GPT-4o mini · 128.000 Token",
      "Meta: Llama (free) · 8.192 Token · kostenlos",
      "X: No context",
    ]);
  });

  it("filters by the search text and by price, the selected model stays", async () => {
    await openCloud();
    const select = await loadModels();
    await userEvent.click(inCloud().getByRole("checkbox", { name: "Nur kostenlose Modelle" }));
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["openai/gpt-4o-mini", "meta/llama:free"]);
    await userEvent.type(inCloud().getByRole("searchbox", { name: "Modell suchen" }), "zzz");
    expect(within(select).getAllByRole("option")).toHaveLength(1);
    expect(inCloud().getByText(de["settings.ai.noModels"])).toBeVisible();
  });

  it("keeps a stored model that is not in the list as an option", async () => {
    await openCloud({}, { openrouter_model: "custom/own-model" });
    const select = await loadModels();
    expect(select).toHaveValue("custom/own-model");
    expect(within(select).getAllByRole("option")[0]).toHaveTextContent("custom/own-model");
  });

  it("Enter in the search field does not save the form", async () => {
    const calls = await openCloud();
    await loadModels();
    await userEvent.type(
      inCloud().getByRole("searchbox", { name: "Modell suchen" }),
      "llama{Enter}",
    );
    expect(calls.filter(isCall("POST", SETTINGS_PATH))).toEqual([]);
  });

  it("waits for a stored key and says why", async () => {
    const calls = await openCloud({}, { openrouter_api_key_set: false });
    expect(loadButton()).toHaveAttribute("aria-disabled", "true");
    expect(loadButton()).toHaveAccessibleDescription(de["settings.ai.reason.no_key"]);
    await userEvent.click(loadButton());
    expect(calls.filter(isCall("GET", MODELS_PATH))).toEqual([]);
  });

  it("waits while a typed key is unsaved", async () => {
    const calls = await openCloud();
    await userEvent.type(inCloud().getByLabelText("API-Schlüssel"), "neu");
    expect(loadButton()).toHaveAttribute("aria-disabled", "true");
    expect(loadButton()).toHaveAccessibleDescription(de["sources.notify.saveFirst"]);
    await userEvent.click(loadButton());
    expect(calls.filter(isCall("GET", MODELS_PATH))).toEqual([]);
  });

  it.each([
    [HTTP_BAD_GATEWAY, { detail: "openrouter_failed" }, de["settings.ai.modelsFailed"]],
    [HTTP_BAD_REQUEST, { detail: "no_key" }, de["settings.ai.reason.no_key"]],
  ])("a %s shows its fixed sentence", async (status, body, text) => {
    await openCloud({ "GET /admin/openrouter/models": () => jsonResponse(status, body) });
    await userEvent.click(loadButton());
    expect(await inCloud().findByText(text)).toBeVisible();
    expect(screen.queryByText(/openrouter_failed|no_key/)).toBeNull();
    expect(inCloud().getByRole("textbox", { name: "Modell" })).toBeVisible();
  });

  it("moves focus to the search field once the list replaces the button", async () => {
    await openCloud();
    await loadModels();
    await waitFor(() =>
      expect(inCloud().getByRole("searchbox", { name: "Modell suchen" })).toHaveFocus(),
    );
  });

  it("a 502 fails after one request, without the app's retries", async () => {
    const calls = await openCloud(
      { "GET /admin/openrouter/models": () => jsonResponse(HTTP_BAD_GATEWAY, {}) },
      {},
      createQueryClient(),
    );
    await userEvent.click(loadButton());
    expect(await inCloud().findByText(de["settings.ai.modelsFailed"])).toBeVisible();
    expect(calls.filter(isCall("GET", MODELS_PATH))).toHaveLength(1);
  });

  it("removing the key also removes the loaded list", async () => {
    await openCloud({
      "POST /admin/settings": () =>
        jsonResponse(200, {
          status: "updated",
          ...STORED_AI_SETTINGS,
          openrouter_api_key_set: false,
        }),
    });
    await loadModels();
    await userEvent.click(inCloud().getByRole("button", { name: "Schlüssel entfernen" }));
    const dialog = await screen.findByRole("dialog", { name: "OpenRouter-Schlüssel entfernen?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Schlüssel entfernen" }));
    expect(await inCloud().findByRole("textbox", { name: "Modell" })).toBeVisible();
    expect(inCloud().queryByRole("combobox", { name: "Modell" })).toBeNull();
    expect(loadButton()).toHaveAccessibleDescription(de["settings.ai.reason.no_key"]);
  });

  it("an empty model adds no empty option", async () => {
    await openCloud();
    await userEvent.clear(inCloud().getByRole("textbox", { name: "Modell" }));
    const select = await loadModels();
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).not.toContain("");
  });
});
