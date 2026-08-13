// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";
import type { ReactNode } from "react";

import {
  Button,
  CogIcon,
  ConfirmDialog,
  CopyIcon,
  InfoIcon,
  PlusIcon,
  RedoIcon,
  RowActionMenu,
  TrashIcon,
  UndoIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  CheckForUpdatesItem,
  type PwaUpdateCheckResult,
} from "@niclaslindstedt/oss-framework/pwa";
import { NamespaceSwitcher } from "@niclaslindstedt/oss-framework/namespaces";
import type {
  Namespace,
  NamespaceAppearance,
} from "@niclaslindstedt/oss-framework/namespaces";

import { CanvasIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import type { PaintStore } from "./usePaintStore.ts";

// The sidebar's contents: the namespace switcher, the list of drawings, and the
// footer rows (undo/redo, settings, what's new, check for updates).
//
// The framework owns the drawer itself (`Sidebar`), the namespace switcher, and
// the update row; this component owns what a drawing row looks like and which
// app action each footer row runs.

type Props = {
  store: PaintStore;
  activeNamespace: Namespace;
  namespaces: Namespace[];
  onSwitchNamespace: (slug: string) => void;
  onOpenNamespaces: () => void;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
  onNavigate: () => void;
  checkingUpdate: boolean;
  updateAvailable: boolean;
  onCheckUpdate: () => Promise<PwaUpdateCheckResult>;
};

export function SideMenuContent({
  store,
  activeNamespace,
  namespaces,
  onSwitchNamespace,
  onOpenNamespaces,
  onOpenSettings,
  onOpenChangelog,
  onNavigate,
  checkingUpdate,
  updateAvailable,
  onCheckUpdate,
}: Props) {
  const t = useT();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const doomed = store.data.drawings.find((d) => d.id === pendingDelete);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <NamespaceSwitcher
        namespaces={namespaces}
        activeNamespace={activeNamespace.slug}
        onSwitch={(slug: string) => onSwitchNamespace(slug)}
        onManage={onOpenNamespaces}
        labels={{
          manage: t("namespaces.heading"),
          switchTo: (name: string) => t("namespaces.switchTo", { name }),
        }}
      />

      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <h2 className="text-xs font-bold tracking-wide text-muted uppercase">
          {t("menu.drawings")}
        </h2>
        <Button
          variant="secondary"
          onClick={() => {
            store.addDrawing("");
            onNavigate();
          }}
        >
          <span className="flex items-center gap-1.5">
            <PlusIcon className="h-3.5 w-3.5" />
            {t("menu.newDrawing")}
          </span>
        </Button>
      </div>

      <nav
        aria-label={t("menu.drawings")}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2"
      >
        <ul className="flex flex-col gap-0.5">
          {store.data.drawings.map((drawing) => {
            const isActive = drawing.id === store.activeDrawing?.id;
            const count = drawing.strokes.length;
            return (
              <li key={drawing.id}>
                <RowActionMenu
                  ariaLabel={drawing.name || t("menu.untitled")}
                  actions={[
                    {
                      label: t("common.duplicate"),
                      icon: <CopyIcon className="h-3.5 w-3.5" />,
                      onSelect: () => {
                        store.duplicateDrawing(drawing.id);
                        onNavigate();
                      },
                    },
                    {
                      label: t("common.delete"),
                      icon: <TrashIcon className="h-3.5 w-3.5" />,
                      danger: true,
                      onSelect: () => setPendingDelete(drawing.id),
                    },
                  ]}
                >
                  <button
                    type="button"
                    onClick={() => {
                      store.setActive(drawing.id);
                      onNavigate();
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm ${
                      isActive
                        ? "bg-accent/15 font-bold text-accent"
                        : "text-fg hover:bg-surface-2"
                    }`}
                  >
                    <CanvasIcon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {drawing.name.trim() || t("menu.untitled")}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {count === 0
                        ? t("menu.empty")
                        : count === 1
                          ? t("menu.strokesOne")
                          : t("menu.strokes", { n: String(count) })}
                    </span>
                  </button>
                </RowActionMenu>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="flex shrink-0 flex-col gap-0.5 border-t border-line p-2">
        <div className="flex gap-1">
          <FooterButton
            label={t("menu.undo")}
            disabled={!store.canUndo}
            onClick={store.undo}
            icon={<UndoIcon className="h-3.5 w-3.5" />}
          />
          <FooterButton
            label={t("menu.redo")}
            disabled={!store.canRedo}
            onClick={store.redo}
            icon={<RedoIcon className="h-3.5 w-3.5" />}
          />
        </div>
        <FooterRow
          label={t("menu.settings")}
          onClick={onOpenSettings}
          icon={<CogIcon className="h-3.5 w-3.5" />}
        />
        <FooterRow
          label={t("menu.whatsNew")}
          onClick={onOpenChangelog}
          icon={<InfoIcon className="h-3.5 w-3.5" />}
        />
        <CheckForUpdatesItem
          checking={checkingUpdate}
          updateAvailable={updateAvailable}
          onCheck={onCheckUpdate}
          labels={{
            idle: t("menu.checkUpdate"),
            checking: t("menu.checking"),
            updateAvailable: t("menu.updateAvailable"),
            upToDate: t("menu.upToDate"),
          }}
        />
      </footer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("common.delete")}
        description={t("menu.deleteConfirm", {
          name: doomed?.name.trim() || t("menu.untitled"),
        })}
        confirmLabel={t("common.delete")}
        tone="danger"
        onConfirm={() => {
          if (pendingDelete) store.deleteDrawing(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function FooterRow({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm text-fg hover:bg-surface-2"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FooterButton({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-2 py-2 text-sm text-fg hover:bg-surface-2 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Re-exported for the settings tab's namespace hint — the appearance patch
 *  shape the framework modal hands back. */
export type { NamespaceAppearance };
