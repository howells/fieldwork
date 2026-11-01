import { defineComponents } from "blume";

export default defineComponents({
  layout: {
    // The Paper design's footer on docs pages too, so the site has one footer.
    Footer: "./components/site-footer.astro",
  },
});
