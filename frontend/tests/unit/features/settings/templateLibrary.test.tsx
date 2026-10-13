import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUserBody } from "@/api/auth";
import type { NotificationTemplateBody } from "@/api/notifications";
import { queryKeys } from "@/api/queryKeys";
import { NOTIFICATION_LIMITS } from "@/api/settingsPaths";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { jsonResponse, type RecordedCall } from "../../support/fakeFetch";
import { liveNavigation } from "../../support/liveNavigation";
import { renderWithProviders } from "../../support/render";
import { settingsStubs } from "../../support/settingsRoutes";
import { stubRoutes, type RouteTable } from "../../support/stubRoutes";

vi.mock("next/navigation", async () =>
  (await import("../../support/liveNavigation")).navigationModule("/settings"),
);

beforeEach(() => liveNavigation.reset("section=notifications"));
afterEach(() => vi.unstubAllGlobals());

const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const ADMIN: CurrentUserBody = { id: 1, username: "admin", is_admin: true };
const TEMPLATES: NotificationTemplateBody[] = [
  { id: 31, name: "Kurz", type: "PUSHOVER", content: "$title bei $company", is_admin: false },
  { id: 32, name: "Digest", type: "MAILJET", content: "<p>$title</p>", is_admin: true },
  { id: 33, name: "Wochenmail", type: "RESEND", content: "<p>Woche</p>", is_admin: false },
];
const CREATED: NotificationTemplateBody = {
  id: 40,
  name: "Neu",
  type: "RESEND",
  content: "<p>x</p>",
  is_admin: false,
};
const HOSTILE_PREVIEW = {
  html: true,
  body:
    '<script>window.__x=1</script><img src=x onerror="window.__x=1"><a href="https://evil.example">x</a>' +
    '<div><template shadowrootmode="open"><a href="https://evil.example/shadow">s</a></template></div><p>Hi</p>',
};

const isCallTo = (method: string, path: string) => (call: RecordedCall) =>
  call.method === method && new URL(call.url).pathname === path;
const bodyOf = (call: RecordedCall | undefined) => JSON.parse(call?.body ?? "null") as unknown;
const library = () => screen.getByRole("region", { name: "Vorlagen" });
const group = (name: string) => within(library()).getByRole("list", { name });

function renderPage(overrides: RouteTable = {}) {
  const calls = stubRoutes(
    settingsStubs({ "GET /notification-templates": TEMPLATES, ...overrides }),
  );
  return { calls, ...renderWithProviders(<SettingsPage />) };
}

/** Opens "Neue Vorlage" and fills name and text; the kind stays E-Mail. */
async function fillNewTemplate(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: "Neue Vorlage" }));
  const editor = screen.getByRole("form", { name: "Neue Vorlage" });
  await userEvent.type(within(editor).getByLabelText("Name"), "  Neu ");
  fireEvent.change(within(editor).getByLabelText("Text"), { target: { value: "<p>x</p>" } });
  return editor;
}

async function openPreviewOf(name: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole("button", { name: `${name} bearbeiten` }));
  await userEvent.click(
    within(screen.getByRole("form", { name })).getByRole("button", { name: "Vorschau" }),
  );
  return screen.findByRole("dialog", { name: "Vorschau" });
}

describe("template library", () => {
  it("lists own and global templates per kind with the 'Für alle' tag", async () => {
    renderPage();
    await screen.findByText("Kurz");
    expect(within(group("Pushover")).getAllByRole("listitem")).toHaveLength(1);
    const email = within(group("E-Mail")).getAllByRole("listitem");
    expect(email.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Digest"),
      expect.stringContaining("Wochenmail"),
    ]);
    expect(within(email[0]!).getByText("Für alle")).toBeVisible();
    expect(within(email[1]!).queryByText("Für alle")).toBeNull();
    expect(screen.getByText(/Quellen behalten ihre Kopie/)).toBeVisible();
  });

  it("an empty list is a hint, not a second section heading", async () => {
    renderPage({ "GET /notification-templates": [] });
    expect(await screen.findByText(/Noch keine Vorlage/)).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("a member has no Bearbeiten for a global template", async () => {
    renderPage();
    await screen.findByText("Digest");
    expect(screen.queryByRole("button", { name: "Digest bearbeiten" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Digest löschen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Kurz bearbeiten" })).toBeVisible();
    expect(screen.queryByLabelText("Für alle Benutzer")).toBeNull();
  });

  it("Neue Vorlage saves name, type RESEND and text through POST /notification-templates", async () => {
    const { calls, queryClient } = renderPage({ "POST /notification-templates": CREATED });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const editor = await fillNewTemplate();
    expect(within(editor).queryByLabelText("Für alle Benutzer")).toBeNull();
    await userEvent.click(within(editor).getByRole("button", { name: "Speichern" }));
    await screen.findByText("Vorlage gespeichert.");
    expect(bodyOf(calls.find(isCallTo("POST", "/notification-templates")))).toEqual({
      name: "Neu",
      type: "RESEND",
      content: "<p>x</p>",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.notificationTemplates });
    await waitFor(() => expect(screen.getByRole("button", { name: "Neue Vorlage" })).toHaveFocus());
  });

  it("an admin's 'Für alle Benutzer' posts to /admin/notification-templates", async () => {
    const { calls } = renderPage({
      "GET /me": ADMIN,
      "POST /admin/notification-templates": { ...CREATED, is_admin: true },
    });
    const editor = await fillNewTemplate();
    await userEvent.click(within(editor).getByRole("button", { name: "Pushover" }));
    await userEvent.click(within(editor).getByLabelText("Für alle Benutzer"));
    await userEvent.click(within(editor).getByRole("button", { name: "Speichern" }));
    await screen.findByText("Vorlage gespeichert.");
    expect(bodyOf(calls.find(isCallTo("POST", "/admin/notification-templates")))).toEqual({
      name: "Neu",
      type: "PUSHOVER",
      content: "<p>x</p>",
    });
    expect(calls.some(isCallTo("POST", "/notification-templates"))).toBe(false);
  });

  it("an admin edits a global template through the admin endpoint; the type is read-only", async () => {
    const { calls } = renderPage({
      "GET /me": ADMIN,
      "PUT /admin/notification-templates/32": TEMPLATES[1],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Digest bearbeiten" }));
    const editor = screen.getByRole("form", { name: "Digest" });
    expect(within(editor).queryByRole("button", { name: "Pushover" })).toBeNull();
    expect(within(editor).getByText("E-Mail")).toBeVisible();
    expect(within(editor).queryByLabelText("Für alle Benutzer")).toBeNull();
    await userEvent.type(within(editor).getByLabelText("Name"), "2");
    await userEvent.click(within(editor).getByRole("button", { name: "Speichern" }));
    await screen.findByText("Vorlage gespeichert.");
    expect(bodyOf(calls.find(isCallTo("PUT", "/admin/notification-templates/32")))).toEqual({
      name: "Digest2",
      content: "<p>$title</p>",
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Digest bearbeiten" })).toHaveFocus(),
    );
  });

  it("checks before sending and maps a server refusal of the name to 'Zu lang.'", async () => {
    const { calls } = renderPage({
      "POST /notification-templates": jsonResponse(HTTP_UNPROCESSABLE, {
        detail: [{ type: "string_too_long", loc: ["body", "name"], msg: "SERVER-TEXT" }],
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Neue Vorlage" }));
    const editor = screen.getByRole("form", { name: "Neue Vorlage" });
    await userEvent.type(within(editor).getByLabelText("Name"), "   ");
    await userEvent.click(within(editor).getByRole("button", { name: "Speichern" }));
    expect(within(editor).getAllByText("Bitte ausfüllen.")).toHaveLength(2);
    expect(calls.some(isCallTo("POST", "/notification-templates"))).toBe(false);
    await userEvent.type(within(editor).getByLabelText("Name"), "Neu");
    fireEvent.change(within(editor).getByLabelText("Text"), { target: { value: "x" } });
    await userEvent.click(within(editor).getByRole("button", { name: "Speichern" }));
    expect(await within(editor).findByText("Zu lang.")).toBeVisible();
    expect(document.body.innerHTML).not.toContain("SERVER-TEXT");
  });

  it("Vorschau is inactive while the text is over the limit", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Neue Vorlage" }));
    const editor = screen.getByRole("form", { name: "Neue Vorlage" });
    const tooLong = "x".repeat(NOTIFICATION_LIMITS.templateContent + 1);
    fireEvent.change(within(editor).getByLabelText("Text"), { target: { value: tooLong } });
    const preview = within(editor).getByRole("button", { name: "Vorschau" });
    expect(preview).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(preview);
    expect(screen.queryByRole("dialog", { name: "Vorschau" })).toBeNull();
  });

  it("the preview frame has an empty sandbox and no script", async () => {
    const { calls } = renderPage({ "POST /notification-templates/preview": HOSTILE_PREVIEW });
    const dialog = await openPreviewOf("Wochenmail");
    const frame = await within(dialog).findByTitle("Vorschau");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "");
    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("Hi");
    expect(srcDoc).not.toContain("<script");
    expect(srcDoc).not.toContain("onerror");
    expect(srcDoc).not.toContain("href=");
    expect(srcDoc).not.toContain("shadowrootmode");
    expect(srcDoc).not.toContain("<template");
    expect(srcDoc).toContain("Content-Security-Policy");
    expect(bodyOf(calls.find(isCallTo("POST", "/notification-templates/preview")))).toEqual({
      type: "RESEND",
      content: "<p>Woche</p>",
    });
  });

  it("an existing MAILJET template previews as RESEND, the same renderer", async () => {
    const { calls } = renderPage({
      "GET /me": ADMIN,
      "POST /notification-templates/preview": { html: true, body: "<p>x</p>" },
    });
    await openPreviewOf("Digest");
    await waitFor(() =>
      expect(bodyOf(calls.find(isCallTo("POST", "/notification-templates/preview")))).toEqual({
        type: "RESEND",
        content: "<p>$title</p>",
      }),
    );
  });

  it("a push preview is text, not a frame", async () => {
    renderPage({
      "POST /notification-templates/preview": { html: false, body: "<b>Senior</b> bei Acme" },
    });
    const dialog = await openPreviewOf("Kurz");
    expect(await within(dialog).findByText("<b>Senior</b> bei Acme")).toBeVisible();
    expect(dialog.querySelector("iframe")).toBeNull();
    expect(dialog.querySelector("b")).toBeNull();
  });

  it("a rate-limited preview says wait, never the server text", async () => {
    renderPage({
      "POST /notification-templates/preview": jsonResponse(HTTP_TOO_MANY, {
        error: "Rate limit exceeded: 30 per 1 minute",
      }),
    });
    const dialog = await openPreviewOf("Kurz");
    expect(await within(dialog).findByText("Zu viele Anfragen, bitte kurz warten.")).toBeVisible();
    expect(within(dialog).queryByText(/Rate limit/)).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  });

  it("Löschen asks first and moves focus to the section heading", async () => {
    const { calls } = renderPage({ "DELETE /notification-templates/31": { ok: true } });
    await userEvent.click(await screen.findByRole("button", { name: "Kurz löschen" }));
    const dialog = screen.getByRole("dialog", { name: "„Kurz“ löschen?" });
    expect(
      within(dialog).getByText("Quellen, die diesen Text kopiert haben, behalten ihn."),
    ).toBeVisible();
    expect(calls.some(isCallTo("DELETE", "/notification-templates/31"))).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));
    await screen.findByText("Vorlage gelöscht.");
    expect(calls.some(isCallTo("DELETE", "/notification-templates/31"))).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Benachrichtigungen" })).toHaveFocus(),
    );
  });

  it("switching editors with unsaved text asks first", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Kurz bearbeiten" }));
    await userEvent.type(
      within(screen.getByRole("form", { name: "Kurz" })).getByLabelText("Name"),
      "x",
    );
    await userEvent.click(screen.getByRole("button", { name: "Wochenmail bearbeiten" }));
    expect(await screen.findByRole("dialog", { name: "Änderungen verwerfen?" })).toBeVisible();
    expect(screen.queryByRole("form", { name: "Wochenmail" })).toBeNull();
  });
});
