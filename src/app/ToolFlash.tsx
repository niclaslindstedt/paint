// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { useT } from "./i18n/index.ts";
import { pluginById } from "./plugins/registry.ts";

// The tool you just picked, named over the middle of the page.
//
// The toolbar is a rack of small glyphs with no room for words, and the tools
// that draw a mark tell each other apart by the mark — a marker and a crayon
// are one nib apart until you have used both. On a phone the button you tapped
// is also the one under your thumb, so the highlight that says which tool you
// hold is the pixel you cannot see. A label in the middle of the page, where
// you are already looking, answers "what am I holding?" once and then gets out
// of the way.
//
// It is a *transient*, not a control: never in the pointer stream, never in the
// accessibility tree (the toolbar button carries `aria-pressed`, which is where
// a screen reader should hear this), and it removes itself when the animation
// that fades it out ends rather than on a timer we would have to keep in step
// with the CSS.
//
// Nothing here knows a tool by id — the label and the glyph come off the plugin
// descriptor, so a tool added tomorrow announces itself with no change here.

export function ToolFlash({
  tool,
  enabled,
}: {
  /** The active tool's plugin id. A change to it is what triggers the flash. */
  tool: string;
  /** The Settings → Canvas switch. Off means nothing is ever shown. */
  enabled: boolean;
}) {
  const t = useT();
  // The tool being announced, plus a run counter that is only there to key the
  // element: picking a tool, going back to the previous one, and picking this
  // one again must restart the animation rather than re-use a node that has
  // already finished playing it.
  const [flash, setFlash] = useState<{ id: string; run: number } | null>(null);
  // What the canvas was already holding. Seeded with the tool at mount, so
  // opening a drawing with the tool you left it in announces nothing — a flash
  // on every load would be a splash screen.
  const announced = useRef(tool);
  const runs = useRef(0);

  useEffect(() => {
    if (!enabled) {
      // Switched off mid-flash: drop it now rather than letting it play out.
      setFlash(null);
      announced.current = tool;
      return;
    }
    if (announced.current === tool) return;
    announced.current = tool;
    runs.current += 1;
    setFlash({ id: tool, run: runs.current });
  }, [tool, enabled]);

  const plugin = flash ? pluginById(flash.id) : undefined;
  if (!enabled || !flash || !plugin) return null;
  const Icon = plugin.icon;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
    >
      <span
        key={flash.run}
        onAnimationEnd={() => setFlash(null)}
        className="tool-flash flex items-center gap-2 rounded-full border border-line bg-surface/90 px-4 py-2 text-sm text-fg-bright shadow-lg"
      >
        <Icon className="h-[18px] w-[18px] text-accent" />
        {t(plugin.nameKey)}
      </span>
    </div>
  );
}
