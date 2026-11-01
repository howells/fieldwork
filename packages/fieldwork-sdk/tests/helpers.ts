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

export const fakeFetch = (...replies: Reply[]) => {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const { body } = init;
    const call: RecordedCall = {
      body: typeof body === "string" ? JSON.parse(body) : body,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      method: init.method ?? "GET",
      url: new URL(input instanceof Request ? input.url : input),
    };
    calls.push(call);
    const reply = queue.shift();
    if (!reply) {
      throw new Error(`unexpected request: ${call.method} ${call.url.href}`);
    }
    return new Response(
      reply.body === undefined ? "" : JSON.stringify(reply.body),
      { headers: reply.headers, status: reply.status ?? 200 }
    );
  };
  return { calls, fetch: fetchImpl };
};

/** The item at `index`, or a thrown error naming what is missing. */
export const nth = <T>(items: readonly T[], index: number): T => {
  const item = index < 0 ? items.at(index) : items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index} of ${items.length}`);
  }
  return item;
};
