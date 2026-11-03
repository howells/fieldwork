/// <reference lib="dom" />

// First-view entrances. An element with data-reveal="" waits ("waiting")
// until 40% of it is on screen, then shows ("shown"), once. Each component's
// CSS draws its own entrance between the two. With reduced motion nothing
// waits, so the element is simply there.

export const bindReveals = () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          entry.target.dataset.reveal = "shown";
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.4 }
  );
  for (const element of document.querySelectorAll<HTMLElement>(
    '[data-reveal=""]'
  )) {
    element.dataset.reveal = "waiting";
    observer.observe(element);
  }
};
