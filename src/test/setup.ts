import "@testing-library/jest-dom/vitest";

// jsdom has no media playback; real playback is checked in Chrome.
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: async () => {},
});
Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => {} });

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
