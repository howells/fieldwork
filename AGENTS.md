# fieldwork

One API over Exa, Firecrawl, Tavily, Parallel and Perplexity. Two packages:

- `packages/fieldwork-sdk`, published as `@howells/fieldwork-sdk`: the client, the adapters and agent tool definitions (`/tools`).
- `packages/fieldwork-mcp`, published as `@howells/fieldwork-mcp`: an MCP server over stdio that serves those tools.

Plans, decisions and evidence live on Linear (material-instruments, MG-2960; the agent-readiness audit is MG-2961) until Fieldwork has its own Linear home.

## Commands

```sh
pnpm install
pnpm build && pnpm typecheck && pnpm lint && pnpm test   # the gate; run before every commit
pnpm test:live                                            # real provider calls; ask first
```

`pnpm test` uses a fake `fetch` and costs nothing. Every adapter change needs a test in `packages/fieldwork-sdk/tests/` that checks the request the provider receives and the normalized result.

## Rules

- A provider that lacks a capability or option is never called for it. No fallbacks and no emulation: the adapter omits the method, the types refuse the call, the runtime throws `Unsupported`, and the tool schema leaves the option out.
- Every result keeps the provider's response in `raw`. Tools strip it; the SDK never does.
- An error raised after a job starts carries `jobId`, and every asynchronous method accepts `resume`.
- The SDK has no runtime dependencies. Adapters call each provider's REST API with `fetch`.
- Configuration is flags and arguments; the environment holds API keys only.

## Boundaries

Always:

- Run the gate before committing.
- Keep each provider's option names in its adapter's types, and the shared names (`limit`, `includeDomains`, `excludeDomains`, `publishedAfter`) where the meaning is the same.

Ask Daniel first:

- Running `pnpm test:live`, or any call to a real provider. A full live run costs about $0.20.
- Adding a provider or a capability.
- Changing a published name: a package, export path, tool name or error code.

Never:

- Print, log or commit an API key.
- Run `npm publish` by hand. Releases go out through `.github/workflows/release.yml` on a `@howells/<package>@x.y.z` tag, by npm trusted publishing. The one exception is a package's first publish, which npm requires from a signed-in account.
- Add CI checks. Checks run locally; the release workflow is the only workflow.

## Adding an adapter

1. Create `packages/fieldwork-sdk/src/adapters/<provider>.ts`. Export a factory that calls `requireKey`, builds `createRawClient`, and returns `defineAdapter({ name, operations, raw })`. Give `operations` only the capabilities the provider has, each typed with that provider's options.
2. Add the entry to `tsdown.config.ts` and the subpath to `package.json` `exports`.
3. In `src/tool-specs.ts`, add the provider to the `providers` list of each tool option it supports.
4. Add request and result tests, and a block in `tests/live/providers.live.ts`.
5. Add the provider to the capability table and the keys table in the README, and to `PROVIDERS` in `packages/fieldwork-mcp/src/config.ts`.
