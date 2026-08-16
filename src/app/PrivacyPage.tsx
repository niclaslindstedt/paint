// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Standalone privacy policy, served at `/privacy` (see `main.tsx`'s path switch
// and the `emit-privacy-alias` plugin in `vite.config.ts`), and linked from the
// side menu's About dropdown. Paint is local-first — by default no backend, no
// account, no analytics — but it also ships optional storage backends (a local
// folder, Dropbox, Google Drive) that send drawings off the browser only when
// the user explicitly connects one, so this policy covers both cases. It is
// English-only by design (a legal page, not chrome).
import { type ReactNode } from "react";

import { ArrowLeftIcon } from "@niclaslindstedt/oss-framework/components";

// Last meaningful change to the policy text below. Bump this whenever the
// wording is edited — it renders verbatim at the top of the page and is the
// only line readers have to look at to see how fresh the policy is.
const LAST_UPDATED = "2026-08-13";

export function PrivacyPage() {
  return (
    <div className="h-full overflow-y-auto bg-page-bg px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-fg">
      {/* `selectable`: the app selects no text by default (a drag is a gesture,
          not a highlight — see `styles.css`), but this is the one screen that
          really is a document, and a policy you can't quote or copy out is a
          worse policy. */}
      <article className="selectable mx-auto flex w-full max-w-2xl flex-col gap-6 text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center gap-1.5 self-start text-xs text-link hover:underline"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Back to Paint
          </a>
          <h1 className="text-lg font-bold text-fg-bright">Privacy policy</h1>
          <p className="text-xs text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="Summary">
          <p>
            <span className="text-meta">Paint</span> is a local-first sketchpad
            served as a static site at{" "}
            <span className="text-path">paint.niclaslindstedt.se</span>. It runs
            entirely in your browser. There is no backend of our own, no
            account, no cookies, and no analytics or tracking. By default your
            drawings are stored only on your device and never leave it. You may
            optionally connect a cloud backend (Dropbox or Google Drive) to sync
            your drawings across your own devices — in that case, and only then,
            they are sent to that one provider at your explicit request. The
            project authors never receive your drawings in any configuration.
          </p>
        </Section>

        <Section title="What the app stores">
          <p>
            On your device, inside your browser&apos;s{" "}
            <code className="text-meta">IndexedDB</code> and{" "}
            <code className="text-meta">localStorage</code> for the origin{" "}
            <span className="text-path">paint.niclaslindstedt.se</span>, the app
            keeps:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Your drawings — every mark as vector geometry, together with each
              page&apos;s name, size, and pinned colour, the folders they are
              grouped into, and each drawing&apos;s favourite / archived state
              (when the default <em>This device</em> backend is selected).
            </li>
            <li>
              Per-device preferences — the theme, font, and text size, which
              optional tools are switched on, the last-used ink and stroke
              width, and how the sidebar opens.
            </li>
            <li>
              Which storage backend you&apos;ve chosen, and — if you&apos;ve
              connected Dropbox or Google Drive — the OAuth access and refresh
              tokens for that provider. These tokens grant access only to the
              app&apos;s own folder, never your whole account, and never leave
              your device except to authenticate with that provider.
            </li>
          </ul>
          <p>
            This data is stored as plain JSON on your own device. Clearing your
            browser&apos;s site data for this origin erases it permanently — if
            you have not connected a cloud backend, there is no copy elsewhere
            to restore from.
          </p>
        </Section>

        <Section title="Storage backends">
          <p>
            Under <strong className="text-fg-bright">Settings → Storage</strong>{" "}
            you choose where your drawings are kept:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="text-fg-bright">This device</strong> (the
              default) — your drawings stay in your browser&apos;s{" "}
              <code className="text-meta">IndexedDB</code> and are never
              transmitted anywhere.
            </li>
            <li>
              <strong className="text-fg-bright">Local folder</strong> — your
              drawings are written as a file to a folder you pick on this
              device, using the browser&apos;s File System Access API. The data
              stays on your device; the folder-access grant is remembered in
              your browser&apos;s IndexedDB so the app can reopen the folder
              without asking again.
            </li>
            <li>
              <strong className="text-fg-bright">Dropbox</strong> /{" "}
              <strong className="text-fg-bright">Google Drive</strong> — only
              when you explicitly connect one, your drawings are stored in that
              provider&apos;s cloud (in an app-scoped folder) so they sync
              across your own devices. Connecting sends you to the
              provider&apos;s own consent screen; the app requests access to its
              own folder only. Your data is then also subject to that
              provider&apos;s privacy policy. You can disconnect at any time.
            </li>
          </ul>
          <p>
            Optionally, you can turn on{" "}
            <strong className="text-fg-bright">encryption</strong> with a
            passphrase: your drawings are wrapped in an AES-GCM envelope before
            the cloud copy is saved, so a cloud provider only ever sees
            ciphertext. The passphrase is{" "}
            <strong className="text-fg-bright">
              never stored or transmitted
            </strong>
            ; it lives in memory for the session only, and there is no recovery
            if you forget it.
          </p>
        </Section>

        <Section title="Network requests">
          <p>
            With the default <em>This device</em> backend — or the{" "}
            <em>Local folder</em> backend — the app makes no third-party network
            calls. The only requests your browser makes are to fetch the
            app&apos;s own static files (HTML, JavaScript, CSS, fonts, and
            icons) from its origin, and once loaded it works fully offline as an
            installed PWA. The one exception is the cloud backends: if — and
            only if — you connect Dropbox or Google Drive, the app talks to that
            provider&apos;s API to read and write your drawings. No fonts,
            analytics scripts, error-reporting services, or advertising networks
            are ever loaded.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            The app sets no cookies. All persistence uses{" "}
            <code className="text-meta">IndexedDB</code> and{" "}
            <code className="text-meta">localStorage</code>.
          </p>
        </Section>

        <Section title="Web analytics">
          <p>
            None. The app does not load any analytics or behavioural-tracking
            SDK, and the project authors collect no usage statistics from it.
          </p>
        </Section>

        <Section title="Server logs">
          <p>
            The static bundle is served by{" "}
            <strong className="text-fg-bright">GitHub Pages</strong>. GitHub may
            collect standard request metadata (IP address, user agent, request
            path) for operating the service. This is covered by{" "}
            <a
              href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
              className="text-link hover:underline"
            >
              GitHub&apos;s privacy statement
            </a>
            . The project authors do not run an additional logging service.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The app is a general-purpose drawing tool and is not directed at
            children under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            Material changes are tracked in the public commit history of the
            source repository. The <em>Last updated</em> date at the top of this
            page reflects the most recent edit. Should a future version add
            another optional feature that sends data anywhere, this policy will
            be updated to describe it before that feature ships enabled.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For security reports, see{" "}
            <a
              href="https://github.com/niclaslindstedt/paint/security/advisories/new"
              className="text-link hover:underline"
            >
              GitHub Security Advisories
            </a>
            . For everything else, open an issue at{" "}
            <a
              href="https://github.com/niclaslindstedt/paint/issues"
              className="text-link hover:underline"
            >
              github.com/niclaslindstedt/paint
            </a>
            .
          </p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold tracking-wide text-fg-bright">
        {title}
      </h2>
      {children}
    </section>
  );
}
