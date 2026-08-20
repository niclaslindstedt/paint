// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { DragHandleProps } from "@niclaslindstedt/oss-framework/sidebar";

import type { PanelSection } from "../panelSections.ts";

/** What every section of the right-hand panel is handed, whatever it holds: the
 *  descriptor it is rendering, whether it is folded, the ids inside it that have
 *  been switched off, and the pointer handlers that lift it out of the order.
 *
 *  One type rather than four repeats of the same five props — the panel treats
 *  its sections as interchangeable, and a shared prop shape is what makes that
 *  true in the type system as well as in the layout. */
export type SectionProps = {
  section: PanelSection;
  open: boolean;
  onToggle: () => void;
  /** The ids switched off in Settings → Panel (every section's, not just this
   *  one's — they are namespaced, so a section only ever matches its own). */
  hiddenItems: readonly string[];
  /** Absent when there is nothing to reorder. */
  drag?: DragHandleProps;
  dragging?: boolean;
};
