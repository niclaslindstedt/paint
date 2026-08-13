# Security Policy

## Supported versions

| Version        | Supported |
| -------------- | --------- |
| Latest release | ✅        |
| Anything older | ❌        |

Paint is a frontend-only PWA with no server: the deployed app at
`paint.niclaslindstedt.se` is always the latest release, and fixes ship by
deploying forward rather than by patching older versions.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately through
[GitHub Security Advisories](https://github.com/niclaslindstedt/paint/security/advisories/new),
which is the preferred channel. If that is unavailable to you, email
`niclas@agilator.se` with `[security]` in the subject.

Please include what you found, how to reproduce it, and what an attacker could
do with it.

## What to expect

- **Acknowledgement** within 3 working days.
- **An assessment** — whether it is in scope, and a rough severity — within 10
  working days.
- **A fix and a deploy** for confirmed issues as quickly as the severity
  warrants; critical problems are handled before other work.
- **Disclosure** coordinated with you: the advisory is published once a fix is
  deployed, crediting you unless you'd rather stay anonymous.

## Scope

**In scope**

- The app source in this repository, including the service worker and the
  build-time plugins.
- The at-rest encryption of a synced document, and the handling of the
  passphrase and of OAuth tokens.
- Anything that could leak a user's drawings off their device without their
  action, or let one origin read another's stored data.

**Out of scope**

- Vulnerabilities in Dropbox, Google Drive, or the browser itself — report those
  to their vendors.
- Issues in `@niclaslindstedt/oss-framework` — report those in
  [that repository](https://github.com/niclaslindstedt/oss-framework/security).
- Findings that require a compromised device or a malicious browser extension:
  a local-first app cannot defend the machine it runs on.
- Missing hardening headers on GitHub Pages, which the platform controls.
