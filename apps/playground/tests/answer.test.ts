import { describe, expect, it } from "vitest";

import { parseAnswer } from "@/lib/answer";

describe(parseAnswer, () => {
  it("splits the headline from the paragraph and numbers the citations", () => {
    const answer = parseAnswer(
      "# From £2,849, in 9 fabrics.\n\nHeal's asks **£2,849** [1](https://heals.com/a). Nest is £50 more [2](https://nest.co.uk/b)."
    );
    expect(answer.headline).toBe("From £2,849, in 9 fabrics.");
    expect(answer.paragraphs).toStrictEqual([
      [
        { kind: "text", text: "Heal's asks £2,849 " },
        { kind: "cite", number: 1, url: "https://heals.com/a" },
        { kind: "text", text: ". Nest is £50 more " },
        { kind: "cite", number: 2, url: "https://nest.co.uk/b" },
        { kind: "text", text: "." },
      ],
    ]);
    expect(answer.sources).toStrictEqual([
      { number: 1, url: "https://heals.com/a" },
      { number: 2, url: "https://nest.co.uk/b" },
    ]);
  });

  it("has no headline when the answer doesn't start with one", () => {
    expect(parseAnswer("Just a line.").headline).toBeUndefined();
  });
});
