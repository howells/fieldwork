import { FieldworkError } from "../../errors.js";
import type { ImageResult, Price, SearchResult } from "../../types.js";
import { compact, meta } from "../../util.js";
import type {
  AnswerBoxBlock,
  PlaceBlock,
  SearchBody,
  ShoppingBlock,
  StoryBlock,
} from "./response.js";

export const provider = "serpapi";

export const invalid = (message: string): FieldworkError =>
  new FieldworkError("InvalidRequest", `${provider} ${message}`, {
    provider,
  });

export const priceOf = (item: ShoppingBlock): Price | undefined => {
  const price = compact({
    amount: item.extracted_price,
    formatted: item.price,
  });
  return Object.keys(price).length > 0 ? price : undefined;
};

export const webResults = (body: SearchBody): SearchResult[] =>
  body.organic_results.flatMap((item) => {
    const url = item.link;
    return url === undefined
      ? []
      : [
          compact({
            author: item.author,
            favicon: item.favicon,
            image: item.thumbnail,
            kind: "web",
            publishedAt: item.date,
            snippet: item.snippet,
            title: item.title,
            url,
          }),
        ];
  });

export const imageResults = (body: SearchBody): ImageResult[] =>
  body.images_results.flatMap((item) => {
    const url = item.original;
    return url === undefined
      ? []
      : [
          compact({
            height: item.original_height,
            sourceUrl: item.link,
            thumbnailUrl: item.thumbnail,
            title: item.title,
            url,
            width: item.original_width,
          }),
        ];
  });

export const newsItem = (item: StoryBlock): SearchResult[] => {
  const url = item.link;
  if (url === undefined) {
    return [];
  }
  const { authors } = item.source;
  return [
    compact({
      author: authors.length > 0 ? authors.join(", ") : undefined,
      favicon: item.source.icon,
      image: item.thumbnail,
      kind: "news",
      publishedAt: item.iso_date ?? item.date,
      title: item.title,
      url,
    }),
  ];
};

export const newsResults = (body: SearchBody): SearchResult[] =>
  // A story group has a `highlight` and `stories` instead of one link.
  body.news_results.flatMap((item) => [
    ...newsItem(item),
    ...newsItem(item.highlight),
    ...item.stories.flatMap((story) => newsItem(story)),
  ]);

export const shoppingResults = (body: SearchBody): SearchResult[] => {
  const categorized = body.categorized_shopping_results.flatMap(
    (group) => group.shopping_results
  );
  const items = [
    body.shopping_results,
    categorized,
    body.inline_shopping_results,
  ].find((group) => group.length > 0);
  return (items ?? []).flatMap((item) => {
    const url = item.link ?? item.product_link;
    return url === undefined
      ? []
      : [
          compact({
            image: item.thumbnail,
            kind: "shopping",
            price: priceOf(item),
            rating: item.rating,
            reviewCount: item.reviews,
            snippet: item.snippet,
            title: item.title,
            url,
          }),
        ];
  });
};

export const mapsUrl = (item: PlaceBlock): string | undefined => {
  if (item.website !== undefined) {
    return item.website;
  }
  const id = item.place_id;
  const { title } = item;
  // Google's documented Maps URL for a place id; the result has no page of its own.
  return id === undefined || title === undefined
    ? undefined
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}&query_place_id=${encodeURIComponent(id)}`;
};

export const placeResults = (body: SearchBody): SearchResult[] => {
  // A query that names one place returns a single `place_results` object instead.
  const single = body.place_results;
  const places = body.local_results;
  const items =
    places.length === 0 && Object.keys(single).length > 0 ? [single] : places;
  return items.flatMap((item) => {
    const url = mapsUrl(item);
    if (url === undefined) {
      return [];
    }
    const coordinates = item.gps_coordinates;
    const place = compact({
      address: item.address,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
    return [
      compact({
        image: item.thumbnail,
        kind: "place",
        place: Object.keys(place).length > 0 ? place : undefined,
        rating: item.rating,
        reviewCount: item.reviews,
        snippet: item.description,
        title: item.title,
        url,
      }),
    ];
  });
};

export const scholarResults = (body: SearchBody): SearchResult[] =>
  body.organic_results.flatMap((item) => {
    // Some citations have no page; a linked full text stands in for it.
    const url = item.link ?? item.resources[0]?.link;
    return url === undefined
      ? []
      : [
          compact({
            kind: "scholar",
            snippet: item.snippet,
            title: item.title,
            url,
          }),
        ];
  });

export const patentResults = (body: SearchBody): SearchResult[] =>
  body.organic_results.flatMap((item) => {
    const url = item.patent_link;
    return url === undefined
      ? []
      : [
          compact({
            author: item.inventor,
            image: item.thumbnail,
            kind: "patent",
            publishedAt: item.publication_date,
            snippet: item.snippet,
            title: item.title,
            url,
          }),
        ];
  });

const answerOf = (box: AnswerBoxBlock | undefined): string | undefined =>
  box?.answer ?? (box?.result === "" ? undefined : box?.result) ?? box?.snippet;

export const answerText = (body: SearchBody): string | undefined =>
  answerOf(body.answer_box ?? body.answer_box_list[0]);

export const searchMeta = (body: SearchBody) =>
  meta({
    requestId: body.search_metadata.id,
    // A search that found nothing is a success that carries an `error` note.
    warnings: body.error.warnings,
  });

/** The reason a search failed, or undefined when it did not. */
export const searchFailure = (body: SearchBody): string | undefined =>
  body.search_metadata.status === "Error"
    ? `serpapi search failed: ${body.error.message ?? "no reason given"}`
    : undefined;
