// The docs' code colours, matching the home page's samples: map blue for
// keywords, a moss green for strings, graphite comments, ink for the rest.
// Every colour clears 4.5:1 on the code block's wash background.

const INK = "#121417";
const BLUE = "#1f3fd1";
const MOSS = "#2f6b4f";
const GRAPHITE = "#62676f";

export const fieldworkLight = {
  colors: {
    "editor.background": "#f5f6f3",
    "editor.foreground": INK,
  },
  name: "fieldwork-light",
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: GRAPHITE },
    },
    {
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "storage.modifier",
        "constant.language",
        "variable.language",
      ],
      settings: { foreground: BLUE },
    },
    {
      scope: ["string", "string.template", "punctuation.definition.string"],
      settings: { foreground: MOSS },
    },
    { scope: ["constant.numeric"], settings: { foreground: MOSS } },
    {
      scope: ["support.type.property-name.json"],
      settings: { foreground: BLUE },
    },
  ],
  type: "light" as const,
};
