import { NextResponse } from "next/server";
import { z } from "zod";

const NO_STORE = { "cache-control": "no-store" } as const;

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { headers: NO_STORE, status });
}

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { headers: NO_STORE, status });
}

type ReadResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ReadResult<z.infer<S>>> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return { ok: false, response: jsonError(415, "expected application/json") };
  }

  const raw = await request.text();
  if (raw.length > 1_000_000) {
    return { ok: false, response: jsonError(413, "body too large") };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError(400, "invalid JSON") };
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false, response: jsonError(400, z.prettifyError(result.error)) };
  }
  return { data: result.data, ok: true };
}

export function logShape(scope: string, fields: Record<string, unknown>) {
  const safe = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === "string" ? value.length : value,
    ]),
  );
  console.warn(`[last:${scope}]`, safe);
}
