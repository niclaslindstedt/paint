// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { SlidersIcon } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import {
  listedEffectsIn,
  type EffectGroup,
  type EffectKind,
} from "../effects.ts";
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
// Each row opens an effect's options; nothing lands from here. What the row
// carries instead of a value is the sliders glyph — the mark for "there are
// options behind this" — and that is the whole difference from what this
// section used to be: there is no "on" state to read back, because an effect
// that has been applied is simply part of the picture.
//
// It was the word **Apply…** until it wasn't, for two reasons. It lied: the
// press applies nothing, it opens a dialog you set the effect up in and apply
// from. And six of them stacked down a 224-pixel column spent a third of every
// row saying the same untrue word, which is what pushed "Brightness & co…" into
// an ellipsis on a phone.
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
  const effects = listedEffectsIn(section.id as EffectGroup).filter(
    (descriptor) => isItemOn(hiddenItems, effectItemId(descriptor.kind)),
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
              <SlidersIcon className="h-4 w-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
