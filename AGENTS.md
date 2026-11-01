# fieldwork

One API over Exa, Firecrawl, Tavily, Parallel and Perplexity, published as `@howells/fieldwork-sdk`. Plans, decisions and evidence live on Linear (material-instruments, MG-2960) until Fieldwork has its own Linear home.

```sh
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Rules:

- A provider that lacks a capability or option is never called for it. No fallbacks and no emulation: the adapter omits the method, the types refuse the call, and the runtime throws `Unsupported`.
- Every result keeps the provider's response in `raw`.
- Adapters call each provider's REST API with `fetch`; the package has no runtime dependencies.
- Releases publish from `.github/workflows/release.yml` on a `@howells/fieldwork-sdk@x.y.z` tag. Nothing else runs in CI; checks run locally.
