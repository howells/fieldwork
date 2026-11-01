import * as z from "zod/mini";

import {
  anything,
  arrayOf,
  both,
  looseObject,
  optionalArrayOf,
  optionalBoolean,
  optionalFirstString,
  optionalId,
  optionalNumber,
  optionalObject,
  optionalScalar,
  optionalString,
  recordOf,
  warningEntry,
  withOriginal,
} from "../../parse.js";
import type { ProductImage } from "../../types.js";
import { compact } from "../../util.js";

/**
 * Warnings as text: a string is one warning (an empty one too); an array gives
 * every entry as a string, whatever it is; anything else gives none.
 */
const Notes = z.union([
  z.pipe(
    z.string(),
    z.transform((note) => [note])
  ),
  arrayOf(z.pipe(z.unknown(), z.transform(String))),
]);

/** A warning, as its text when it is a non-empty string and as the list of warnings it amounts to. */
const Warning = z.pipe(
  both(optionalString, Notes),
  z.transform(({ first, second }) => ({ notes: second, text: first }))
);

/** A product image: a bare URL, or an object with a URL (or `src`) and a description. One without a URL reads as undefined. */
const Image = z.union([
  z.pipe(
    z.string(),
    z.transform((url): ProductImage | undefined =>
      url === "" ? undefined : { url }
    )
  ),
  z.pipe(
    looseObject({
      alt: optionalString,
      src: optionalString,
      url: optionalString,
    }),
    z.transform((image): ProductImage | undefined => {
      const url = image.url ?? image.src;
      return url === undefined ? undefined : compact({ alt: image.alt, url });
    })
  ),
]);

/** A price. The amount is a string or a number, read as a string. */
const Price = looseObject({
  amount: optionalId,
  currency: optionalString,
  formatted: optionalString,
});

const Variant = looseObject({
  availability: looseObject({
    inStock: optionalBoolean,
    text: optionalString,
  }),
  gtin: optionalScalar,
  gtin12: optionalScalar,
  gtin13: optionalScalar,
  gtin14: optionalScalar,
  gtin8: optionalScalar,
  id: optionalString,
  images: arrayOf(Image),
  price: Price,
  sale: looseObject({ originalPrice: Price }),
  sku: optionalString,
  title: optionalString,
  values: recordOf(optionalScalar),
});

/** The metadata of a scraped page, and of a parsed document. */
const metadataShape = {
  "article:published_time": optionalString,
  author: optionalFirstString,
  creditsUsed: optionalNumber,
  description: optionalFirstString,
  favicon: optionalString,
  language: optionalFirstString,
  numPages: optionalNumber,
  "og:image": optionalFirstString,
  ogImage: optionalFirstString,
  publishedTime: optionalString,
  scrapeId: optionalScalar,
  sourceURL: optionalString,
  statusCode: optionalNumber,
  title: optionalFirstString,
  totalPages: optionalNumber,
  url: optionalString,
};

/** What a scrape returns for one page. `json` is kept as it arrived. */
export const PageData = looseObject({
  answer: optionalString,
  highlights: z.pipe(
    both(optionalString, arrayOf(z.string())),
    z.transform(({ first, second }) => ({ list: second, text: first }))
  ),
  html: optionalString,
  images: arrayOf(z.string()),
  json: anything,
  links: arrayOf(z.string()),
  markdown: optionalString,
  metadata: looseObject(metadataShape),
  product: optionalObject({
    brand: optionalString,
    category: optionalString,
    description: optionalString,
    images: arrayOf(Image),
    title: optionalString,
    url: optionalString,
    variants: arrayOf(Variant),
  }),
  rawHtml: optionalString,
  screenshot: optionalString,
  summary: optionalString,
  warning: Warning,
});

/** `/scrape`. */
export const ScrapeResponse = looseObject({
  data: PageData,
  warning: Warning,
});

/** A page of a crawl or batch, beside the entry as it arrived. */
const PageEntry = withOriginal(PageData);

/** A crawl or batch while it runs, and each batch of its pages, beside the response as it arrived. */
export const Batch = withOriginal(
  looseObject({
    creditsUsed: optionalNumber,
    data: arrayOf(PageEntry),
    next: optionalString,
    status: optionalString,
    total: optionalNumber,
  })
);

/** The pages a crawl or batch could not read. */
export const BatchErrors = withOriginal(
  looseObject({
    errors: arrayOf(
      looseObject({ error: optionalString, url: optionalString })
    ),
    robotsBlocked: arrayOf(z.string()),
  })
);

/** The reply to starting a crawl. */
export const CrawlStart = looseObject({ id: withOriginal(optionalId) });

/** The reply to starting a batch scrape or an agent run, beside the response as it arrived. */
export const RunStart = withOriginal(
  looseObject({
    id: withOriginal(optionalId),
    invalidURLs: arrayOf(z.string()),
    threadId: optionalString,
  })
);

/** An agent run while it is polled. */
export const AgentRun = withOriginal(
  looseObject({
    creditsUsed: optionalNumber,
    data: anything,
    error: optionalString,
    message: z.pipe(
      both(anything, warningEntry),
      z.transform(({ first, second }) => ({ note: second, value: first }))
    ),
    partial: anything,
    partialSchemaValid: optionalBoolean,
    status: optionalString,
    stopReason: optionalString,
    threadId: optionalString,
  })
);

/** A browser session as opened, beside the response as it arrived. */
export const Session = withOriginal(
  looseObject({
    cdpUrl: optionalString,
    expiresAt: optionalString,
    id: withOriginal(optionalId),
    liveViewUrl: optionalString,
  })
);

/** A script's outcome, beside the response as it arrived. */
export const Execution = withOriginal(
  looseObject({
    error: optionalString,
    exitCode: optionalNumber,
    killed: optionalBoolean,
    result: anything,
    stderr: optionalString,
    stdout: optionalString,
    success: optionalBoolean,
  })
);

/** What closing a session billed. */
export const Closed = looseObject({ creditsBilled: optionalNumber });

const WebItem = looseObject({
  category: optionalString,
  date: optionalString,
  description: optionalString,
  imageUrl: optionalString,
  markdown: optionalString,
  snippet: optionalString,
  title: optionalString,
  url: optionalString,
});

const Paper = looseObject({
  abstract: optionalString,
  paperId: optionalString,
  primaryId: optionalString,
  score: optionalNumber,
  title: optionalString,
});

const ImageItem = looseObject({
  imageHeight: optionalNumber,
  imageUrl: optionalString,
  imageWidth: optionalNumber,
  title: optionalString,
  url: optionalString,
});

/** `/search`. */
export const SearchResponse = looseObject({
  creditsUsed: optionalNumber,
  data: looseObject({
    images: optionalArrayOf(ImageItem),
    news: arrayOf(WebItem),
    research: arrayOf(Paper),
    web: arrayOf(WebItem),
  }),
  id: optionalScalar,
  warning: Notes,
  warnings: Notes,
});

/** `/map`: each link is a bare URL or an object. */
export const MapResponse = looseObject({
  links: arrayOf(
    z.union([
      z.pipe(
        z.string(),
        z.transform((url) => ({ url }))
      ),
      z.pipe(
        looseObject({
          description: optionalString,
          title: optionalString,
          url: optionalString,
        }),
        z.transform((link) =>
          compact({
            description: link.description,
            title: link.title,
            url: link.url ?? "",
          })
        )
      ),
    ])
  ),
});

const Monitor = looseObject({
  createdAt: optionalString,
  goal: optionalString,
  id: withOriginal(optionalId),
  schedule: looseObject({ cron: optionalString, text: optionalString }),
  status: optionalString,
  targets: arrayOf(
    looseObject({
      queries: arrayOf(z.string()),
      type: optionalString,
      url: optionalString,
      urls: arrayOf(z.string()),
    })
  ),
  webhook: looseObject({ url: optionalString }),
});

/** A monitor beside the entry as it arrived. */
export const MonitorEntry = withOriginal(Monitor);

/** The reply to creating or getting a monitor. */
export const MonitorResponse = looseObject({ data: MonitorEntry });

/** One page of monitors. */
export const MonitorsResponse = looseObject({ data: arrayOf(MonitorEntry) });

/** One page of a monitor's checks, each beside its entry as it arrived. */
export const ChecksResponse = looseObject({
  data: arrayOf(
    withOriginal(
      looseObject({
        createdAt: optionalString,
        error: optionalString,
        finishedAt: optionalString,
        id: optionalString,
        scheduledFor: optionalString,
        startedAt: optionalString,
        status: optionalString,
        summary: looseObject({
          changed: optionalNumber,
          error: optionalNumber,
          new: optionalNumber,
          removed: optionalNumber,
          totalPages: optionalNumber,
        }),
      })
    )
  ),
});

/** `/parse`. */
export const ParseResponse = looseObject({
  data: looseObject({
    blocks: optionalArrayOf(anything),
    markdown: optionalString,
    metadata: looseObject(metadataShape),
    pages: optionalArrayOf(
      looseObject({ markdown: optionalString, pageNumber: anything })
    ),
    warning: Warning,
  }),
  warning: Warning,
});

/** `/team/credit-usage`. */
export const UsageResponse = looseObject({
  data: looseObject({
    billingPeriodEnd: optionalString,
    planCredits: optionalNumber,
    remainingCredits: optionalNumber,
  }),
});

export type PageDataBlock = z.output<typeof PageData>;
export type VariantBlock = z.output<typeof Variant>;
export type PriceBlock = z.output<typeof Price>;
export type ScrapeBody = z.output<typeof ScrapeResponse>;
export type SearchBody = z.output<typeof SearchResponse>;
export type WebItemBlock = z.output<typeof WebItem>;
export type PaperBlock = z.output<typeof Paper>;
export type ImageItemBlock = z.output<typeof ImageItem>;
export type MonitorBlock = z.output<typeof MonitorEntry>;
export type CheckBlock = z.output<typeof ChecksResponse>["data"][number];
export type ParseBody = z.output<typeof ParseResponse>;
export type AgentRunBlock = z.output<typeof AgentRun>;
export type SessionBlock = z.output<typeof Session>;
export type ExecutionBlock = z.output<typeof Execution>;
export type ClosedBlock = z.output<typeof Closed>;
export type BatchBlock = z.output<typeof Batch>;
export type BatchErrorsBlock = z.output<typeof BatchErrors>;
export type PageEntryBlock = z.output<typeof PageEntry>;
export type RunStartBlock = z.output<typeof RunStart>;
export type UsageBody = z.output<typeof UsageResponse>;
export type MapBody = z.output<typeof MapResponse>;
