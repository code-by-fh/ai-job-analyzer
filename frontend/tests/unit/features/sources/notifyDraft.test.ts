import { describe, expect, it } from "vitest";
import { NOTIFICATION_LIMITS } from "@/api/settingsPaths";
import { notifyErrors, type NotifyDraft } from "@/features/sources/drawer/notifyDraft";

const addresses = (count: number) =>
  Array.from({ length: count }, (_, index) => `person${index}@example.com`).join(", ");

const smtpDraft = (recipients: string): NotifyDraft => ({
  adapters: ["SMTP"],
  templates: { PUSHOVER: null, RESEND: null, MAILJET: null, SMTP: null },
  recipients: { RESEND: "", MAILJET: "", SMTP: recipients },
});

describe("notifyErrors", () => {
  it("accepts as many recipients as the server allows", () => {
    expect(notifyErrors(smtpDraft(addresses(NOTIFICATION_LIMITS.recipients)))).toEqual({});
  });

  it("refuses one recipient more than the server allows", () => {
    expect(notifyErrors(smtpDraft(addresses(NOTIFICATION_LIMITS.recipients + 1)))).toEqual({
      SMTP: "sources.error.tooManyRecipients",
    });
  });
});
