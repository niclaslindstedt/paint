// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { ChangelogModal } from "@niclaslindstedt/oss-framework/changelog";

import { FEATURE_DOCS, RELEASES } from "./changelog.ts";
import { useT } from "./i18n/index.ts";

// The "What's new" dialog with this app's parsed releases wired in. Its own
// module so the CHANGELOG markdown and the feature docs land in the lazy chunk
// `App.tsx` imports on demand, not in the first paint.
export function ChangelogPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <ChangelogModal
      open={open}
      onClose={onClose}
      releases={RELEASES}
      featureDocs={FEATURE_DOCS}
      labels={{
        heading: t("changelog.heading"),
        empty: t("changelog.empty"),
        close: t("common.close"),
        back: t("changelog.back"),
      }}
    />
  );
}
