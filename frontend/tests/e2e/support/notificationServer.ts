// Runtime imports only from modules without the API client (it needs the app's env at load).
import type { ChannelBody, ChannelTypeBody } from "../../../src/api/notificationChannels";
import {
  CHANNEL_LIMITS,
  CHANNEL_TYPES_PATH,
  CHANNELS_PATH,
  channelPath,
  channelTestPath,
  type TestReason,
} from "../../../src/api/notificationPaths";
import { live, reply, type MockRoutes, type Reply } from "./mockApi";
import { CHANNEL_SECRETS, CHANNEL_TYPES, CHANNELS } from "./notificationFixtures";

type Sent = Record<string, unknown>;
type FieldSpec = ChannelTypeBody["fields"][number];

const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_BAD_GATEWAY = 502;
// deps.NOTIFICATION_TEST_RATE: 5 test sends per minute and user.
const TESTS_PER_MINUTE = 5;
const SET = "set";
const NOT_SET = "not set";
const STAMP = "2026-10-16T08:00:00+00:00";
// The ids a create hands out, known before a spec runs: mockApi matches exact paths.
const NEW_ID_PREFIX = "6f1c2a10-0000-4000-8000-0000000001";
const EMAIL =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

const newId = (slot: number) => `${NEW_ID_PREFIX}${String(slot).padStart(2, "0")}`;
const NEW_IDS = Array.from({ length: CHANNEL_LIMITS.channels }, (_, slot) => newId(slot));

const isObject = (value: unknown): value is Sent =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** FastAPI's 422: one entry per refused location; the msg is free text the web never shows. */
const refusal = (locations: readonly (readonly (string | number)[])[]): Reply =>
  reply(HTTP_UNPROCESSABLE, {
    detail: locations.map((loc) => ({ type: "value_error", loc, msg: "refused" })),
  });

const lengthOf = (text: string) => Array.from(text).length;

function stringIssue(spec: FieldSpec, value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return true;
  if (spec.max_length && lengthOf(value) > spec.max_length) return true;
  return spec.kind === "email" && !EMAIL.test(value);
}

/** channel_types._value_issue, simplified: true when the service would refuse the value. */
function valueIssue(spec: FieldSpec, value: unknown): boolean {
  if (spec.kind === "port") {
    const port = Number(value);
    return (
      !Number.isInteger(value) || port < CHANNEL_LIMITS.portMin || port > CHANNEL_LIMITS.portMax
    );
  }
  if (spec.kind === "email_list") {
    if (!Array.isArray(value) || value.length === 0) return true;
    if (value.length > (spec.max_items ?? 0)) return true;
    return !value.every((item) => typeof item === "string" && EMAIL.test(item));
  }
  return stringIssue(spec, value);
}

interface Stored {
  id: string;
  type: string;
  name: string;
  /** Every value, secrets included; the answers show secrets only as "set" / "not set". */
  values: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function storedOf(channel: ChannelBody): Stored {
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    values: { ...structuredClone(channel.fields), ...CHANNEL_SECRETS[channel.id] },
    created_at: channel.created_at ?? STAMP,
    updated_at: channel.updated_at ?? STAMP,
  };
}

/** One test send that passed the rate limit. */
export interface ChannelTestCall {
  channelId: string;
}

/**
 * The /notifications/* routes by the rules of server/routers/notifications.py and the service:
 * answers come from this state, never from the request body; secrets are never answered.
 */
export class NotificationServer {
  types: ChannelTypeBody[] = structuredClone(CHANNEL_TYPES);
  private channels: Stored[];
  /** Every test send that passed the rate limit, in order. */
  readonly tests: ChannelTestCall[] = [];
  /** A channel whose test is not delivered answers this reason. */
  readonly testReasons = new Map<string, TestReason>();
  /** The service is unreachable: every route answers 502. */
  down = false;
  private nextSlot = 0;

  /** `channels`: what the user has set up; [] for a first run. */
  constructor(channels: readonly ChannelBody[] = CHANNELS) {
    this.channels = channels.map(storedOf);
  }

  /** The public view of a stored channel (routers/notifications.py public_channel). */
  view(id: string): ChannelBody {
    const channel = this.find(id)!;
    const specs = this.specsOf(channel.type);
    const fields = Object.fromEntries(
      specs
        .filter((spec) => !spec.secret && spec.name in channel.values)
        .map((spec) => [spec.name, structuredClone(channel.values[spec.name])]),
    ) as ChannelBody["fields"];
    const secrets = Object.fromEntries(
      specs
        .filter((spec) => spec.secret)
        .map((spec) => [spec.name, spec.name in channel.values ? SET : NOT_SET]),
    );
    const { type, name, created_at, updated_at } = channel;
    return { id: channel.id, type, name, fields, secrets, created_at, updated_at };
  }

  /** A stored value, secrets included, for assertions only. */
  valueOf(id: string, field: string): unknown {
    return this.find(id)?.values[field];
  }

  ids(): string[] {
    return this.channels.map((channel) => channel.id);
  }

  listRoute(): Reply | { items: ChannelBody[]; total: number } {
    if (this.down) return this.unavailable();
    const items = this.channels.map((channel) => this.view(channel.id));
    return { items, total: items.length };
  }

  typesRoute(): Reply | { items: ChannelTypeBody[] } {
    return this.down ? this.unavailable() : { items: structuredClone(this.types) };
  }

  /** POST /notifications/channels: 422 per field, 409 at 20 channels, else 201. */
  create(sent: unknown): Reply {
    if (this.down) return this.unavailable();
    const body = isObject(sent) ? sent : {};
    const type = this.types.find((entry) => entry.id === body.type);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!type) return refusal([["body", "type"]]);
    if (!name || lengthOf(name) > CHANNEL_LIMITS.name) return refusal([["body", "name"]]);
    if (this.channels.length >= CHANNEL_LIMITS.channels) {
      return reply(HTTP_CONFLICT, { detail: "channel_limit_reached" });
    }
    const values = isObject(body.fields) ? body.fields : {};
    const refused = this.issues(type.fields, values);
    if (refused) return refused;
    const id = newId(this.nextSlot++);
    this.channels.push({
      id,
      type: type.id,
      name,
      values: { ...values },
      created_at: STAMP,
      updated_at: STAMP,
    });
    return reply(HTTP_CREATED, this.view(id));
  }

  /** PATCH /notifications/channels/{id}: an omitted field stays, null clears (required -> 422). */
  update(id: string, sent: unknown): Reply | ChannelBody {
    if (this.down) return this.unavailable();
    const channel = this.find(id);
    if (!channel) return reply(HTTP_NOT_FOUND, { detail: "Channel not found" });
    const body = isObject(sent) ? sent : {};
    const changes = isObject(body.fields) ? body.fields : {};
    const merged = Object.fromEntries(
      Object.entries({ ...channel.values, ...changes }).filter(([, value]) => value !== null),
    );
    const refused = this.issues(this.specsOf(channel.type), merged);
    if (refused) return refused;
    if (typeof body.name === "string") channel.name = body.name.trim();
    channel.values = merged;
    channel.updated_at = STAMP;
    return this.view(id);
  }

  /** DELETE /notifications/channels/{id}: 204, or 404 for an unknown id. */
  remove(id: string): Reply {
    if (this.down) return this.unavailable();
    if (!this.find(id)) return reply(HTTP_NOT_FOUND, { detail: "Channel not found" });
    this.channels = this.channels.filter((channel) => channel.id !== id);
    return reply(HTTP_NO_CONTENT, null);
  }

  /** POST /notifications/channels/{id}/test: 429 from the sixth call, else the outcome. */
  test(id: string): Reply | { channel_id: string; delivered: boolean; reason: string | null } {
    if (this.down) return this.unavailable();
    if (!this.find(id)) return reply(HTTP_NOT_FOUND, { detail: "Channel not found" });
    if (this.tests.length >= TESTS_PER_MINUTE) {
      return reply(HTTP_TOO_MANY_REQUESTS, { detail: "Too many requests" });
    }
    this.tests.push({ channelId: id });
    const reason = this.testReasons.get(id) ?? null;
    return { channel_id: id, delivered: reason === null, reason };
  }

  /** The service's per-field refusal: an unknown field, a missing required one, a bad value. */
  private issues(specs: readonly FieldSpec[], values: Sent): Reply | null {
    const known = new Set(specs.map((spec) => spec.name));
    if (Object.keys(values).some((name) => !known.has(name))) return refusal([["body", "fields"]]);
    const refused = specs.filter((spec) =>
      spec.name in values ? valueIssue(spec, values[spec.name]) : spec.required,
    );
    return refused.length > 0
      ? refusal(refused.map((spec) => ["body", "fields", spec.name]))
      : null;
  }

  private specsOf(type: string): readonly FieldSpec[] {
    return this.types.find((entry) => entry.id === type)?.fields ?? [];
  }

  private find(id: string): Stored | undefined {
    return this.channels.find((channel) => channel.id === id);
  }

  private unavailable(): Reply {
    return reply(HTTP_BAD_GATEWAY, { detail: "notification_service_unavailable" });
  }
}

/** The channel routes, with per-id routes for the fixtures and every id a create can hand out. */
export function notificationRoutes(server: NotificationServer): MockRoutes {
  const routes: Record<string, ReturnType<typeof live>> = {
    [`GET ${CHANNEL_TYPES_PATH}`]: live(() => server.typesRoute()),
    [`GET ${CHANNELS_PATH}`]: live(() => server.listRoute()),
    [`POST ${CHANNELS_PATH}`]: live((sent) => server.create(sent)),
  };
  for (const id of [...server.ids(), ...NEW_IDS]) {
    routes[`PATCH ${channelPath(id)}`] = live((sent) => server.update(id, sent));
    routes[`DELETE ${channelPath(id)}`] = live(() => server.remove(id));
    routes[`POST ${channelTestPath(id)}`] = live(() => server.test(id));
  }
  return routes;
}
