# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Released sections below are **generated at release time from the changeset
fragments** in `.changes/unreleased/` — add a fragment per user-visible change
(see `AGENTS.md` → "Changelog and feature docs"), and the Release workflow
collates them into a dated section here. Each bullet is a bold title and a
single sentence; a big feature carries a **Learn more** link to its feature
doc. Do not hand-edit the released sections.

## [Unreleased]

## [0.1.0] - 2026-08-13

### Added

- **A canvas to draw on** — Sketch with a pencil, eraser, line, rectangle, and ellipse on a page that scales to fit any screen, with every mark undoable one at a time. [Learn more](feature:canvas)
- **Tools are plugins** — Every tool in the app is a plugin behind one interface; the optional ones (arrow, marker, highlighter) switch on in Settings → Tools and join the toolbar immediately. [Learn more](feature:plugins)
- **Several drawings, several sketchbooks** — Keep a list of drawings in the sidebar, and separate whole sets of them into namespaces. [Learn more](feature:drawings)
- **Cloud sync** — Optionally keep the document in step across devices through a local folder, Dropbox, or Google Drive, with end-to-end encryption of the synced file. [Learn more](feature:cloud-sync)
- **Export** — Download the open page as a PNG, or the whole document as JSON. [Learn more](feature:export)
- **Installable and offline** — A precaching service worker and a web app manifest make it an installable PWA that opens with no network. [Learn more](feature:pwa)
- **Themes and languages** — The framework's appearance engine (themes, fonts, density, corners) plus English and Swedish.
