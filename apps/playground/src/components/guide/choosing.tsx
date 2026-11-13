// How to choose: the rules in order.
import { GUIDE_RULES } from "@guide/tool-guide";

import { GuidePage } from "./guide-page";

export const Choosing = () => (
  <GuidePage
    lead={<p>Choose the output, then how to reach the source.</p>}
    title="How to choose"
  >
    <ol className="border-ink mt-4 border-t">
      {GUIDE_RULES.map((rule, index) => (
        <li
          className="border-rule grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-b py-4 lg:grid-cols-[28px_280px_minmax(0,1fr)] lg:gap-x-6"
          key={rule.title}
        >
          <span className="figures text-muted type-body">{index + 1}.</span>
          <h2 className="type-body strong">{rule.title}</h2>
          <p className="text-graphite type-body col-start-2 mt-2 lg:col-start-3 lg:mt-0">
            {rule.detail}
          </p>
        </li>
      ))}
    </ol>
  </GuidePage>
);
