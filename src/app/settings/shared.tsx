// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { SegmentedControl } from "@niclaslindstedt/oss-framework/components";

import { log } from "../log.ts";
import { setLanguage, useLang } from "../i18n/index.ts";

// The only settings glue that stays app-side: a language picker that wraps the
// framework's `SegmentedControl` with this app's flag labels. The layout
// primitives the tabs are built from (`Section`, `ToggleRow`) and the
// interactive controls all come from the framework's `components` module.
//
// Language is owned by the framework i18n runtime, not the app's settings
// store: the picker reads the active language with `useLang()` and switches it
// with `setLanguage()`, which persists the preference and broadcasts the change
// so every `useT()` consumer re-renders immediately — no Save needed.

export function LanguagePicker() {
  const lang = useLang();
  return (
    <SegmentedControl
      value={lang}
      onChange={(next) => {
        setLanguage(next);
        log.info(`Language set to ${next}`);
      }}
      ariaLabel="Language"
      options={[
        { value: "en", label: <span>🇬🇧 English</span> },
        { value: "sv", label: <span>🇸🇪 Svenska</span> },
      ]}
    />
  );
}
