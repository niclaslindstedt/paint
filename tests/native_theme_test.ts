// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The theme reporter (`native/src/injected.ts`) and the status-bar style the
// shell derives from what it reports.
//
// Since the iOS WebView runs edge to edge, the page's own background sits
// under the status bar. The bar was styled "auto", which follows the phone's
// light or dark setting, so a dark page on a light-mode phone got dark clock
// and battery icons on a dark background. The style now comes from the colour
// the page reports, and these pin both halves: the message the injected script
// posts (RUN against a stand-in for the WebView's window, not inspected), and
// the luminance → style decision.

import { describe, expect, it } from "vitest";

import { FALLBACK_BACKGROUND } from "../native/src/config.ts";
import {
  AFTER_LOAD_SCRIPT,
  REPORT_TYPE,
  isReport,
  statusBarStyleFor,
} from "../native/src/injected.ts";

/** A stand-in page: `vars` is what `getComputedStyle(<html>)` resolves, and
 *  every timer, observer and listener is captured so the test drives them. */
function fakePage(vars: Record<string, string>) {
  const posted: string[] = [];
  const timers: Array<() => void> = [];
  const observers: Array<() => void> = [];
  const media: Array<() => void> = [];
  const visibility: Array<() => void> = [];
  const win: Record<string, unknown> = {
    ReactNativeWebView: { postMessage: (data: string) => posted.push(data) },
    matchMedia: () => ({
      addEventListener: (_: string, fn: () => void) => media.push(fn),
    }),
  };
  const document = {
    hidden: false,
    documentElement: {},
    addEventListener: (_: string, fn: () => void) => visibility.push(fn),
  };
  const getComputedStyle = () => ({
    getPropertyValue: (name: string) => vars[name] ?? "",
  });
  class MutationObserver {
    constructor(private readonly fn: () => void) {}
    observe() {
      observers.push(this.fn);
    }
  }
  const setTimeout = (fn: () => void) => timers.push(fn);
  const clearTimeout = () => {};
  const run = () =>
    new Function(
      "window",
      "document",
      "getComputedStyle",
      "MutationObserver",
      "setTimeout",
      "clearTimeout",
      AFTER_LOAD_SCRIPT,
    )(
      win,
      document,
      getComputedStyle,
      MutationObserver,
      setTimeout,
      clearTimeout,
    );
  /** Fire every pending timer (the debounce and the settle re-read). */
  const flush = () => {
    while (timers.length) timers.shift()!();
  };
  const messages = () => posted.map((data) => JSON.parse(data) as unknown);
  return { vars, run, flush, messages, observers, media, visibility };
}

describe("the theme reporter", () => {
  it("posts the page's resolved background under its own type", () => {
    const page = fakePage({ "--page-bg": "#010409", "--fg": "#e6edf3" });
    page.run();
    const [first] = page.messages();
    expect(first).toMatchObject({
      type: REPORT_TYPE,
      theme: { background: "#010409" },
    });
    expect(isReport(first)).toBe(true);
  });

  it("installs once, however often the shell injects it", () => {
    const page = fakePage({ "--page-bg": "#010409" });
    page.run();
    page.run();
    expect(page.observers).toHaveLength(1);
    expect(page.media).toHaveLength(1);
  });

  it("re-reports when the theme moves, and on the device switching appearance", () => {
    const page = fakePage({ "--page-bg": "#010409" });
    page.run();
    page.flush();
    page.vars["--page-bg"] = "#f6f8fa";
    page.observers[0]();
    page.flush();
    page.vars["--page-bg"] = "#16161e";
    page.media[0]();
    page.flush();
    const backgrounds = page
      .messages()
      .map((m) => (m as { theme: { background: string } }).theme.background);
    expect(backgrounds.at(-2)).toBe("#f6f8fa");
    expect(backgrounds.at(-1)).toBe("#16161e");
  });

  it("carries a hostile value as data, never as script", () => {
    const hostile = `"); window.pwned = true; ("</script>`;
    const page = fakePage({ "--page-bg": hostile });
    page.run();
    const [first] = page.messages();
    expect((first as { theme: { background: string } }).theme.background).toBe(
      hostile,
    );
    // The channel name is spliced in as a JSON string literal.
    expect(AFTER_LOAD_SCRIPT).toContain(JSON.stringify(REPORT_TYPE));
    expect(statusBarStyleFor(hostile)).toBe("auto");
  });

  it("is the only thing the shell treats as a report", () => {
    expect(isReport({ type: REPORT_TYPE, theme: { background: "#fff" } })).toBe(
      true,
    );
    expect(isReport({ type: "something-else", theme: {} })).toBe(false);
    expect(isReport({ type: REPORT_TYPE })).toBe(false);
    expect(isReport({ type: REPORT_TYPE, theme: null })).toBe(false);
    expect(isReport(null)).toBe(false);
    expect(isReport("x")).toBe(false);
  });
});

describe("the status-bar style", () => {
  it("is light icons over a dark page", () => {
    for (const dark of [
      "#010409",
      "#16161e",
      "#2e3440",
      "#002b36",
      "#000",
      "#0b0d10ff",
      "rgb(1, 4, 9)",
      "rgba(22, 22, 30, 0.9)",
      "rgb(46 52 64)",
      " #1D2021 ",
    ]) {
      expect(statusBarStyleFor(dark), dark).toBe("light");
    }
  });

  it("is dark icons over a light page", () => {
    for (const light of [
      "#f6f8fa",
      "#ffffff",
      "#fff",
      "#eee8d5",
      "#faf4ed",
      "rgb(230, 233, 239)",
      "rgb(255 255 255 / 1)",
    ]) {
      expect(statusBarStyleFor(light), light).toBe("dark");
    }
  });

  it("stays as it was until there is a colour to go on", () => {
    for (const nothing of [
      null,
      undefined,
      "",
      "var(--x)",
      "oklch(0.2 0.02 260)",
      "#12345",
      "rgb(300, 0, 0)",
    ]) {
      expect(statusBarStyleFor(nothing), String(nothing)).toBe("auto");
    }
  });

  it("matches the launch colour on the failure screen", () => {
    expect(statusBarStyleFor(FALLBACK_BACKGROUND)).toBe("light");
  });
});
