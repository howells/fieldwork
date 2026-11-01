import * as z from "zod/mini";

import {
  arrayOf,
  looseObject,
  nonEmptyString,
  optionalNumber,
  optionalScalar,
  optionalString,
  warnings,
} from "../../parse.js";

/** SerpApi's `error` note: its text when it is a non-empty string, and the warnings it amounts to. */
const ErrorNote = z.union([
  z.pipe(
    nonEmptyString,
    z.transform((message) => ({ message, warnings: [message] }))
  ),
  z.pipe(
    warnings,
    z.transform((entries) => ({ message: undefined, warnings: entries }))
  ),
]);

/** An organic result: a web result, a scholar citation or a patent. */
const Organic = looseObject({
  author: optionalString,
  date: optionalString,
  favicon: optionalString,
  inventor: optionalString,
  link: optionalString,
  patent_link: optionalString,
  publication_date: optionalString,
  resources: arrayOf(looseObject({ link: optionalString })),
  snippet: optionalString,
  thumbnail: optionalString,
  title: optionalString,
});

const storyShape = {
  date: optionalString,
  iso_date: optionalString,
  link: optionalString,
  source: looseObject({
    authors: arrayOf(z.string()),
    icon: optionalString,
  }),
  thumbnail: optionalString,
  title: optionalString,
};

const Story = looseObject(storyShape);

/** A news result: a story, or a group with a `highlight` and `stories`. */
const NewsResult = looseObject({
  ...storyShape,
  highlight: Story,
  stories: arrayOf(Story),
});

const ShoppingItem = looseObject({
  extracted_price: optionalScalar,
  link: optionalString,
  price: optionalString,
  product_link: optionalString,
  rating: optionalNumber,
  reviews: optionalNumber,
  snippet: optionalString,
  thumbnail: optionalString,
  title: optionalString,
});

const Place = looseObject({
  address: optionalString,
  description: optionalString,
  gps_coordinates: looseObject({
    latitude: optionalNumber,
    longitude: optionalNumber,
  }),
  place_id: optionalString,
  rating: optionalNumber,
  reviews: optionalNumber,
  thumbnail: optionalString,
  title: optionalString,
  website: optionalString,
});

/** An answer box. An absent or null one reads as undefined; any other value that is not an object has every field absent. */
const AnswerBox = looseObject({
  answer: optionalString,
  result: optionalScalar,
  snippet: optionalString,
});

const ImageItem = looseObject({
  link: optionalString,
  original: optionalString,
  original_height: optionalNumber,
  original_width: optionalNumber,
  thumbnail: optionalString,
  title: optionalString,
});

/** A `/search` response for any engine; each engine reads only its own sections. */
export const SearchResponse = looseObject({
  answer_box: z.union([
    z.pipe(
      z.optional(z.null()),
      z.transform((): undefined => undefined)
    ),
    AnswerBox,
  ]),
  answer_box_list: arrayOf(AnswerBox),
  categorized_shopping_results: arrayOf(
    looseObject({ shopping_results: arrayOf(ShoppingItem) })
  ),
  error: ErrorNote,
  images_results: arrayOf(ImageItem),
  inline_shopping_results: arrayOf(ShoppingItem),
  local_results: arrayOf(Place),
  news_results: arrayOf(NewsResult),
  organic_results: arrayOf(Organic),
  place_results: Place,
  search_metadata: looseObject({
    id: optionalScalar,
    status: optionalString,
  }),
  shopping_results: arrayOf(ShoppingItem),
});

/** `/account`: the plan and its usage. */
export const AccountResponse = looseObject({
  last_hour_searches: optionalNumber,
  plan_renewal_date: optionalString,
  plan_searches_left: optionalNumber,
  searches_per_month: optionalNumber,
  this_hour_searches: optionalNumber,
  this_month_usage: optionalNumber,
});

export type SearchBody = z.output<typeof SearchResponse>;
export type OrganicBlock = z.output<typeof Organic>;
export type StoryBlock = z.output<typeof Story>;
export type ShoppingBlock = z.output<typeof ShoppingItem>;
export type PlaceBlock = z.output<typeof Place>;
export type AnswerBoxBlock = z.output<typeof AnswerBox>;
