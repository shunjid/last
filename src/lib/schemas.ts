import { z } from "zod";

import {
  DEFAULT_MODE,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_CHARS,
  MAX_IMAGES,
  MAX_IMAGES_CHARS,
} from "./types";

export const MAX_PROMPT_CHARS = 100_000;

export const MAX_CHAT_BODY_CHARS = 10_000_000;

export const SessionIdSchema = z.uuid();

export const PermissionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
]);

export const EffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

const ModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\w.:@[\]-]+$/);

const PromptImagesSchema = z
  .array(
    z.strictObject({
      data: z.base64().min(1).max(MAX_IMAGE_CHARS),
      mediaType: z.enum(IMAGE_MEDIA_TYPES),
    }),
  )
  .max(MAX_IMAGES)
  .refine(
    (images) => images.reduce((sum, image) => sum + image.data.length, 0) <= MAX_IMAGES_CHARS,
    {
      message: "images are too large to send together",
    },
  )
  .default([]);

const PromptSchema = z.string().trim().max(MAX_PROMPT_CHARS);

const hasContent = (value: { images: unknown[]; prompt: string }) =>
  value.prompt.length > 0 || value.images.length > 0;

export const ChatBodySchema = z
  .strictObject({
    cwd: z.string().min(1).max(4096).optional(),
    effort: EffortSchema.optional(),
    images: PromptImagesSchema,
    model: ModelSchema.optional(),
    permissionMode: PermissionModeSchema.default(DEFAULT_MODE),
    prompt: PromptSchema,
    sessionId: SessionIdSchema.optional(),
  })
  .refine((value) => Boolean(value.sessionId ?? value.cwd), {
    message: "sessionId or cwd is required",
  })
  .refine(hasContent, { message: "prompt or images are required" });

export const PermissionDecisionSchema = z.strictObject({
  decision: z.enum(["allow", "deny"]),
  requestId: z.uuid(),
  scope: z.enum(["once", "session"]).default("once"),
  streamId: z.uuid(),
});

export const QuestionDecisionSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    answers: z.record(z.string().min(1).max(200), z.string().min(1).max(4000)),
    decision: z.literal("answer"),
    requestId: z.uuid(),
    streamId: z.uuid(),
  }),
  z.strictObject({
    decision: z.literal("cancel"),
    requestId: z.uuid(),
    streamId: z.uuid(),
  }),
]);

export const InterruptBodySchema = z.strictObject({
  sessionId: SessionIdSchema.optional(),
  streamId: z.uuid(),
});

export const SendNowBodySchema = z
  .strictObject({
    images: PromptImagesSchema,
    prompt: PromptSchema,
    sessionId: SessionIdSchema.optional(),
    streamId: z.uuid(),
  })
  .refine(hasContent, { message: "prompt or images are required" });

export const RunOptionsBodySchema = z
  .strictObject({
    effort: EffortSchema.nullable().optional(),
    model: ModelSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
    sessionId: SessionIdSchema.optional(),
    streamId: z.uuid(),
  })
  .refine(
    (value) =>
      value.permissionMode !== undefined || value.model !== undefined || value.effort !== undefined,
    { message: "permissionMode, model or effort is required" },
  );

export const ListSessionsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(500).default(300),
});
