import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./instance";
import {
  CHANNEL_TYPES_PATH,
  CHANNELS_PATH,
  channelPath,
  channelTestPath,
  FIELD_KINDS,
  TEST_REASONS,
  type FieldKind,
  type TestReason,
} from "./notificationPaths";
import { queryKeys } from "./queryKeys";

const labelSchema = z.object({ de: z.string(), en: z.string() });
export type ServiceLabel = z.infer<typeof labelSchema>;

const TEXT_KIND: FieldKind = "text";

// A kind this web does not know yet is edited as plain text: the service still checks the value.
const fieldSpecSchema = z.object({
  name: z.string(),
  label: labelSchema,
  kind: z.enum(FIELD_KINDS).catch(TEXT_KIND),
  required: z.boolean(),
  secret: z.boolean().default(false),
  max_length: z.number().int().nullish(),
  max_items: z.number().int().nullish(),
  default: z.number().int().nullish(),
});
export type FieldSpec = z.infer<typeof fieldSpecSchema>;

const channelTypeSchema = z.object({
  id: z.string(),
  label: labelSchema,
  fields: z.array(fieldSpecSchema),
});
export type ChannelType = z.infer<typeof channelTypeSchema>;
export type ChannelTypeBody = z.input<typeof channelTypeSchema>;

const SECRET_SET = "set";
const fieldValueSchema = z.union([z.string(), z.number(), z.array(z.string()), z.null()]);
export type FieldValue = z.infer<typeof fieldValueSchema>;

// Secrets are write-only: the answer only says "set" / "not set", which becomes a boolean here.
const channelSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  fields: z.record(z.string(), fieldValueSchema.catch(null)),
  secrets: z.record(
    z.string(),
    z.string().transform((value) => value === SECRET_SET),
  ),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});
export type Channel = z.infer<typeof channelSchema>;
export type ChannelBody = z.input<typeof channelSchema>;

const itemsOf = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item) });

export function channelTypesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.channelTypes,
    queryFn: async () => (await api.request(CHANNEL_TYPES_PATH, itemsOf(channelTypeSchema))).items,
    // The types change only with a deployment of the service.
    staleTime: Infinity,
  });
}

/** The user's channels, oldest first (at most CHANNEL_LIMITS.channels). */
export function channelsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.channels,
    queryFn: async () => (await api.request(CHANNELS_PATH, itemsOf(channelSchema))).items,
  });
}

/** null clears an optional field; an omitted field (a kept secret) stays as stored. */
export type FieldChanges = Record<string, FieldValue>;

export interface ChannelCreate {
  type: string;
  name: string;
  fields: FieldChanges;
}

/** 201 with the stored channel; 422 per field (`fields.<name>`), 409 at the channel limit. */
export async function createChannel(body: ChannelCreate): Promise<Channel> {
  return api.request(CHANNELS_PATH, channelSchema, { method: "POST", json: body });
}

export interface ChannelUpdate {
  id: string;
  change: { name?: string; fields?: FieldChanges };
}

export async function updateChannel({ id, change }: ChannelUpdate): Promise<Channel> {
  return api.request(channelPath(id), channelSchema, { method: "PATCH", json: change });
}

/** 204; the server also drops the channel from every source of the user. */
export async function deleteChannel(id: string): Promise<void> {
  await api.request(channelPath(id), z.unknown(), { method: "DELETE" });
}

const FAILED_REASON: TestReason = "failed";
const testResultSchema = z.object({
  delivered: z.boolean(),
  // An unknown reason reads as the generic failure: the web never shows a raw code.
  reason: z.enum(TEST_REASONS).nullish().catch(FAILED_REASON),
});
export type TestResult = z.infer<typeof testResultSchema>;

/** A fixed test message to the channel's own recipients; not delivered is a 200 with a reason. */
export async function testChannel(id: string): Promise<TestResult> {
  return api.request(channelTestPath(id), testResultSchema, { method: "POST" });
}
