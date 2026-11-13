import { describe, expect, it } from "vitest";

import { fieldLabel, valueText } from "@/lib/findings";
import { priceText, scheduleText, spendText, usd } from "@/lib/format";

describe("formatting", () => {
  it("shows costs in dollars to three decimals, and tiny ones as under a tenth of a cent", () => {
    expect(usd(0.061)).toBe("$0.061");
    expect(usd(0.0002)).toBe("<$0.001");
    expect(usd(0)).toBe("$0.000");
  });

  it("keeps dollars and credits apart, and counts credits in the singular for one", () => {
    expect(spendText(0.0034, 1)).toBe("$0.003 · 1 credit");
    expect(spendText(0.004, 13)).toBe("$0.004 · 13 credits");
    expect(spendText(0.001, 0)).toBe("$0.001");
  });

  it("writes shop prices in the page's own currency, never converted", () => {
    expect(
      priceText({
        amount: "2960.00",
        currency: "GBP",
        formatted: "2960.00 GBP",
      })
    ).toBe("£2,960.00");
    expect(priceText({ formatted: "£14.50 / m²" })).toBe("£14.50 / m²");
  });

  it("says daily schedules in words", () => {
    expect(scheduleText("0 9 * * *")).toBe("every day at 09:00 UTC");
    expect(scheduleText("*/5 * * * *")).toBe("*/5 * * * *");
  });

  it("labels and shows pulled-out values", () => {
    expect(fieldLabel("pricePerSquareMetre")).toBe("Price per square metre");
    expect(fieldLabel("where_it_can_go")).toBe("Where it can go");
    expect(valueText(["Kitchen", "Bathroom"])).toBe("Kitchen, Bathroom");
    expect(valueText("")).toBe("Not on the page");
  });
});
