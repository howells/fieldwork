export interface RecordedCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * A fetch that answers each request with the next queued reply and records what
 * was sent, so tests check the provider wire format without a network.
 */
export function fakeFetch(...replies: Reply[]) {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const fetchImpl = async (input: URL | string, init: RequestInit = {}) => {
    const { body } = init;
    const call: RecordedCall = {
      method: init.method ?? "GET",
      url: new URL(String(input)),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof body === "string" ? JSON.parse(body) : body,
    };
    calls.push(call);
    const reply = queue.shift();
    if (!reply) {
      throw new Error(`unexpected request: ${call.method} ${call.url.href}`);
    }
    return new Response(
      reply.body === undefined ? "" : JSON.stringify(reply.body),
      { status: reply.status ?? 200, headers: reply.headers }
    );
  };
  return { fetch: fetchImpl as typeof fetch, calls };
}
