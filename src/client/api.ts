import type {
  ChatRequestBody,
  ModelChoice,
  PermissionDecisionBody,
  ProjectSummary,
  SessionDetail,
  SessionSummary,
  StreamFrame,
} from "@/lib/types";

const JSON_HEADERS = { "content-type": "application/json" } as const;

async function unwrap<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? `Request failed (${response.status})`);
  return payload as T;
}

export async function getSessions() {
  const response = await fetch("/api/sessions", { headers: JSON_HEADERS });
  return unwrap<{ sessions: SessionSummary[]; projects: ProjectSummary[] }>(response);
}

export async function getSessionDetail(sessionId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/sessions/${sessionId}`, { headers: JSON_HEADERS, signal });
  return unwrap<SessionDetail>(response);
}

export async function getModels(signal?: AbortSignal) {
  const response = await fetch("/api/models", { headers: JSON_HEADERS, signal });
  return unwrap<{ models: ModelChoice[] }>(response);
}

export async function sendPermission(body: PermissionDecisionBody) {
  const response = await fetch("/api/permission", {
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
    method: "POST",
  });
  return unwrap<{ ok: true }>(response);
}

export async function interruptSession(sessionId: string, streamId: string) {
  const response = await fetch("/api/interrupt", {
    body: JSON.stringify({ sessionId, streamId }),
    headers: JSON_HEADERS,
    method: "POST",
  });
  return unwrap<{ ok: true }>(response);
}

export async function* streamChat(
  body: ChatRequestBody,
  signal: AbortSignal,
): AsyncGenerator<StreamFrame> {
  const response = await fetch("/api/chat", {
    body: JSON.stringify(body),
    headers: JSON_HEADERS,
    method: "POST",
    signal,
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Chat failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  signal.addEventListener("abort", () => void reader.cancel().catch(() => undefined), {
    once: true,
  });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            yield JSON.parse(line.slice(5).trim()) as StreamFrame;
          } catch {
            continue;
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
