// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useT } from "../i18n/index.ts";
import { effectsIn, type EffectGroup, type EffectKind } from "../effects.ts";
import { effectItemId, isItemOn } from "../panelSections.ts";
import { SectionHeading } from "./shared.tsx";
import type { SectionProps } from "./section.ts";

// **Effects** and **Colour** — what you can do *to* the marks, once.
//
// One component for both, because they are one machinery: the same dialog, the
// same preview, the same bake. Which heading an effect is listed under is its
// descriptor's `group` and nothing more (see `effects.ts`), and the split is
// purely about what you came here to do — nobody looking for "make this less
// orange" reads a list that starts with Blur.
//
// Each row opens an effect's options; nothing lands from here. The row says
// **Apply…** rather than showing a value, and that is the whole difference from
// what this section used to be: there is no "on" state to read back, because an
// effect that has been applied is simply part of the picture.
//
// Nothing under the rows explains that. A paragraph about flattening sat there
// for a while and it was three lines of a 224-pixel column saying what the
// dialog one press away says at the moment it matters — with the layer it is
// about to land on named, and a preview of what it will do.

export function EffectsSection({
  section,
  open,
  onToggle,
  hiddenItems,
  drag,
  dragging,
  onEffect,
}: SectionProps & { onEffect: (kind: EffectKind) => void }) {
  const t = useT();
  const effects = effectsIn(section.id as EffectGroup).filter((descriptor) =>
    isItemOn(hiddenItems, effectItemId(descriptor.kind)),
  );

  return (
    <>
      <SectionHeading
        title={t(section.titleKey)}
        open={open}
        onToggle={onToggle}
        drag={drag}
        dragging={dragging}
      />
      {open && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {effects.map((descriptor) => (
            <button
              key={descriptor.kind}
              type="button"
              onClick={() => onEffect(descriptor.kind)}
              title={t(descriptor.hintKey)}
              aria-label={t("effects.open", { name: t(descriptor.nameKey) })}
              className="flex cursor-pointer items-center gap-2 rounded border border-line px-2 py-1.5 text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {t(descriptor.nameKey)}
              </span>
              <span className="shrink-0 text-[11px] text-muted">
                {t("effects.action")}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
