// A stand-in for `fetch` that records each request and answers from a queue,
// so tests see exactly what a provider would receive and spend nothing.

import { z } from "zod";

/** Every adapter sends JSON text; anything else is a test failure. */
const BodySchema = z.string();

export interface Sent {
  body: string;
  method: string;
  url: URL;
}

export const fakeFetch = (...replies: object[]) => {
  const sent: Sent[] = [];
  const queue = [...replies];
  const fetch = async (
    input: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    sent.push({
      body: BodySchema.parse(init.body ?? ""),
      method: init.method ?? "GET",
      url,
    });
    const reply = queue.shift();
    if (reply === undefined) {
      throw new Error(`Unexpected request to ${url.href}`);
    }
    return await Promise.resolve(Response.json(reply));
  };
  return { fetch, sent };
};
