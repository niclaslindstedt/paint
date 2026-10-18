// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app's privacy page is true of the phone app alone: it names no
// website, no web host, no GitHub, no browser, no PWA and no localStorage, and
// says the only network traffic is the iCloud Drive sync the reader turns on.
// The website's copy still says where it is served from, and the desktop
// app's is unchanged. No build's copy says "no account", and neither does any
// catalog, in any language (the owner's decision).
//
// The page is rendered by walking the element tree it returns — the tests run
// in node, with no DOM — after the build flags are set as globals and the
// module imported afresh. The last case builds the phone app for real and
// checks the other editions' wording left its bundle and its pages, rather
// than riding along as dead code.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

type Flags = { native: boolean; shell: boolean };

const WEBSITE: Flags = { native: false, shell: false };
const DESKTOP: Flags = { native: false, shell: true };
// The phone build sets both flags (`native/scripts/bundle-web.mjs`).
const PHONE: Flags = { native: true, shell: true };

const root = join(__dirname, "..");

type Node =
  | { type: unknown; props: Record<string, unknown> }
  | string
  | number
  | boolean
  | null
  | undefined
  | Node[];

/** The text an element tree renders, with each link's target in brackets. */
function textOf(node: Node): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return `${node}`;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node.type === "function") {
    return textOf((node.type as (props: unknown) => Node)(node.props));
  }
  const href =
    typeof node.props.href === "string" ? `[${node.props.href}]` : "";
  return href + textOf(node.props.children as Node);
}

async function privacyText(flags: Flags): Promise<string> {
  vi.stubGlobal("__NATIVE_BUILD__", flags.native);
  vi.stubGlobal("__SHELL_BUILD__", flags.shell);
  vi.stubGlobal("__APP_NAME__", "Paint");
  vi.resetModules();
  const { PrivacyPage } = await import("../src/app/PrivacyPage.tsx");
  return textOf(PrivacyPage() as Node).replace(/\s+/g, " ");
}

/** What names another edition of the app, or where it is served from. */
const OTHER_EDITION =
  /website|web site|static site|on the web|github|browser|\bPWA\b|installed app|localStorage|niclaslindstedt/i;

const NO_ACCOUNT = /no account|inget? (?:något )?konto|utan (?:något )?konto/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the phone app's privacy page", () => {
  it("names no other edition, no web host, no Dropbox and no local folder", async () => {
    const text = await privacyText(PHONE);
    expect(text).not.toMatch(OTHER_EDITION);
    expect(text).not.toMatch(/Dropbox|local folder/i);
    expect(text).not.toMatch(NO_ACCOUNT);
  });

  it("says the app sends nothing but the sync the reader turns on", async () => {
    const text = await privacyText(PHONE);
    expect(text).toMatch(/come inside the download/);
    expect(text).toMatch(/sends nothing when it starts/);
    expect(text).toMatch(/only network traffic is the sync you turn on/);
    expect(text).toMatch(/iCloud Drive, through your own Apple Account/);
    expect(text).toMatch(/Deleting the app erases it/);
    expect(text).toMatch(/Server logs ?There are none/);
  });

  it("still links to the full policy", async () => {
    const text = await privacyText(PHONE);
    expect(text).toContain("[https://apps.agilator.se/paint/privacy/]");
  });
});

describe("the other builds' privacy page", () => {
  it("on the website still says where it is served from", async () => {
    const text = await privacyText(WEBSITE);
    expect(text).toContain("served as a static site at");
    expect(text).toContain("paint.niclaslindstedt.se");
    expect(text).toMatch(/The website is served by GitHub Pages/);
    expect(text).toMatch(/Local folder/);
    expect(text).toMatch(/Dropbox/);
  });

  it("in the desktop app still describes the browser and the website's host", async () => {
    const text = await privacyText(DESKTOP);
    expect(text).toMatch(/served as a static site on the web/);
    expect(text).toMatch(/Clearing your browser's site data/);
    expect(text).toMatch(/The website is served by GitHub Pages/);
    expect(text).toMatch(/Dropbox/);
    expect(text).not.toContain("niclaslindstedt");
  });

  it("says no account in no build", async () => {
    for (const flags of [WEBSITE, DESKTOP]) {
      const text = await privacyText(flags);
      expect(text).not.toMatch(NO_ACCOUNT);
      expect(text).toMatch(/nothing to sign up for/);
    }
  });
});

describe("the catalogs", () => {
  it("say no account in no language", () => {
    const dir = join(root, "src", "app", "i18n");
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(NO_ACCOUNT);
    }
  });
});

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

describe("the real phone build", () => {
  it("carries no other edition's wording in its privacy page or its documents", () => {
    const out = mkdtempSync(join(tmpdir(), "privacy-page-"));
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            key !== "NODE_ENV" &&
            !key.startsWith("VITEST") &&
            !key.startsWith("VITE_"),
        ),
      );
      execFileSync(
        process.execPath,
        [
          join(root, "node_modules", "vite", "bin", "vite.js"),
          "build",
          "--outDir",
          out,
          "--emptyOutDir",
          "--logLevel",
          "error",
        ],
        {
          cwd: root,
          env: { ...env, VITE_NATIVE_BUILD: "on", VITE_SHELL_BUILD: "on" },
          stdio: "pipe",
        },
      );
      const carrying = [...files(out)]
        .filter((path) => /\.(?:html|js)$/.test(path))
        .filter((path) =>
          /github pages|static site|the website|no account/i.test(
            readFileSync(path, "utf8"),
          ),
        )
        .map((path) => path.slice(out.length + 1));
      expect(carrying).toEqual([]);

      for (const page of ["index.html", join("privacy", "index.html")]) {
        const html = readFileSync(join(out, page), "utf8");
        expect(html).not.toMatch(/<!--|og:|twitter:|\bPWA\b|Dropbox/i);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
