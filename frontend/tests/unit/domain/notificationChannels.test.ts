import { describe, expect, it } from "vitest";
import type { Channel, ChannelBody, ChannelType } from "@/api/notificationChannels";
import {
  channelDraftOf,
  channelProblems,
  createBody,
  newChannelDraft,
  updateChange,
  type ChannelDraft,
} from "@/domain/notificationChannels";
import {
  CHANNEL_TYPES,
  PUSHOVER_CHANNEL,
  SMTP_CHANNEL,
} from "../../e2e/support/notificationFixtures";

// The fixtures name every field of the schema, so the parsed shape equals the body.
const TYPES = CHANNEL_TYPES as ChannelType[];
const typeNamed = (id: string) => TYPES.find((type) => type.id === id)!;
const SMTP = typeNamed("smtp");
const PUSHOVER = typeNamed("pushover");
const RESEND = typeNamed("resend");

/** What channelSchema makes of a body: "set" / "not set" become booleans. */
function channelOf(body: ChannelBody): Channel {
  const secrets = Object.fromEntries(
    Object.entries(body.secrets).map(([name, state]) => [name, state === "set"]),
  );
  return { ...body, secrets } as Channel;
}

const SMTP_STORED = channelOf(SMTP_CHANNEL);
const withValues = (draft: ChannelDraft, values: Record<string, string>): ChannelDraft => ({
  ...draft,
  values: { ...draft.values, ...values },
});

describe("channelDraftOf", () => {
  it("shows plain values as text and keeps a stored secret without its value", () => {
    const draft = channelDraftOf(SMTP, SMTP_STORED);
    expect(draft.values).toMatchObject({
      host: "smtp.example.com",
      port: "587",
      recipients: "me@example.com",
      password: "",
    });
    expect(draft.secrets).toEqual({ password: "keep" });
  });
});

describe("updateChange", () => {
  it("sends nothing for an untouched form", () => {
    expect(updateChange(SMTP, channelDraftOf(SMTP, SMTP_STORED), SMTP_STORED)).toEqual({});
  });

  it("sends changed fields, a cleared optional field as null and the list as addresses", () => {
    const draft = withValues(channelDraftOf(SMTP, SMTP_STORED), {
      host: " mail.example.org ",
      port: "",
      recipients: "a@example.com, b@example.com",
    });
    expect(updateChange(SMTP, draft, SMTP_STORED)).toEqual({
      fields: {
        host: "mail.example.org",
        port: null,
        recipients: ["a@example.com", "b@example.com"],
      },
    });
  });

  it("sends a replaced secret as typed, and never a kept or an empty replaced one", () => {
    const draft = channelDraftOf(SMTP, SMTP_STORED);
    const replacing = { ...draft, secrets: { password: "replace" as const } };
    expect(updateChange(SMTP, replacing, SMTP_STORED)).toEqual({});
    const typed = withValues(replacing, { password: " neu " });
    expect(updateChange(SMTP, typed, SMTP_STORED)).toEqual({ fields: { password: " neu " } });
  });

  it("sends a removed secret as null and a new name trimmed", () => {
    const draft = channelDraftOf(SMTP, SMTP_STORED);
    const removing: ChannelDraft = { ...draft, name: " Neu ", secrets: { password: "remove" } };
    expect(updateChange(SMTP, removing, SMTP_STORED)).toEqual({
      name: "Neu",
      fields: { password: null },
    });
  });
});

describe("createBody", () => {
  it("leaves out blank optional fields and sends the port as a number", () => {
    const draft = withValues(newChannelDraft(SMTP, "SMTP"), {
      host: "smtp.example.com",
      port: "2525",
      username: "relay",
      password: "pw",
      from_email: "jobs@example.com",
      recipients: "me@example.com",
    });
    expect(createBody(SMTP, draft)).toEqual({
      type: "smtp",
      name: "SMTP",
      fields: {
        host: "smtp.example.com",
        port: 2525,
        username: "relay",
        password: "pw",
        from_email: "jobs@example.com",
        recipients: ["me@example.com"],
      },
    });
    const withoutPort = withValues(draft, { port: "" });
    expect(createBody(SMTP, withoutPort).fields).not.toHaveProperty("port");
  });
});

describe("channelProblems", () => {
  it("needs every required field of a new channel, secrets included", () => {
    const problems = channelProblems(PUSHOVER, newChannelDraft(PUSHOVER, "Handy"), null);
    expect(problems).toEqual({ fields: { api_token: "required", user_key: "required" } });
  });

  it("accepts a stored secret that is kept or replaced by nothing", () => {
    const stored = channelOf(PUSHOVER_CHANNEL);
    const draft = channelDraftOf(PUSHOVER, stored);
    expect(channelProblems(PUSHOVER, draft, stored)).toEqual({ fields: {} });
    const replacing: ChannelDraft = {
      ...draft,
      secrets: { ...draft.secrets, api_token: "replace" },
    };
    expect(channelProblems(PUSHOVER, replacing, stored)).toEqual({ fields: {} });
  });

  it("checks each kind by the service's rules", () => {
    const draft = withValues(channelDraftOf(SMTP, SMTP_STORED), {
      host: "x".repeat(254),
      port: "70000",
      username: "jörg",
      from_email: "kein-at",
      recipients: "a@example.com, nein",
    });
    expect(channelProblems(SMTP, draft, SMTP_STORED).fields).toEqual({
      host: "tooLong",
      port: "port",
      username: "ascii",
      from_email: "email",
      recipients: "emails",
    });
  });

  it("refuses a token with a space and more recipients than the schema allows", () => {
    const many = Array.from({ length: 51 }, (_, index) => `p${index}@example.com`).join(", ");
    const draft = withValues(newChannelDraft(RESEND, "Mail"), {
      api_key: "re key",
      from_email: "jobs@example.com",
      recipients: many,
    });
    expect(channelProblems(RESEND, draft, null).fields).toEqual({
      api_key: "token",
      recipients: "tooManyItems",
    });
  });

  it("needs a name of at most 100 characters", () => {
    const draft = channelDraftOf(SMTP, SMTP_STORED);
    expect(channelProblems(SMTP, { ...draft, name: "  " }, SMTP_STORED).name).toBe("required");
    const long = { ...draft, name: "n".repeat(101) };
    expect(channelProblems(SMTP, long, SMTP_STORED).name).toBe("tooLong");
  });
});
