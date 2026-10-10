import { Schema } from "effect";

const ConnectionSchema = Schema.Struct({ token: Schema.String, path: Schema.String });
const ResponseSchema = Schema.Struct({
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
});

declare global {
  interface Window {
    __GITLER_BROWSER__?: unknown;
  }
}

export const browserConnection =
  typeof window !== "undefined" && window.__GITLER_BROWSER__ !== undefined
    ? Schema.decodeUnknownSync(ConnectionSchema)(window.__GITLER_BROWSER__)
    : null;

export async function browserInvoke(
  command: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!browserConnection) throw new Error("The local browser server is unavailable.");
  const response = await fetch("/__gitler/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Gitler-Session": browserConnection.token },
    body: JSON.stringify({ command, args }),
  });
  if (response.status === 403) throw new Error("The local session expired. Reload this page.");
  const payload = Schema.decodeUnknownSync(ResponseSchema)(await response.json());
  if (payload.error !== undefined) throw new Error(payload.error);
  if (!response.ok) throw new Error(`Local server request failed (${response.status}).`);
  return payload.result;
}
