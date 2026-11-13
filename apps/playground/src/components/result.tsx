"use client";

// The finished run: the cited answer, the product's variants, the values
// pulled off a page, and a box for the next question.
import { useState } from "react";

import type { Answer, Piece } from "@/lib/answer";
import type { Field } from "@/lib/findings";
import {
  NOT_FOUND,
  deliveryOf,
  fieldLabel,
  optionName,
  variantName,
} from "@/lib/findings";
import { domainOf, priceText } from "@/lib/format";
import type { ProductOutput, Variant } from "@/lib/outputs";
import { PROVIDER_LABELS, isProviderId } from "@/lib/providers";

const providerLabel = (id: string): string =>
  isProviderId(id) ? PROVIDER_LABELS[id] : id;

const Cite = ({ number, url }: { number: number; url: string }) => (
  <a
    className="figures text-map-blue type-micro hover:text-ink px-px align-super transition-colors duration-150"
    href={url}
    rel="noreferrer"
    target="_blank"
    title={domainOf(url)}
  >
    {number}
  </a>
);

/** A citation follows its word after a space, unless it opens a bracket or follows one. */
const spaceBefore = (pieces: readonly Piece[], index: number): string => {
  const before = pieces[index - 1];
  return before?.kind === "text" && /[\s(]$/u.test(before.text) ? "" : " ";
};

const Paragraph = ({
  clamped = false,
  pieces,
}: {
  clamped?: boolean;
  pieces: readonly Piece[];
}) => (
  <p className={`type-body max-w-[76ch] ${clamped ? "line-clamp-4" : ""}`}>
    {pieces.map((piece, index) =>
      piece.kind === "text" ? (
        <span key={`t${String(index)}`}>{piece.text}</span>
      ) : (
        <span key={`c${String(index)}`}>
          {spaceBefore(pieces, index)}
          <Cite number={piece.number} url={piece.url} />
        </span>
      )
    )}
  </p>
);

/** Past this many words the answer opens folded to its first lines. */
const LONG_ANSWER = 140;

const wordsIn = (paragraphs: readonly (readonly Piece[])[]): number =>
  paragraphs
    .flat()
    .map((piece) => (piece.kind === "text" ? piece.text : ""))
    .join(" ")
    .split(/\s+/u)
    .filter((word) => word !== "").length;

export const AnswerBlock = ({ answer }: { answer: Answer }) => {
  const long = wordsIn(answer.paragraphs) > LONG_ANSWER;
  const [open, setOpen] = useState(false);
  const folded = long && !open;
  const shown = folded ? answer.paragraphs.slice(0, 1) : answer.paragraphs;
  return (
    <div className="animate-rise flex flex-col gap-2">
      {answer.headline === undefined ? null : (
        <h2 className="type-title max-w-[60ch] text-pretty">
          {answer.headline}
        </h2>
      )}
      {shown.map((pieces, index) => (
        <Paragraph clamped={folded} key={String(index)} pieces={pieces} />
      ))}
      {long ? (
        <button
          aria-expanded={open}
          className="hit-area text-graphite type-label strong hover:text-ink self-start transition-colors duration-150"
          onClick={() => {
            setOpen(!open);
          }}
          type="button"
        >
          {open ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
};

const SHOWN = 6;

interface Columns {
  delivery: boolean;
  sku: boolean;
}

const VariantRow = ({
  columns,
  index,
  variant,
}: {
  columns: Columns;
  index: number;
  variant: Variant;
}) => {
  const [image] = variant.images ?? [];
  const price = priceText(variant.price);
  const was = priceText(variant.originalPrice);
  return (
    <tr className="border-rule h-9 border-b">
      <td className="p-0">
        {image === undefined ? (
          <span
            aria-hidden
            className="rounded-swatch bg-wash block aspect-[4/3] w-8"
          />
        ) : (
          <img
            alt=""
            className="rounded-swatch bg-wash block aspect-[4/3] w-8 object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={image.url}
          />
        )}
      </td>
      <td className="pl-2.5">
        <span className="flex items-center gap-2">
          <span className="type-body truncate">
            {variantName(variant, index)}
          </span>
          {was === undefined || was === price ? null : (
            <s className="text-graphite type-label shrink-0">was {was}</s>
          )}
        </span>
      </td>
      <td className="figures type-body strong pl-2.5 text-right whitespace-nowrap">
        {price ?? ""}
      </td>
      {columns.delivery ? (
        <td
          className={`type-body hidden truncate pl-2.5 sm:table-cell ${variant.inStock === true ? "" : "text-graphite"}`}
        >
          {deliveryOf(variant)}
        </td>
      ) : null}
      {columns.sku ? (
        <td className="text-graphite type-code hidden truncate pl-2.5 sm:table-cell">
          {variant.sku ?? ""}
        </td>
      ) : null}
    </tr>
  );
};

interface VariantTableProps {
  ago: string;
  product: ProductOutput;
  provider: string;
}

/** One variant reads better as label and value than as a one-row table. */
const VariantFacts = ({ variant }: { variant: Variant }) => {
  const [image] = variant.images ?? [];
  const price = priceText(variant.price);
  const was = priceText(variant.originalPrice);
  const rows = [
    ...Object.entries(variant.values ?? {}).map(([name, value]) => ({
      label: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    })),
    { label: "Price", value: price ?? "" },
    { label: "Was", value: was === price ? "" : (was ?? "") },
    { label: "Delivery", value: deliveryOf(variant) },
    { label: "SKU", mono: true, value: variant.sku ?? "" },
  ].filter((row) => row.value !== "");
  return (
    <div className="border-rule-strong flex items-start gap-3 border-t pt-2">
      {image === undefined ? null : (
        <img
          alt=""
          className="rounded-swatch bg-wash aspect-[4/3] w-20 shrink-0 object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={image.url}
        />
      )}
      <dl className="grid min-w-0 grow grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        {rows.map((row) => (
          <div className="contents" key={row.label}>
            <dt className="text-graphite type-label pt-0.5">{row.label}</dt>
            <dd
              className={`figures truncate ${"mono" in row ? "type-code text-graphite" : "type-body"}`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export const VariantTable = ({ ago, product, provider }: VariantTableProps) => {
  const [all, setAll] = useState(false);
  const { variants } = product;
  const option = optionName(variants);
  const shown = all ? variants : variants.slice(0, SHOWN);
  const hidden = variants.length - shown.length;
  const where =
    product.url === undefined ? "on the page" : `at ${domainOf(product.url)}`;
  const columns: Columns = {
    delivery: variants.some((variant) => deliveryOf(variant) !== ""),
    sku: variants.some((variant) => variant.sku !== undefined),
  };
  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pb-1.5">
        <h3 className="type-body strong">
          {variants.length === 1
            ? `The product ${where}`
            : `Every ${option.toLowerCase()} ${where}`}
        </h3>
        <span className="text-muted type-label">
          {providerLabel(provider)}, {ago}
        </span>
      </div>
      {variants.length === 1 && variants[0] !== undefined ? (
        <VariantFacts variant={variants[0]} />
      ) : (
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-rule-strong text-graphite h-7 border-b text-left">
              <th className="w-8 p-0" scope="col">
                <span className="sr-only">Image</span>
              </th>
              <th className="type-label pl-2.5" scope="col">
                {option}
              </th>
              <th
                className="type-label w-[104px] pl-2.5 text-right"
                scope="col"
              >
                Price
              </th>
              {columns.delivery ? (
                <th
                  className="type-label hidden w-[120px] pl-2.5 sm:table-cell"
                  scope="col"
                >
                  Delivery
                </th>
              ) : null}
              {columns.sku ? (
                <th
                  className="type-label hidden w-[132px] pl-2.5 sm:table-cell"
                  scope="col"
                >
                  SKU
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((variant, index) => (
              <VariantRow
                columns={columns}
                index={index}
                key={`${variant.sku ?? ""}-${String(index)}`}
                variant={variant}
              />
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 ? (
        <button
          className="hit-area text-map-blue type-label strong flex h-8 items-center self-start pl-10.5 text-left"
          onClick={() => {
            setAll(true);
          }}
          type="button"
        >
          Show {hidden} more
        </button>
      ) : null}
    </section>
  );
};

interface FieldsTableProps {
  fields: readonly Field[];
  provider: string;
  url?: string;
}

export const FieldsTable = ({ fields, provider, url }: FieldsTableProps) => {
  const urls = [
    ...new Set(
      fields.flatMap((field) => field.citations.map((citation) => citation.url))
    ),
  ];
  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 pb-1.5">
        <h3 className="type-body strong">
          Values {url === undefined ? "pulled out" : `from ${domainOf(url)}`}
        </h3>
        <span className="text-muted type-label">{providerLabel(provider)}</span>
      </div>
      <dl className="border-rule-strong flex flex-col border-t">
        {fields.map((field) => (
          <div
            className="border-rule flex min-h-8 items-baseline gap-3 border-b py-1.5"
            key={field.name}
          >
            <dt className="text-graphite type-label w-24 shrink-0 sm:w-36">
              {fieldLabel(field.name)}
            </dt>
            <dd
              className={`type-body min-w-0 grow basis-0 whitespace-pre-line ${field.value === NOT_FOUND ? "text-graphite" : ""}`}
            >
              {field.value}
              {field.citations.map((citation) => (
                <span key={citation.url}>
                  {" "}
                  <Cite
                    number={urls.indexOf(citation.url) + 1}
                    url={citation.url}
                  />
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

interface FollowUpProps {
  disabled: boolean;
  onAsk: (question: string) => void;
  placeholder: string;
}

export const FollowUp = ({ disabled, onAsk, placeholder }: FollowUpProps) => {
  const [text, setText] = useState("");
  const ready = text.trim() !== "" && !disabled;
  return (
    <form
      className="rounded-group border-rule bg-paper shadow-hairline focus-within:border-rule-strong flex h-10 shrink-0 items-center justify-between gap-2 border pr-1.5 pl-3 transition-colors duration-150"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) {
          onAsk(text.trim());
          setText("");
        }
      }}
    >
      <input
        aria-label="Ask a follow-up"
        className="type-body caret-map-blue placeholder:text-muted h-full min-w-0 grow bg-transparent outline-none"
        onChange={(event) => {
          setText(event.target.value);
        }}
        placeholder={placeholder}
        value={text}
      />
      <button
        className="hit-area rounded-control bg-ink text-paper type-body strong flex h-7 items-center px-2.5 transition-opacity duration-150 disabled:opacity-40"
        disabled={!ready}
        type="submit"
      >
        Ask
      </button>
    </form>
  );
};
