import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveAllJobs, changePassword, factoryReset, resetProfile } from "@/api/account";
import {
  notificationSettingsSchema,
  saveNotificationSettings,
  sendSettingsTest,
} from "@/api/notificationSettings";
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  previewNotificationTemplate,
  type NotificationTemplateWrite,
  updateNotificationTemplate,
} from "@/api/notifications";
import {
  disconnectDrive,
  driveLoginUrl,
  saveTimezone,
  storageStatusSchema,
  toggleStorage,
} from "@/api/settings";
import { API_BASE_URL } from "@/config";
import { stubRoutes } from "../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

const bodyOf = (call: { body?: string | null } | undefined) => JSON.parse(call!.body!) as unknown;

describe("notification settings schema", () => {
  it("turns every secret into a boolean and keeps no mask", () => {
    const parsed = notificationSettingsSchema.parse({
      pushover_api_token: "__masked__",
      smtp_password: null,
      resend_api_key: "",
      role: "Lead",
    });
    expect(parsed.pushover_api_token).toBe(true);
    expect(parsed.smtp_password).toBe(false);
    expect(parsed.resend_api_key).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("__masked__");
    expect(parsed).not.toHaveProperty("role");
  });

  it("reads an odd legacy value as empty instead of failing the section", () => {
    const parsed = notificationSettingsSchema.parse({ smtp_port: "587", smtp_host: 42 });
    expect(parsed.smtp_port).toBeNull();
    expect(parsed.smtp_host).toBe("");
  });

  it("saves only the patch it is given", async () => {
    const calls = stubRoutes({ "POST /notification-settings": { status: "saved" } });
    await saveNotificationSettings({ smtp_host: "mail.example.org" });
    expect(bodyOf(calls[0])).toEqual({ smtp_host: "mail.example.org" });
  });
});

describe("sendSettingsTest", () => {
  it("tests Pushover without a body and an email channel with the recipient", async () => {
    const calls = stubRoutes({
      "POST /notification-settings/test-pushover": { ok: true },
      "POST /notification-settings/test-smtp": { ok: true },
    });
    await sendSettingsTest({ channel: "PUSHOVER" });
    await sendSettingsTest({ channel: "SMTP", recipient: "me@example.com" });
    expect(calls[0]!.body).toBeNull();
    expect(bodyOf(calls[1])).toEqual({ recipient: "me@example.com" });
  });

  it("asks for the stored default recipient when none or only spaces is given", async () => {
    const calls = stubRoutes({ "POST /notification-settings/test-resend": { ok: true } });
    await sendSettingsTest({ channel: "RESEND" });
    await sendSettingsTest({ channel: "RESEND", recipient: "   " });
    await sendSettingsTest({ channel: "RESEND", recipient: " me@example.com " });
    expect(calls.map(bodyOf)).toEqual([
      { recipient: "" },
      { recipient: "" },
      { recipient: "me@example.com" },
    ]);
  });
});

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

describe("time zone and storage", () => {
  it("answers the zone the server stored", async () => {
    stubRoutes({ "POST /timezone-preference": { status: "saved", timezone: "Europe/Berlin" } });
    expect(await saveTimezone("Mars/Olympus")).toBe("Europe/Berlin");
  });

  it("reads an unknown storage service as the database", () => {
    const status = storageStatusSchema.parse({ available: true, connected: false, active: "S3" });
    expect(status).toEqual({ available: true, connected: false, active: "NONE", email: null });
  });

  it("toggles the storage service and disconnects Drive without a body", async () => {
    const calls = stubRoutes({
      "POST /storage/toggle": { status: "success", service: "GOOGLE_DRIVE" },
      "POST /storage/google/disconnect": { status: "disconnected" },
    });
    await toggleStorage("GOOGLE_DRIVE");
    await disconnectDrive();
    expect(bodyOf(calls[0])).toEqual({ service: "GOOGLE_DRIVE" });
    expect(calls[1]!.body).toBeNull();
  });

  it("builds the Drive login from the configured API base, never from data", () => {
    expect(driveLoginUrl()).toBe(`${API_BASE_URL}/storage/google/login`);
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
