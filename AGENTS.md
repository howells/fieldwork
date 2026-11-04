# fieldwork

One API over Exa, Firecrawl, Tavily, Parallel, Perplexity, Brave, SerpApi, Browserbase, LlamaParse and Reducto. Two packages:

- `packages/fieldwork-sdk`, published as `@howells/fieldwork-sdk`: the client, the adapters and agent tool definitions (`/tools`).
- `packages/fieldwork-mcp`, published as `@howells/fieldwork-mcp`: those tools as an MCP server over stdio, and as an HTTP gateway (`src/gateway/`) with a JSON API, remote MCP and a public OpenAPI description, behind a bearer key per agent. The docs site deploys the gateway at `/api/v1` and `/mcp`.

Plans, decisions and evidence live on Linear (material-instruments, MG-2960; the latest agent-readiness audit is MG-2990) until Fieldwork has its own Linear home.

## Commands

```sh
pnpm install
pnpm build && pnpm typecheck && pnpm lint:ratchet && pnpm test   # the gate; run before every commit
pnpm test:live                                            # real provider calls; ask first
```

Every provider key, and the OpenRouter key, lives in the git-ignored `.env.local` at the repo root, which `pnpm test:live` loads. Production uses the same keys, set on the Vercel project. A provider with no key is skipped.

Lint is the bare `@howells/lint/oxlint/core` preset in every package; no config switches a rule off. `pnpm lint` lists every finding. The gate is `pnpm lint:ratchet`, which fails when any package's count for a rule rises above `lint-baseline.json`. When you lower a count, run `pnpm lint:rebaseline` and commit the baseline with the fix. Never rebaseline to absorb a rise.

`pnpm test` uses a fake `fetch` and costs nothing. Every adapter change needs a test in `packages/fieldwork-sdk/tests/` that checks the request the provider receives and the normalized result.

## Rules

- A provider that lacks a capability or option is never called for it. No fallbacks and no emulation: the adapter omits the method, the types refuse the call, the runtime throws `Unsupported`, and the tool schema leaves the option out.
- Every result keeps the provider's response in `raw`. Tools strip it; the SDK never does.
- An error raised after a job starts carries `jobId`, and every asynchronous method accepts `resume`. Run every job through `runJob` in `src/job.ts`, which holds both; never poll by hand.
- Zod is the only runtime dependency. Adapters still call each provider's REST API with `fetch`. Adding any other dependency needs Daniel's sign-off. Use `zod/mini` in `src`.
- Configuration is flags and arguments; the environment holds API keys only.

## Boundaries

Always:

- Run the gate before committing.
- Keep each provider's option names in its adapter's types, and use the shared names in the README's options table (`limit`, `includeDomains`, `excludeDomains`, `publishedAfter`, `publishedBefore`, `recency`, `maxAge`, `country`, `language`, `schema`, `prompt`, `query`, `content`, `continueFrom`, `resume`, `interval`) wherever the meaning is the same. A field that takes regular expressions or paths gets its own name, never `includeDomains`.
- Refuse an option combination the provider rejects or ignores with `refuseTogether` before sending.

Ask Daniel first:

- Running `pnpm test:live`, or any call to a real provider. A full live run is capped at $5.
- Adding a provider or a capability.
- Changing a published name: a package, export path, tool name or error code.

Never:

- Print, log or commit an API key.
- Run `npm publish` by hand. Releases go out through `.github/workflows/release.yml` on a `@howells/<package>@x.y.z` tag, by npm trusted publishing. The one exception is a package's first publish, which npm requires from a signed-in account.
- Add CI checks. Checks run locally; the release workflow is the only workflow.

## Adding an adapter

1. Create `packages/fieldwork-sdk/src/adapters/<provider>.ts`, with option types in `<provider>/options.ts` and response parsing in `<provider>/parse.ts` once the file nears the 600-line lint limit. Export a factory that calls `requireKey`, builds `createRawClient`, and returns `defineAdapter({ name, operations, raw })`. Give `operations` only the capabilities the provider has, each typed with that provider's options.
2. Add the entry to `tsdown.config.ts` and the subpath to `package.json` `exports`.
3. In `src/tool-specs/<group>.ts`, add the provider to the `providers` list of each tool option it supports. The tools test proves each listed option reaches the provider's request.
4. Add request and result tests, and a block in `tests/live/providers.live.ts`.
5. Add the provider to the capability table and the keys table in the README and the MCP README; to `PROVIDERS`, the factory map and the key list in the usage text in `packages/fieldwork-mcp/src/config.ts`; to `KEY_NAMES` in `src/gateway/environment.ts`; and update the provider count in `tests/server.test.ts`.
