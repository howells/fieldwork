/// <reference lib="dom" />

import { bindAll } from "./bind";

// First-view entrances. An element with data-reveal="" waits ("waiting")
// until 40% of it is on screen, then shows ("shown"), once. Each component's
// CSS draws its own entrance between the two. With reduced motion nothing
// waits, so the element is simply there. Importing this file registers it.

export const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs `reveal` once, the first time 40% of the element is on screen. Returns
 * whether it is waiting: with reduced motion it is not, and never runs it.
 */
export const onReveal = (element: Element, reveal: () => void) => {
  if (reducedMotion()) {
    return false;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        reveal();
      }
    },
    { threshold: 0.4 }
  );
  observer.observe(element);
  return true;
};

bindAll('[data-reveal=""]', (element) => {
  const waiting = onReveal(element, () => {
    element.dataset.reveal = "shown";
  });
  if (waiting) {
    element.dataset.reveal = "waiting";
  }
});
