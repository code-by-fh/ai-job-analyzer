import { describe, expect, it } from "vitest";
import { NOTIFICATION_LIMITS } from "@/api/settingsPaths";
import { notifyErrors, type NotifyDraft } from "@/features/sources/drawer/notifyDraft";

const addresses = (count: number) =>
  Array.from({ length: count }, (_, index) => `person${index}@example.com`).join(", ");

const smtpDraft = (recipients: string): NotifyDraft => ({
  channelIds: ["smtp-channel"],
  templates: { PUSHOVER: null, RESEND: null, MAILJET: null, SMTP: null },
  recipients: { RESEND: "", MAILJET: "", SMTP: recipients },
});

describe("notifyErrors", () => {
  it("accepts no recipients (the channel's own) and as many as the server allows", () => {
    expect(notifyErrors(smtpDraft(""), ["SMTP"])).toEqual({});
    expect(notifyErrors(smtpDraft(addresses(NOTIFICATION_LIMITS.recipients)), ["SMTP"])).toEqual(
      {},
    );
  });

  it("refuses one recipient more than the server allows", () => {
    expect(
      notifyErrors(smtpDraft(addresses(NOTIFICATION_LIMITS.recipients + 1)), ["SMTP"]),
    ).toEqual({ SMTP: "sources.error.tooManyRecipients" });
  });

  it("checks only the types a chosen channel uses", () => {
    expect(notifyErrors(smtpDraft("kaputt"), ["PUSHOVER"])).toEqual({});
  });
});
