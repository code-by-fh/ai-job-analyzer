import { afterEach, describe, expect, it, vi } from "vitest";
import {
  channelsQueryOptions,
  channelTypesQueryOptions,
  createChannel,
  deleteChannel,
  testChannel,
  updateChannel,
} from "@/api/notificationChannels";
import { CHANNEL_TYPES, SMTP_CHANNEL } from "../../e2e/support/notificationFixtures";
import { jsonResponse } from "../support/fakeFetch";
import { createTestQueryClient } from "../support/render";
import { stubRoutes } from "../support/stubRoutes";

afterEach(() => vi.unstubAllGlobals());

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const bodyOf = (call: { body?: string | null } | undefined) => JSON.parse(call!.body!) as unknown;

describe("channel reads", () => {
  it("turns each secret into a boolean, so no secret state text reaches the page", async () => {
    stubRoutes({
      "GET /notifications/channels": {
        items: [{ ...SMTP_CHANNEL, secrets: { password: "set", other: "not set" } }],
        total: 1,
      },
    });
    const [channel] = await createTestQueryClient().fetchQuery(channelsQueryOptions());
    expect(channel!.secrets).toEqual({ password: true, other: false });
    expect(channel!.fields.recipients).toEqual(["me@example.com"]);
  });

  it("reads a field kind it does not know as plain text", async () => {
    const [pushover] = CHANNEL_TYPES;
    const field = { ...pushover!.fields[0]!, kind: "phone" };
    stubRoutes({
      "GET /notifications/channel-types": { items: [{ ...pushover, fields: [field] }] },
    });
    const [type] = await createTestQueryClient().fetchQuery(channelTypesQueryOptions());
    expect(type!.fields[0]!.kind).toBe("text");
  });
});

describe("channel writes", () => {
  it("creates with type, name and fields and reads the stored channel", async () => {
    const calls = stubRoutes({
      "POST /notifications/channels": () => jsonResponse(HTTP_CREATED, SMTP_CHANNEL),
    });
    const body = { type: "smtp", name: "Firmen-SMTP", fields: { host: "smtp.example.com" } };
    const saved = await createChannel(body);
    expect(bodyOf(calls[0])).toEqual(body);
    expect(saved.id).toBe(SMTP_CHANNEL.id);
  });

  it("patches only the change it is given", async () => {
    const path = `/notifications/channels/${SMTP_CHANNEL.id}`;
    const calls = stubRoutes({ [`PATCH ${path}`]: SMTP_CHANNEL });
    await updateChannel({ id: SMTP_CHANNEL.id, change: { fields: { port: null } } });
    expect(bodyOf(calls[0])).toEqual({ fields: { port: null } });
  });

  it("deletes with a 204 and no body", async () => {
    const path = `/notifications/channels/${SMTP_CHANNEL.id}`;
    const calls = stubRoutes({
      [`DELETE ${path}`]: () => new Response(null, { status: HTTP_NO_CONTENT }),
    });
    await expect(deleteChannel(SMTP_CHANNEL.id)).resolves.toBeUndefined();
    expect(calls[0]!.method).toBe("DELETE");
  });
});

describe("test send", () => {
  it("reads an unknown reason as the generic failure", async () => {
    const path = `/notifications/channels/${SMTP_CHANNEL.id}/test`;
    stubRoutes({
      [`POST ${path}`]: { channel_id: SMTP_CHANNEL.id, delivered: false, reason: "smtp 550" },
    });
    await expect(testChannel(SMTP_CHANNEL.id)).resolves.toEqual({
      delivered: false,
      reason: "failed",
    });
  });

  it("reads a delivered test without a reason", async () => {
    const path = `/notifications/channels/${SMTP_CHANNEL.id}/test`;
    stubRoutes({
      [`POST ${path}`]: { channel_id: SMTP_CHANNEL.id, delivered: true, reason: null },
    });
    await expect(testChannel(SMTP_CHANNEL.id)).resolves.toEqual({ delivered: true, reason: null });
  });
});
