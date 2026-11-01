import { defineAdapter } from "../adapter.js";
import { FieldworkError } from "../errors.js";
import { createRawClient, poll, requireKey } from "../http.js";
import type { Citation } from "../types.js";
import {
  callSettings,
  compact,
  list,
  meta,
  num,
  record,
  requireId,
  text,
} from "../util.js";
import type {
  TavilyConfig,
  TavilyOperations,
  TavilyResearchOptions,
} from "./tavily/options.js";
import {
  RESEARCH_FILE,
  base64,
  chunks,
  extractBody,
  failures,
  imageResults,
  invalid,
  page,
  responseMeta,
  searchBody,
  searchResults,
  traversal,
} from "./tavily/parse.js";

export type {
  TavilyAnswerOptions,
  TavilyConfig,
  TavilyCrawlOptions,
  TavilyImagesOptions,
  TavilyMapOptions,
  TavilyOperations,
  TavilyReadManyOptions,
  TavilyReadOptions,
  TavilyResearchFile,
  TavilyResearchOptions,
  TavilySearchDepth,
  TavilySearchOptions,
} from "./tavily/options.js";

export const tavily = (config: TavilyConfig = {}) => {
  const provider = "tavily";
  const raw = createRawClient({
    baseUrl: config.baseUrl ?? "https://api.tavily.com",
    fetch: config.fetch,
    headers: Object.fromEntries(
      Object.entries({
        authorization: `Bearer ${requireKey(provider, config.apiKey, "TAVILY_API_KEY")}`,
        "x-project-id": config.projectId,
      }).filter((entry): entry is [string, string] => entry[1] !== undefined)
    ),
    provider,
    retries: config.retries,
  });

  const operations: TavilyOperations = {
    async answer(question, options) {
      const { call, rest } = callSettings(options);
      const { answerDepth, ...o } = rest;
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: {
            ...searchBody(question, o),
            include_answer: answerDepth ?? "basic",
          },
        })
      );
      const answer = text(response.answer);
      if (answer === undefined) {
        throw new FieldworkError("ProviderError", "tavily returned no answer", {
          cause: response,
          provider,
        });
      }
      const sources: Citation[] = searchResults(response)
        .filter((result) => result.url !== "")
        .map((result) =>
          compact({
            excerpts: chunks(result.snippet),
            title: result.title,
            url: result.url,
          })
        );
      return compact({
        answer,
        citations: sources,
        meta: responseMeta(response),
        raw: response,
      });
    },

    async crawl(url, options) {
      const { call, rest: o } = callSettings(options);
      if (o.chunksPerSource !== undefined && o.instructions === undefined) {
        throw invalid("tavily chunksPerSource needs instructions");
      }
      const response = record(
        await raw.request("POST", "/crawl", {
          ...call,
          body: compact({
            url,
            ...traversal(o),
            chunks_per_source: o.chunksPerSource,
            extract_depth: o.extractDepth,
            format: o.format,
            include_images: o.includeImages,
            include_favicon: o.favicon,
          }),
        })
      );
      return compact({
        meta: responseMeta(response),
        pages: list(response.results).map((item) =>
          page(item, o.instructions !== undefined)
        ),
        raw: response,
      });
    },

    async images(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: searchBody(query, {
            excludeDomains: o.excludeDomains,
            imageDescriptions: o.descriptions ?? true,
            includeDomains: o.includeDomains,
            includeImages: true,
            safeSearch: o.safeSearch,
            searchDepth: o.searchDepth,
            topic: o.topic,
          }),
        })
      );
      return compact({
        meta: responseMeta(response),
        raw: response,
        results: imageResults(response.images) ?? [],
      });
    },

    async map(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/map", {
          ...call,
          body: { url, ...traversal(o) },
        })
      );
      return compact({
        links: list(response.results).flatMap((item) =>
          typeof item === "string" ? [{ url: item }] : []
        ),
        meta: responseMeta(response),
        raw: response,
      });
    },

    async read(url, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/extract", {
          ...call,
          body: extractBody([url], o),
        })
      );
      const [result] = list(response.results);
      if (text(record(result).url) === undefined) {
        const [failure] = failures(response);
        const reason = failure?.error ?? "no content returned";
        throw new FieldworkError(
          /\b404\b|not found/iu.test(reason) ? "NotFound" : "ProviderError",
          `tavily could not read ${url}: ${reason}`,
          { cause: response, provider }
        );
      }
      return compact({
        ...page(result, o.query !== undefined),
        meta: responseMeta(response),
        raw: response,
      });
    },

    async readMany(urls, options) {
      const { call, rest: o } = callSettings(options);
      if (urls.length === 0 || urls.length > 20) {
        throw invalid("tavily reads 1 to 20 URLs in one call");
      }
      const response = record(
        await raw.request("POST", "/extract", {
          ...call,
          body: extractBody(urls, o),
        })
      );
      return compact({
        failed: failures(response),
        meta: responseMeta(response),
        pages: list(response.results).map((item) =>
          page(item, o.query !== undefined)
        ),
        raw: response,
      });
    },

    async research<T>(question: string, options?: TavilyResearchOptions) {
      const { call, rest: o } = callSettings(options);
      const files = o.files?.map((file) => {
        if (!RESEARCH_FILE.test(file.name)) {
          throw invalid(
            `tavily reads .txt, .md and .json files, not ${file.name}`
          );
        }
        return {
          data: base64(
            typeof file.data === "string"
              ? new TextEncoder().encode(file.data)
              : file.data
          ),
          name: file.name,
          type: "base64",
        };
      });
      if (files && files.length > 5) {
        throw invalid("tavily research takes up to 5 files");
      }
      const id =
        o.resume ??
        requireId(
          provider,
          record(
            await raw.request("POST", "/research", {
              creates: true,
              ...call,
              body: compact({
                citation_format: o.citationFormat,
                exclude_domains: o.excludeDomains,
                files,
                include_domains: o.includeDomains,
                input: question,
                model: o.model,
                output_length: o.outputLength,
                output_schema: o.schema,
                stream: false,
              }),
            })
          ).request_id
        );
      const run = await poll(
        provider,
        id,
        async () => {
          const current = record(
            await raw.request("GET", `/research/${id}`, {
              query: { include_usage: true },
              signal: call.signal,
            })
          );
          if (current.status === "failed") {
            throw new FieldworkError(
              "JobFailed",
              `tavily research ${id} failed`,
              { cause: current, provider }
            );
          }
          return current.status === "completed" ? current : undefined;
        },
        { ...call, interval: o.interval }
      );
      const { content } = run;
      if (content === undefined || content === null || content === "") {
        throw new FieldworkError(
          "JobFailed",
          `tavily research ${id} finished without output`,
          { cause: run, jobId: id, provider }
        );
      }
      return compact({
        id,
        meta: meta({
          credits: record(run.usage).credits,
          requestId: run.request_id,
          units: { responseTimeSeconds: run.response_time },
        }),
        // SAFETY: the caller's schema describes T; Fieldwork does not validate provider output against it.
        output: content as T,
        raw: run,
        sources: list(run.sources).flatMap((item) => {
          const source = record(item);
          const url = text(source.url);
          return url === undefined
            ? []
            : [compact({ title: text(source.title), url })];
        }),
        status: "completed" as const,
      });
    },

    async search(query, options) {
      const { call, rest: o } = callSettings(options);
      const response = record(
        await raw.request("POST", "/search", {
          ...call,
          body: searchBody(query, o),
        })
      );
      return compact({
        answer: text(response.answer),
        images: imageResults(response.images),
        meta: responseMeta(response),
        raw: response,
        results: searchResults(response),
      });
    },

    async usage(options) {
      const { call } = callSettings(options);
      const response = record(await raw.request("GET", "/usage", call));
      const key = record(response.key);
      const account = record(response.account);
      const breakdown = Object.fromEntries(
        Object.entries({
          crawl: account.crawl_usage,
          extract: account.extract_usage,
          keyTotal: key.usage,
          map: account.map_usage,
          paygo: account.paygo_usage,
          research: account.research_usage,
          search: account.search_usage,
        }).filter(
          (entry): entry is [string, number] => num(entry[1]) !== undefined
        )
      );
      return compact({
        breakdown: Object.keys(breakdown).length > 0 ? breakdown : undefined,
        limit: num(account.plan_limit),
        raw: response,
        used: num(account.plan_usage),
      });
    },
  };

  return defineAdapter({ name: provider, operations, raw });
};
