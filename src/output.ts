// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The central output module (OSS_SPEC §19.4): every user-facing diagnostic
// line the app emits goes through these semantic helpers rather than bare
// `console.*` calls. They fan out to the in-app log buffer (the Logs settings
// tab renders it live) so "what did the app just do?" is answerable on-device.

import { logStore } from "./app/log.ts";

const out = logStore.createLogger("app");

/** A normal progress/state line ("Loaded drawing", "Service worker ready"). */
export function status(message: string): void {
  out.info(message);
}

/** Supplementary detail a user only reads when digging. */
export function info(message: string): void {
  out.info(message);
}

/** Something odd but recoverable — the app continues. */
export function warn(message: string): void {
  out.warn(message);
}

/** A failure the user should know about. */
export function error(message: string): void {
  out.error(message);
}

/** A section marker used to group related lines in the log stream. */
export function header(message: string): void {
  out.info(`── ${message} ──`);
}
