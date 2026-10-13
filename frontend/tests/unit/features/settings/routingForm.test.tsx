import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_TASKS } from "@/api/adminPaths";
import { routingWarnings } from "@/features/settings/admin/routing";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { de } from "@/i18n/de";
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
const SETTINGS_PATH = "/admin/settings";
const TASKS = "Aufgaben";
const SERVER_TEXT = "Input should be 'cloud' or 'local'";
const ALL_CLOUD = Object.fromEntries(AI_TASKS.map((task) => [task, "cloud"])) as Record<
  (typeof AI_TASKS)[number],
  "cloud" | "local"
>;

const isCall = (method: string, path: string) => (call: RecordedCall) =>
  call.method === method && new URL(call.url).pathname === path;
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const inTasks = () => within(screen.getByRole("form", { name: TASKS }));
const seg = (task: string) => inTasks().getByRole("group", { name: `Anbieter für ${task}` });
const saveTasks = () => userEvent.click(inTasks().getByRole("button", { name: "Speichern" }));
const refusedWith = (loc: string[]) => () =>
  jsonResponse(HTTP_UNPROCESSABLE, { detail: [{ type: "literal_error", loc, msg: SERVER_TEXT }] });

async function openTasks(routes: RouteTable = {}, settings: object = {}) {
  const calls = stubRoutes(
    adminStubs({ "GET /admin/settings": { ...STORED_AI_SETTINGS, ...settings }, ...routes }),
  );
  renderWithProviders(<SettingsPage />);
  await screen.findByRole("form", { name: TASKS });
  return calls;
}

describe("KI › Aufgaben", () => {
  it("Speichern sends the full map once", async () => {
    const calls = await openTasks({
      "POST /admin/settings": () =>
        jsonResponse(200, { status: "updated", ...STORED_AI_SETTINGS, ai_task_routing: ALL_CLOUD }),
    });
    await userEvent.click(
      within(seg("Lebenslauf anpassen")).getByRole("button", { name: "Cloud (OpenRouter)" }),
    );
    await saveTasks();
    await screen.findByText("KI-Einstellungen gespeichert.");
    const saves = calls.filter(isCall("POST", SETTINGS_PATH));
    expect(saves).toHaveLength(1);
    expect(bodyOf(saves[0])).toEqual({ ai_task_routing: ALL_CLOUD });
    expect(Object.keys((bodyOf(saves[0]) as { ai_task_routing: object }).ai_task_routing)).toEqual([
      ...AI_TASKS,
    ]);
    expect(inTasks().getByRole("button", { name: "Speichern" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("warns when local tasks have no address", async () => {
    const calls = await openTasks(
      {
        "POST /admin/settings": () =>
          jsonResponse(200, { status: "updated", ...STORED_AI_SETTINGS, ollama_base_url: "" }),
      },
      { ollama_base_url: "" },
    );
    expect(inTasks().getByText(de["settings.ai.warnLocal"])).toBeVisible();
    await userEvent.click(within(seg("Stellen bewerten")).getByRole("button", { name: "Lokal" }));
    await saveTasks();
    await screen.findByText("KI-Einstellungen gespeichert.");
    expect(calls.filter(isCall("POST", SETTINGS_PATH))).toHaveLength(1);
  });

  it("does not warn when the local address comes from the environment", async () => {
    await openTasks({}, { ollama_base_url: "", ollama_base_url_from_env: true });
    expect(inTasks().queryByText(de["settings.ai.warnLocal"])).toBeNull();
  });

  it("warns about the missing key only while a task runs in the cloud", async () => {
    await openTasks({}, { openrouter_api_key_set: false });
    expect(inTasks().getByText(de["settings.ai.warnCloud"])).toBeVisible();
    expect(inTasks().queryByText(de["settings.ai.warnLocal"])).toBeNull();
  });

  it("each seg is named after its task", async () => {
    await openTasks();
    expect(screen.getByRole("group", { name: "Anbieter für Lebenslauf anpassen" })).toBeVisible();
    expect(inTasks().getAllByRole("group")).toHaveLength(AI_TASKS.length);
    expect(
      within(seg("Lebenslauf anpassen")).getByRole("button", { name: "Lokal" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(inTasks().queryByText(/cv_tailoring|job_analysis/)).toBeNull();
  });

  it.each([
    ["a refused provider", ["body", "ai_task_routing", "cv_tailoring"]],
    ["an unknown task", ["body", "ai_task_routing"]],
  ])("%s shows a fixed sentence on the form, never the server's", async (_, loc) => {
    await openTasks({ "POST /admin/settings": refusedWith(loc) });
    await userEvent.click(
      within(seg("Lebenslauf anpassen")).getByRole("button", { name: "Cloud (OpenRouter)" }),
    );
    await saveTasks();
    expect(await inTasks().findByText(de["settings.ai.routingRefused"])).toBeVisible();
    expect(screen.queryByText(SERVER_TEXT)).toBeNull();
    expect(screen.queryByText(de["error.invalidInput"])).toBeNull();
  });
});

describe("KI › Aufgaben after a refusal", () => {
  it("the next edit clears the refusal", async () => {
    await openTasks({
      "POST /admin/settings": refusedWith(["body", "ai_task_routing", "cv_tailoring"]),
    });
    await userEvent.click(
      within(seg("Lebenslauf anpassen")).getByRole("button", { name: "Cloud (OpenRouter)" }),
    );
    await saveTasks();
    expect(await inTasks().findByText(de["settings.ai.routingRefused"])).toBeVisible();
    await userEvent.click(within(seg("Tiefenrecherche")).getByRole("button", { name: "Lokal" }));
    expect(inTasks().queryByText(de["settings.ai.routingRefused"])).toBeNull();
  });
});

describe("routingWarnings", () => {
  const routing = { ...ALL_CLOUD, cv_tailoring: "local" as const };
  const settings = { ...STORED_AI_SETTINGS, ai_task_routing: routing };

  it("names what the routed providers lack", () => {
    expect(routingWarnings({ routing, settings })).toEqual([]);
    expect(
      routingWarnings({
        routing,
        settings: { ...settings, ollama_base_url: "", openrouter_api_key_set: false },
      }),
    ).toEqual(["localWithoutUrl", "cloudWithoutKey"]);
  });

  it("counts an address from the environment as set", () => {
    expect(
      routingWarnings({
        routing,
        settings: { ...settings, ollama_base_url: "", ollama_base_url_from_env: true },
      }),
    ).toEqual([]);
  });

  it("does not warn about a provider no task uses", () => {
    expect(
      routingWarnings({ routing: ALL_CLOUD, settings: { ...settings, ollama_base_url: "" } }),
    ).toEqual([]);
  });
});
