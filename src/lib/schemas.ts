import { z } from "zod";

export const MAX_PROMPT_CHARS = 100_000;

export const SessionIdSchema = z.uuid();

export const PermissionModeSchema = z.enum(["default", "acceptEdits", "plan"]);

export const EffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

export const ChatBodySchema = z
  .strictObject({
    cwd: z.string().min(1).max(4096).optional(),
    effort: EffortSchema.optional(),
    model: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[\w.:@[\]-]+$/)
      .optional(),
    permissionMode: PermissionModeSchema.default("default"),
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

export const InterruptBodySchema = z.strictObject({
  sessionId: SessionIdSchema,
  streamId: z.uuid(),
});

export const ListSessionsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(500).default(300),
});
