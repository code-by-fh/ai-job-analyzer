import { describe, expect, it } from "vitest";
import type { NotificationSettings } from "@/api/notificationSettings";
import {
  channelDetail,
  channelDraftOf,
  channelErrors,
  channelPatch,
  emailProblem,
  removalPatch,
} from "@/domain/notificationChannels";

const STORED: NotificationSettings = {
  pushover_user_key: "push-user",
  pushover_api_token: true,
  resend_api_key: true,
  resend_from_email: "jobs@example.com",
  mailjet_api_key: false,
  mailjet_secret_key: false,
  mailjet_from_email: "",
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "smtp-user",
  smtp_password: true,
  smtp_from_email: "",
  email_global_recipient: "me@example.com",
};

describe("channel drafts", () => {
  it("start with the plain values and empty secrets", () => {
    expect(channelDraftOf("SMTP", STORED)).toEqual({
      smtp_host: "smtp.example.com",
      smtp_port: "587",
      smtp_user: "smtp-user",
      smtp_from_email: "",
      smtp_password: "",
    });
  });

  it("send only changed plain fields and typed secrets", () => {
    const draft = { ...channelDraftOf("SMTP", STORED), smtp_host: " mail.example.org " };
    expect(channelPatch("SMTP", draft, STORED)).toEqual({ smtp_host: "mail.example.org" });
    const typed = { ...channelDraftOf("PUSHOVER", STORED), pushover_api_token: "neu" };
    expect(channelPatch("PUSHOVER", typed, STORED)).toEqual({ pushover_api_token: "neu" });
  });

  it("send a cleared plain field as null and the port as a number", () => {
    const draft = { ...channelDraftOf("SMTP", STORED), smtp_user: "", smtp_port: "2525" };
    expect(channelPatch("SMTP", draft, STORED)).toEqual({ smtp_user: null, smtp_port: 2525 });
  });

  it("never send a secret of only spaces (the server would store it as the credential)", () => {
    const draft = { ...channelDraftOf("SMTP", STORED), smtp_password: "   " };
    expect(channelPatch("SMTP", draft, STORED)).toEqual({});
  });

  it("removal clears every field of the channel and nothing else", () => {
    expect(removalPatch("MAILJET")).toEqual({
      mailjet_api_key: null,
      mailjet_secret_key: null,
      mailjet_from_email: null,
    });
  });
});

describe("channelErrors", () => {
  const check = (channel: "SMTP" | "MAILJET", patch: Record<string, string>) =>
    channelErrors({
      channel,
      draft: { ...channelDraftOf(channel, STORED), ...patch },
      settings: STORED,
    });

  it("refuses odd ports and addresses before sending", () => {
    expect(check("SMTP", { smtp_port: "0" })).toEqual({ smtp_port: "port" });
    expect(check("SMTP", { smtp_port: "70000" })).toEqual({ smtp_port: "port" });
    expect(check("SMTP", { smtp_port: "587a" })).toEqual({ smtp_port: "port" });
    expect(check("SMTP", { smtp_from_email: "a@b" })).toEqual({ smtp_from_email: "email" });
    expect(check("SMTP", { smtp_host: "h".repeat(254) })).toEqual({ smtp_host: "tooLong" });
    expect(check("SMTP", { smtp_user: "u".repeat(501) })).toEqual({ smtp_user: "tooLong" });
  });

  it("accepts the server's bounds", () => {
    expect(check("SMTP", { smtp_port: "65535" })).toEqual({});
    expect(check("SMTP", { smtp_host: "h".repeat(253), smtp_user: "u".repeat(500) })).toEqual({});
  });

  it("asks a new channel for every field its server predicate needs", () => {
    expect(check("MAILJET", {})).toEqual({
      mailjet_api_key: "required",
      mailjet_secret_key: "required",
      mailjet_from_email: "required",
    });
  });

  it("counts a stored secret as present", () => {
    // smtp_password is empty in the draft but stored: SMTP stays sendable.
    expect(check("SMTP", { smtp_host: "mail.example.org" })).toEqual({});
  });

  it("refuses clearing the SMTP user of a configured channel (removal is its own action)", () => {
    expect(check("SMTP", { smtp_user: "  " })).toEqual({ smtp_user: "required" });
  });
});

describe("emailProblem", () => {
  it("allows an empty field and refuses junk or overlong addresses", () => {
    expect(emailProblem("   ")).toBeNull();
    expect(emailProblem(" me@example.com ")).toBeNull();
    expect(emailProblem("a@b")).toBe("email");
    expect(emailProblem(`${"a".repeat(250)}@b.de`)).toBe("tooLong");
  });
});

describe("channelDetail", () => {
  it("names the sender or host, never a secret", () => {
    expect(channelDetail("RESEND", STORED)).toBe("jobs@example.com");
    expect(channelDetail("SMTP", STORED)).toBe("smtp.example.com");
    expect(channelDetail("PUSHOVER", STORED)).toBeNull();
    expect(channelDetail("MAILJET", STORED)).toBeNull();
  });
});
