import type { Page } from "@playwright/test";
import { AI_TASKS } from "../../src/api/adminPaths";
import { AdminServer, adminRoutes } from "./support/adminServer";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const AI_URL = "/settings?section=ai";
const CLOUD = "OpenRouter";
const TASKS = "Aufgaben";
const PAID_MODEL = "openai/gpt-4o-mini";
const FREE_MODEL = "tngtech/deepseek-r1t2-chimera:free";
const LOCAL_URL = "http://192.168.1.20:1234/v1";
const WARN_LOCAL = "Für lokale Aufgaben fehlt die Adresse des lokalen Servers.";

const form = (page: Page, name: string) => page.getByRole("form", { name });
const seg = (page: Page, task: string) =>
  form(page, TASKS).getByRole("group", { name: `Anbieter für ${task}` });

async function openAi(page: Page) {
  await page.goto(AI_URL);
  await expect(page.getByRole("heading", { level: 2, name: "KI" })).toBeVisible();
  await expect(form(page, TASKS)).toBeVisible();
}

async function loadModels(page: Page) {
  await form(page, CLOUD).getByRole("button", { name: "Modelle laden" }).click();
  await expect(form(page, CLOUD).getByRole("combobox", { name: "Modell" })).toBeVisible();
}

/** Segs whose buttons do not fit their frame (a clipped seg leaves the page width alone). */
function clippedSegs(page: Page): Promise<string[]> {
  return form(page, TASKS)
    .locator(".seg")
    .evaluateAll((segs) =>
      segs
        .filter((element) => element.scrollWidth > element.clientWidth)
        .map((element) => element.getAttribute("aria-label") ?? ""),
    );
}

/** True when the first task's seg sits on its name's line (wide), false when it stacks below it. */
async function segBesideName(page: Page): Promise<boolean> {
  const row = form(page, TASKS).locator(".routing-row").first();
  const name = await row.locator(".routing-task").boundingBox();
  const control = await row.locator(".seg").boundingBox();
  return (control?.y ?? 0) < (name?.y ?? 0) + (name?.height ?? 0);
}

test("pick a free model from the loaded list and save", async ({ page, mockApi }) => {
  const admin = new AdminServer();
  admin.row.openrouter_model = PAID_MODEL;
  await mockApi(adminRoutes(admin));
  await openAi(page);
  await loadModels(page);
  // Fix round I1: the button goes with its click, so focus moves on to the search field.
  await expect(form(page, CLOUD).getByRole("searchbox", { name: "Modell suchen" })).toBeFocused();
  await form(page, CLOUD).getByRole("checkbox", { name: "Nur kostenlose Modelle" }).check();
  const select = form(page, CLOUD).getByRole("combobox", { name: "Modell" });
  await expect(select.getByRole("option")).toHaveText([
    "OpenAI: GPT-4o mini · 128.000 Token",
    "TNG: DeepSeek R1T2 Chimera (free) · 163.840 Token · kostenlos",
  ]);
  await select.selectOption(FREE_MODEL);
  await form(page, CLOUD).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("KI-Einstellungen gespeichert.")).toBeVisible();
  expect(admin.saved).toEqual([{ openrouter_model: FREE_MODEL }]);
  await expect(select).toHaveValue(FREE_MODEL);
});

test("route two tasks locally and save", async ({ page, mockApi }) => {
  const admin = new AdminServer();
  admin.row.ollama_base_url = LOCAL_URL;
  await mockApi(adminRoutes(admin));
  await openAi(page);
  await expect(form(page, TASKS).getByText(WARN_LOCAL)).toHaveCount(0);
  await seg(page, "Stellen bewerten").getByRole("button", { name: "Lokal" }).click();
  await seg(page, "Firmen recherchieren").getByRole("button", { name: "Lokal" }).click();
  await form(page, TASKS).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("KI-Einstellungen gespeichert.")).toBeVisible();
  const expected = {
    ...Object.fromEntries(AI_TASKS.map((task) => [task, "cloud"])),
    job_analysis: "local",
    cv_tailoring: "local",
    company_profile: "local",
  };
  expect(admin.saved).toEqual([{ ai_task_routing: expected }]);
  expect(Object.keys(admin.saved[0]?.ai_task_routing as object).sort()).toEqual(
    [...AI_TASKS].sort(),
  );
  expect(admin.answer().ai_task_routing).toEqual(expected);
  await page.reload();
  await expect(form(page, TASKS)).toBeVisible();
  for (const task of ["Stellen bewerten", "Lebenslauf anpassen", "Firmen recherchieren"]) {
    await expect(seg(page, task).getByRole("button", { name: "Lokal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await expect(
    seg(page, "Anschreiben schreiben").getByRole("button", { name: "Cloud (OpenRouter)" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a local task without an address warns, the save still goes through", async ({
  page,
  mockApi,
}) => {
  const admin = new AdminServer();
  await mockApi(adminRoutes(admin));
  await openAi(page);
  await expect(form(page, TASKS).getByText(WARN_LOCAL)).toBeVisible();
  await seg(page, "Lebenslauf anpassen")
    .getByRole("button", { name: "Cloud (OpenRouter)" })
    .click();
  await expect(form(page, TASKS).getByText(WARN_LOCAL)).toHaveCount(0);
  await seg(page, "Tiefenrecherche").getByRole("button", { name: "Lokal" }).click();
  await expect(form(page, TASKS).getByText(WARN_LOCAL)).toBeVisible();
  await form(page, TASKS).getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("KI-Einstellungen gespeichert.")).toBeVisible();
  expect(admin.answer().ai_task_routing.deep_dive).toBe("local");
});

// Fix round M1: the FakeServer locates a routing refusal where pydantic does.
test("the FakeServer refuses a routing map at the real locations", () => {
  const admin = new AdminServer();
  const issues = (sent: object) =>
    (admin.save(sent) as { body: { detail: { loc: string[] }[] } }).body;
  expect(
    issues({ ai_task_routing: { cv_tailoring: "gpu" } }).detail.map((issue) => issue.loc),
  ).toEqual([["body", "ai_task_routing", "cv_tailoring"]]);
  expect(issues({ ai_task_routing: { jobs: "cloud" } }).detail.map((issue) => issue.loc)).toEqual([
    ["body", "ai_task_routing"],
  ]);
  expect(admin.answer().ai_task_routing.cv_tailoring).toBe("local");
});

test("KI › Aufgaben and the model picker: nothing clipped, screenshots in both themes", async ({
  page,
  mockApi,
}) => {
  await mockApi(adminRoutes(new AdminServer()));
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: scheme });
      await openAi(page);
      await loadModels(page);
      await form(page, TASKS).scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await clippedSegs(page)).toEqual([]);
      expect(await segBesideName(page)).toBe(size === "1440");
      await saveScreenshot(page, `settings-ai-routing-${size}-${scheme}`);
    }
  }
});
