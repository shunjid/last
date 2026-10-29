import { z } from "zod";

import { DEFAULT_MODE } from "./types";

export const MAX_PROMPT_CHARS = 100_000;

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

export const ChatBodySchema = z
  .strictObject({
    cwd: z.string().min(1).max(4096).optional(),
    effort: EffortSchema.optional(),
    model: ModelSchema.optional(),
    permissionMode: PermissionModeSchema.default(DEFAULT_MODE),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
    sessionId: SessionIdSchema.optional(),
  })
  .refine((value) => Boolean(value.sessionId ?? value.cwd), {
    message: "sessionId or cwd is required",
  });

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

export const SendNowBodySchema = z.strictObject({
  prompt: z.string().trim().min(1).max(MAX_PROMPT_CHARS),
  sessionId: SessionIdSchema.optional(),
  streamId: z.uuid(),
});

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
