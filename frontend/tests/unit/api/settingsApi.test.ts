import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveAllJobs, changePassword, factoryReset, resetProfile } from "@/api/account";
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  previewNotificationTemplate,
  type NotificationTemplateWrite,
  updateNotificationTemplate,
} from "@/api/notifications";
import { saveTimezone } from "@/api/settings";
import { stubRoutes } from "../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

const bodyOf = (call: { body?: string | null } | undefined) => JSON.parse(call!.body!) as unknown;

describe("notification templates", () => {
  it("writes a global template through the admin router", async () => {
    const saved = { id: 7, name: "Digest", type: "RESEND", content: "x", is_admin: true };
    const calls = stubRoutes({ "POST /admin/notification-templates": saved });
    const template: NotificationTemplateWrite = { name: "Digest", type: "RESEND", content: "x" };
    expect(await createNotificationTemplate({ scope: "global", template })).toEqual(saved);
    expect(bodyOf(calls[0])).toEqual(template);
  });

  it("updates an own template's name and text by id", async () => {
    const saved = { id: 3, name: "Neu", type: "PUSHOVER", content: "y", is_admin: false };
    const calls = stubRoutes({ "PUT /notification-templates/3": saved });
    const template = { name: "Neu", content: "y" };
    expect(await updateNotificationTemplate({ id: 3, scope: "own", template })).toEqual(saved);
    expect(bodyOf(calls[0])).toEqual(template);
  });

  it("deletes a global template through the admin router", async () => {
    const calls = stubRoutes({ "DELETE /admin/notification-templates/9": { ok: true } });
    await deleteNotificationTemplate({ id: 9, scope: "global" });
    expect(calls.map((call) => call.method)).toEqual(["DELETE"]);
  });

  it("answers the preview as untrusted body plus its kind", async () => {
    stubRoutes({ "POST /notification-templates/preview": { html: true, body: "<p>x</p>" } });
    const preview = await previewNotificationTemplate({ type: "RESEND", content: "" });
    expect(preview).toEqual({ html: true, body: "<p>x</p>" });
  });
});

describe("time zone", () => {
  it("answers the zone the server stored", async () => {
    stubRoutes({ "POST /timezone-preference": { status: "saved", timezone: "Europe/Berlin" } });
    expect(await saveTimezone("Mars/Olympus")).toBe("Europe/Berlin");
  });
});

describe("account", () => {
  it("archiveAllJobs sends both options and answers the count", async () => {
    const calls = stubRoutes({ "DELETE /jobs": { status: "archived", count: 4 } });
    expect(await archiveAllJobs({ keepFavorites: true, keepApplications: false })).toBe(4);
    expect(new URL(calls[0]!.url).search).toBe("?keep_favorites=true&keep_applications=false");
  });

  it("changePassword sends the server's field names", async () => {
    const calls = stubRoutes({ "POST /auth/change-password": { status: "password updated" } });
    await changePassword({ current: "alt-passwort", next: "neu-passwort" });
    expect(bodyOf(calls[0])).toEqual({
      current_password: "alt-passwort",
      new_password: "neu-passwort",
    });
  });

  it("resetProfile deletes the profile settings without a body", async () => {
    const calls = stubRoutes({ "DELETE /settings": { status: "deleted" } });
    await resetProfile();
    expect(calls.map((call) => [call.method, call.body])).toEqual([["DELETE", null]]);
  });

  it("factoryReset sends the password in the DELETE body", async () => {
    const calls = stubRoutes({ "DELETE /user/reset": { status: "reset complete" } });
    await factoryReset("geheim-123");
    expect(calls[0]!.method).toBe("DELETE");
    expect(bodyOf(calls[0])).toEqual({ password: "geheim-123" });
  });
});
