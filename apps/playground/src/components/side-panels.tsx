"use client";

// The pane beside a run: what has turned up so far while it runs, and once
// it is done, the sources, any monitor it set up, and the code.
import { useState } from "react";

import type { Line } from "@/lib/code";
import { lineText } from "@/lib/code";
import { clip, count, domainOf, priceText, scheduleText } from "@/lib/format";
import type { MonitorOutput, ProductOutput } from "@/lib/outputs";
import type { ProviderInfo } from "@/lib/providers";
import {
  CAPABILITY_PHRASES,
  PROVIDER_LABELS,
  isProviderId,
} from "@/lib/providers";
import { priceRange } from "@/lib/steps";

import { Eye } from "./icons";

const providerLabel = (id: string): string =>
  isProviderId(id) ? PROVIDER_LABELS[id] : id;

export const PaneHeading = ({ children }: { children: string }) => (
  <h2 className="text-graphite type-label">{children}</h2>
);

const productFacts = (product: ProductOutput): string[] => {
  const { high, low } = priceRange(product.variants);
  const range =
    low === undefined || low === high ? low : `${low} to ${high ?? low}`;
  const where =
    product.brand ??
    (product.url === undefined ? undefined : domainOf(product.url));
  const size = `${count(product.variants.length)} ${product.variants.length === 1 ? "variant" : "variants"}`;
  return [where, size, range].filter((fact) => fact !== undefined);
};

/** Each variant's first image, once each: variants often share a photo. */
const variantImages = (product: ProductOutput): string[] => [
  ...new Set(
    product.variants.flatMap((variant) => {
      const [first] = variant.images ?? [];
      return first === undefined ? [] : [first.url];
    })
  ),
];

/** How many variant photos the product shows before a count of the rest. */
const PHOTOS = 6;

export const ProductCard = ({ product }: { product: ProductOutput }) => {
  const [image] = product.images ?? [];
  const photos = variantImages(product);
  const cover = image?.url ?? photos[0];
  const facts = productFacts(product);
  const more = photos.length - PHOTOS;
  return (
    <section className="animate-rise flex flex-col gap-2">
      {cover === undefined ? null : (
        <img
          alt={image?.alt ?? product.title ?? ""}
          className="rounded-group bg-wash h-36 w-full object-contain"
          referrerPolicy="no-referrer"
          src={cover}
        />
      )}
      <div className="flex flex-col gap-0.5">
        <h3 className="type-body strong">{product.title ?? "The product"}</h3>
        <p className="figures text-graphite type-label">{facts.join(" · ")}</p>
      </div>
      {photos.length <= 1 ? null : (
        <div className="flex flex-wrap items-center gap-1">
          {photos.slice(0, PHOTOS).map((url) => (
            <img
              alt=""
              className="rounded-swatch bg-wash aspect-[4/3] w-11 shrink-0 object-cover"
              key={url}
              loading="lazy"
              referrerPolicy="no-referrer"
              src={url}
            />
          ))}
          {more > 0 ? (
            <span className="figures text-graphite type-label pl-1">
              +{count(more)}
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
};

export const LowestPrice = ({ product }: { product: ProductOutput }) => {
  const { low } = priceRange(product.variants);
  const cheapest = product.variants.find(
    (variant) => priceText(variant.price) === low
  );
  if (low === undefined) {
    return null;
  }
  const label =
    cheapest === undefined
      ? undefined
      : Object.values(cheapest.values ?? {}).join(", ") || cheapest.title;
  return (
    <div className="animate-rise border-rule flex items-baseline justify-between gap-4 border-t pt-2">
      <p className="text-graphite type-label">
        Lowest price
        {label === undefined || label === "" ? "" : `, ${label}`}
      </p>
      <p className="figures type-body strong">{low}</p>
    </div>
  );
};

interface Source {
  number: number;
  title?: string;
  url: string;
}

export const SourcesCard = ({
  heading,
  sources,
}: {
  heading: string;
  sources: readonly Source[];
}) => (
  <section className="flex flex-col gap-1">
    <PaneHeading>{heading}</PaneHeading>
    <ol className="flex flex-col">
      {sources.map((source) => (
        <li key={`${String(source.number)}-${source.url}`}>
          <a
            className="group rounded-control hover:bg-wash -mx-1.5 flex min-h-11 items-baseline gap-2 px-1.5 py-1 transition-colors duration-150 sm:min-h-7"
            href={source.url}
            rel="noreferrer"
            target="_blank"
            title={source.title ?? source.url}
          >
            <span className="figures text-map-blue type-label w-3.5 shrink-0">
              {source.number}
            </span>
            <span className="flex min-w-0 grow items-baseline gap-2">
              <span className="type-body group-hover:text-map-blue shrink-0 transition-colors duration-150">
                {domainOf(source.url)}
              </span>
              {source.title === undefined || source.title === "" ? null : (
                <span className="text-muted type-label min-w-0 truncate">
                  {clip(source.title, 80)}
                </span>
              )}
            </span>
          </a>
        </li>
      ))}
    </ol>
  </section>
);

const NUMBER_WORDS = [
  "none",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
];

/** "Firecrawl, one of four that read many pages at once". */
export const capabilityNote = (
  provider: string,
  capability: string,
  providers: readonly ProviderInfo[]
): string | undefined => {
  const known = providers.find((info) => info.id === provider);
  const capable = providers.filter((info) =>
    Object.entries(info.capabilities).some(
      ([name, has]) => name === capability && has
    )
  );
  const phrase = Object.entries(CAPABILITY_PHRASES).find(
    ([name]) => name === capability
  )?.[1];
  if (known === undefined || phrase === undefined) {
    return undefined;
  }
  if (capable.length === 1) {
    return `${known.label}, the only one here that can ${phrase}`;
  }
  return `${known.label}, one of ${NUMBER_WORDS[capable.length] ?? count(capable.length)} that ${phrase}`;
};

interface MonitorCardProps {
  monitor: MonitorOutput;
  onStop: () => Promise<void>;
  provider: string;
  stopped: boolean;
  target?: string;
}

export const MonitorCard = ({
  monitor,
  onStop,
  provider,
  stopped,
  target,
}: MonitorCardProps) => {
  const [state, setState] = useState<"idle" | "stopping" | "failed">("idle");
  const stop = async () => {
    setState("stopping");
    try {
      await onStop();
      setState("idle");
    } catch {
      setState("failed");
    }
  };
  const where = target === undefined ? "the page" : domainOf(target);
  const schedule =
    monitor.schedule === undefined ? "" : ` ${scheduleText(monitor.schedule)}`;
  return (
    <div className="rounded-group border-rule animate-rise flex items-start gap-2.5 border px-3 py-2">
      <Eye />
      <div className="flex min-w-0 grow basis-0 flex-col">
        <h3 className="type-body strong">
          {stopped
            ? `Stopped watching ${where}`
            : `Watching ${where}${schedule}`}
        </h3>
        <p className="text-graphite type-label">
          {stopped
            ? `${providerLabel(provider)} won't check it again.`
            : `${providerLabel(provider)} checks it and keeps each change.`}
        </p>
        {state === "failed" ? (
          <p className="text-error type-label">It didn't stop. Try again.</p>
        ) : null}
      </div>
      {stopped ? null : (
        <button
          className="hit-area text-map-blue type-body strong disabled:text-muted self-start"
          disabled={state === "stopping"}
          onClick={() => {
            void stop();
          }}
          type="button"
        >
          {state === "stopping" ? "Stopping" : "Stop"}
        </button>
      )}
    </div>
  );
};

interface CodePanelProps {
  lines: readonly Line[];
  raw: string;
}

const TOKEN_TONE = {
  keyword: "text-code-text",
  plain: "text-code-text",
  string: "text-code-string",
} as const;

export const CodePanel = ({ lines, raw }: CodePanelProps) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = showRaw ? raw : lines.map((line) => lineText(line)).join("\n");
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 1200);
  };
  return (
    <section className="rounded-group bg-ink flex min-h-0 flex-col overflow-hidden">
      <div className="border-code-rule flex h-9 shrink-0 items-center justify-between border-b px-3">
        <div className="flex gap-3">
          {(["Code", "Results"] as const).map((view) => (
            <button
              aria-pressed={(view === "Results") === showRaw}
              className="hit-area text-code-muted type-label hover:text-code-text aria-pressed:text-code-text transition-colors duration-150"
              key={view}
              onClick={() => {
                setShowRaw(view === "Results");
              }}
              type="button"
            >
              {view}
            </button>
          ))}
        </div>
        <button
          className="hit-area text-code-text type-label hover:text-paper transition-colors duration-150"
          onClick={() => {
            void copy();
          }}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="type-code min-h-0 overflow-auto px-3 pt-2.5 pb-3 [overflow-wrap:normal] whitespace-pre">
        {showRaw ? (
          <code className="text-code-text">{raw}</code>
        ) : (
          <code>
            {lines.map((line, index) => (
              <span className="block min-h-4.5" key={String(index)}>
                {line.map((token, at) => (
                  <span className={TOKEN_TONE[token.kind]} key={String(at)}>
                    {token.text}
                  </span>
                ))}
              </span>
            ))}
          </code>
        )}
      </pre>
    </section>
  );
};
