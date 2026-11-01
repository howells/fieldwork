import { FieldworkError } from "../../errors.js";
import type { Price, SearchResult } from "../../types.js";
import {
  compact,
  list,
  meta,
  num,
  record,
  scalar,
  strings,
  text,
} from "../../util.js";
import type { Json } from "../../util.js";

export const provider = "serpapi";

export function invalid(message: string): FieldworkError {
  return new FieldworkError("InvalidRequest", `${provider} ${message}`, {
    provider,
  });
}

export function priceOf(item: Json): Price | undefined {
  const price = compact({
    amount: scalar(item.extracted_price),
    formatted: text(item.price),
  });
  return Object.keys(price).length > 0 ? price : undefined;
}

export function webResults(response: Json): SearchResult[] {
  return list(response.organic_results).flatMap((entry) => {
    const item = record(entry);
    const url = text(item.link);
    return url
      ? [
          compact({
            author: text(item.author),
            favicon: text(item.favicon),
            image: text(item.thumbnail),
            kind: "web",
            publishedAt: text(item.date),
            snippet: text(item.snippet),
            title: text(item.title),
            url,
          }),
        ]
      : [];
  });
}

export function newsItem(entry: unknown): SearchResult[] {
  const item = record(entry);
  const url = text(item.link);
  if (!url) {
    return [];
  }
  const source = record(item.source);
  const authors = strings(source.authors);
  return [
    compact({
      author: authors?.join(", "),
      favicon: text(source.icon),
      image: text(item.thumbnail),
      kind: "news",
      publishedAt: text(item.iso_date) ?? text(item.date),
      title: text(item.title),
      url,
    }),
  ];
}

export function newsResults(response: Json): SearchResult[] {
  // A story group has a `highlight` and `stories` instead of one link.
  return list(response.news_results).flatMap((entry) => {
    const item = record(entry);
    return [
      ...newsItem(item),
      ...newsItem(item.highlight),
      ...list(item.stories).flatMap((story) => newsItem(story)),
    ];
  });
}

export function shoppingResults(response: Json): SearchResult[] {
  const categorized = list(response.categorized_shopping_results).flatMap(
    (group) => list(record(group).shopping_results)
  );
  const items = [
    list(response.shopping_results),
    categorized,
    list(response.inline_shopping_results),
  ].find((group) => group.length > 0);
  return (items ?? []).flatMap((entry) => {
    const item = record(entry);
    const url = text(item.link) ?? text(item.product_link);
    return url
      ? [
          compact({
            image: text(item.thumbnail),
            kind: "shopping",
            price: priceOf(item),
            rating: num(item.rating),
            reviewCount: num(item.reviews),
            snippet: text(item.snippet),
            title: text(item.title),
            url,
          }),
        ]
      : [];
  });
}

export function mapsUrl(item: Json): string | undefined {
  const website = text(item.website);
  if (website) {
    return website;
  }
  const id = text(item.place_id);
  const title = text(item.title);
  // Google's documented Maps URL for a place id; the result has no page of its own.
  return id && title
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}&query_place_id=${encodeURIComponent(id)}`
    : undefined;
}

export function placeResults(response: Json): SearchResult[] {
  // A query that names one place returns a single `place_results` object instead.
  const single = record(response.place_results);
  const places = list(response.local_results);
  const items =
    places.length === 0 && Object.keys(single).length > 0 ? [single] : places;
  return items.flatMap((entry) => {
    const item = record(entry);
    const url = mapsUrl(item);
    if (!url) {
      return [];
    }
    const coordinates = record(item.gps_coordinates);
    const place = compact({
      address: text(item.address),
      latitude: num(coordinates.latitude),
      longitude: num(coordinates.longitude),
    });
    return [
      compact({
        image: text(item.thumbnail),
        kind: "place",
        place: Object.keys(place).length > 0 ? place : undefined,
        rating: num(item.rating),
        reviewCount: num(item.reviews),
        snippet: text(item.description),
        title: text(item.title),
        url,
      }),
    ];
  });
}

export function scholarResults(response: Json): SearchResult[] {
  return list(response.organic_results).flatMap((entry) => {
    const item = record(entry);
    // Some citations have no page; a linked full text stands in for it.
    const url = text(item.link) ?? text(record(list(item.resources)[0]).link);
    return url
      ? [
          compact({
            kind: "scholar",
            snippet: text(item.snippet),
            title: text(item.title),
            url,
          }),
        ]
      : [];
  });
}

export function patentResults(response: Json): SearchResult[] {
  return list(response.organic_results).flatMap((entry) => {
    const item = record(entry);
    const url = text(item.patent_link);
    return url
      ? [
          compact({
            author: text(item.inventor),
            image: text(item.thumbnail),
            kind: "patent",
            publishedAt: text(item.publication_date),
            snippet: text(item.snippet),
            title: text(item.title),
            url,
          }),
        ]
      : [];
  });
}

/** The answer box's own answer, when Google showed one. */
export function answerText(response: Json): string | undefined {
  const box = record(response.answer_box ?? list(response.answer_box_list)[0]);
  return text(box.answer) ?? text(scalar(box.result)) ?? text(box.snippet);
}

export function searchMeta(response: Json) {
  return meta({
    requestId: record(response.search_metadata).id,
    // A search that found nothing is a success that carries an `error` note.
    warnings: response.error,
  });
}

/** SerpApi reports a failed search in the body, with status "Error". */
export function failIfError(response: Json) {
  if (record(response.search_metadata).status === "Error") {
    throw new FieldworkError(
      "ProviderError",
      `serpapi search failed: ${text(response.error) ?? "no reason given"}`,
      { cause: response, provider, retryable: true }
    );
  }
}
