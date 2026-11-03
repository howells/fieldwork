/// <reference lib="dom" />

// The lifecycle every client script on the site shares: initialize each
// matching element once, now and after each page load, since Astro's client
// router swaps pages without reloading scripts.

export const bindAll = (
  selector: string,
  init: (element: HTMLElement) => void
) => {
  const bind = () => {
    for (const element of document.querySelectorAll<HTMLElement>(
      `${selector}:not([data-bound])`
    )) {
      element.dataset.bound = "";
      init(element);
    }
  };
  bind();
  document.addEventListener("astro:page-load", bind);
};
