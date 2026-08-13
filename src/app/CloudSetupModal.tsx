// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  CloudAlertIcon,
  Modal,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import type { PendingCloudSetup } from "./useSyncEngine.ts";

// The connect-time reconcile prompt. It opens the moment a backend is connected
// and the app finds it already holds drawings that differ from this device's
// copy — the two can't both silently win, so the user picks. Each side's
// summary rides inside its own choice button ("Dropbox: 4 drawings, 512 marks"
// vs "This device: 1 drawing, 12 marks") so the count that informs the decision
// sits right on the button that acts on it.
//
// Non-dismissable: a side has to be chosen before syncing resumes. (A device
// holding nothing but a blank page never gets here — the engine adopts the
// remote copy outright rather than asking a question with one answer.)
export function CloudSetupModal({
  pending,
  onResolve,
}: {
  pending: PendingCloudSetup | null;
  onResolve: (choice: "cloud" | "replace") => void;
}) {
  const t = useT();
  if (!pending) return null;

  return (
    <Modal
      open
      // Backdrop click and Escape are no-ops: the two copies can't coexist.
      onClose={() => {}}
      labelledBy="cloud-setup-title"
      role="alertdialog"
      centered
      size="max-w-sm"
    >
      <div className="flex flex-col items-center gap-4 px-6 pt-7 pb-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <CloudAlertIcon className="h-6 w-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2
            id="cloud-setup-title"
            className="text-base font-bold text-fg-bright"
          >
            {t("cloudSetup.heading", { provider: pending.provider })}
          </h2>
          <p className="text-sm leading-snug text-muted">
            {t("cloudSetup.blurb", { provider: pending.provider })}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          <ChoiceButton
            label={t("cloudSetup.useCloud", { provider: pending.provider })}
            detail={t("cloudSetup.cloudSummary", {
              provider: pending.provider,
              drawings: String(pending.cloud.drawings),
              strokes: String(pending.cloud.strokes),
            })}
            onClick={() => onResolve("cloud")}
            primary
          />
          <ChoiceButton
            label={t("cloudSetup.useLocal")}
            detail={t("cloudSetup.localSummary", {
              drawings: String(pending.local.drawings),
              strokes: String(pending.local.strokes),
            })}
            onClick={() => onResolve("replace")}
          />
        </div>
      </div>
    </Modal>
  );
}

// One full-width choice: the action on top, the count that justifies it under.
// The primary side is adopting the remote copy — the non-destructive default,
// since this device's copy is still on disk either way.
function ChoiceButton({
  label,
  detail,
  onClick,
  primary,
}: {
  label: string;
  detail: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer flex-col gap-0.5 rounded border px-3 py-2.5 text-left ${
        primary
          ? "border-accent bg-accent/15 text-fg-bright"
          : "border-line text-fg hover:bg-surface-2"
      }`}
    >
      <span className="text-sm font-bold">{label}</span>
      <span className="text-xs text-muted">{detail}</span>
    </button>
  );
}
