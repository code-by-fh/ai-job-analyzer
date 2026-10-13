import type { Page } from "@playwright/test";
import { AdminServer, adminRoutes } from "./support/adminServer";
import { COLOR_SCHEMES, SCREENSHOT_SIZES } from "./support/constants";
import { horizontalOverflow, saveScreenshot } from "./support/page";
import { expect, test } from "./support/test";

const USERS_URL = "/settings?section=users";
const CREATE = "Benutzer anlegen";
const NEW_USER = "jonas";
const NEW_PASSWORD = "e2e-passwort-neu";

const heading = (page: Page) => page.getByRole("heading", { level: 2, name: "Benutzer" });
const userList = (page: Page) => page.getByRole("list", { name: "Benutzer" });
const row = (page: Page, name: string) =>
  userList(page)
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
const createForm = (page: Page) => page.getByRole("form", { name: CREATE });

async function openUsers(page: Page) {
  await page.goto(USERS_URL);
  await expect(heading(page)).toBeVisible();
  await expect(row(page, "admin")).toBeVisible();
}

async function create(page: Page, username: string) {
  await createForm(page).getByLabel("Benutzername").fill(username);
  await createForm(page).getByLabel("Passwort").fill(NEW_PASSWORD);
  await createForm(page).getByRole("button", { name: "Speichern" }).click();
}

// The browser logs each provoked refusal (409) as a console error; nothing else is allowed.
test.describe("refusals", () => {
  test.use({ allowedConsoleErrors: [/status of 409/] });

  test("create a member, refuse a duplicate, delete with confirmation", async ({
    page,
    mockApi,
  }) => {
    const admin = new AdminServer();
    await mockApi(adminRoutes(admin));
    const listed = page.waitForRequest(/\/users\?limit=200$/);
    await openUsers(page);
    await listed;
    await expect(row(page, "admin")).toContainText("(du)");
    await expect(row(page, "admin").getByRole("button")).toHaveCount(0);
    await expect(row(page, "lena").getByRole("button")).toHaveCount(0);

    await create(page, NEW_USER);
    await expect(page.getByText("Benutzer angelegt.")).toBeVisible();
    await expect(row(page, NEW_USER)).toContainText("Mitglied");
    await expect(createForm(page).getByLabel("Benutzername")).toHaveValue("");
    await expect(createForm(page).getByLabel("Passwort")).toHaveValue("");
    expect(await page.content()).not.toContain(NEW_PASSWORD);

    await create(page, "JONAS");
    await expect(createForm(page).getByText("Diesen Benutzernamen gibt es schon.")).toBeVisible();
    expect(admin.users.filter((user) => user.username.toLowerCase() === NEW_USER)).toHaveLength(1);

    await row(page, NEW_USER)
      .getByRole("button", { name: `${NEW_USER} löschen` })
      .click();
    const dialog = page.getByRole("dialog", { name: `${NEW_USER} löschen?` });
    await expect(dialog).toContainText("Das lässt sich nicht rückgängig machen.");
    await dialog.getByRole("button", { name: "Benutzer löschen" }).click();
    await expect(page.getByText("Benutzer gelöscht.")).toBeVisible();
    await expect(row(page, NEW_USER)).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
    expect(admin.users.map((user) => user.username)).not.toContain(NEW_USER);
  });

  test("a refused delete shows the fixed sentence and keeps the user", async ({
    page,
    mockApi,
  }) => {
    const admin = new AdminServer();
    admin.crawlRunning = true;
    await mockApi(adminRoutes(admin));
    await openUsers(page);
    const remove = row(page, "mara").getByRole("button", { name: "mara löschen" });
    await remove.click();
    await page.getByRole("dialog").getByRole("button", { name: "Benutzer löschen" }).click();
    await expect(
      page.getByText("Gerade läuft eine Suche. Versuche es nach ihrem Ende erneut."),
    ).toBeVisible();
    await expect(row(page, "mara")).toBeVisible();
    await expect(remove).toBeFocused();
  });
});

test("Benutzer: no horizontal scroll, screenshots in both themes", async ({ page, mockApi }) => {
  await mockApi(adminRoutes(new AdminServer()));
  for (const [size, viewport] of SCREENSHOT_SIZES) {
    for (const scheme of COLOR_SCHEMES) {
      await page.setViewportSize(viewport);
      // The dialog's fade-in would otherwise still show the page through the panel.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openUsers(page);
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-users-${size}-${scheme}`);
      await row(page, "mara").getByRole("button", { name: "mara löschen" }).click();
      await expect(page.getByRole("dialog", { name: "mara löschen?" })).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await horizontalOverflow(page)).toBe(0);
      await saveScreenshot(page, `settings-users-delete-${size}-${scheme}`);
    }
  }
});
