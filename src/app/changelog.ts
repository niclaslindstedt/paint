// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's "What's new" data. The framework's `changelog` module owns the
// parsing and the dialog; pulling the markdown into the bundle is the one
// bundler-specific bit it deliberately leaves to the app. Here that's Vite's
// `?raw` (the CHANGELOG) and an eager `import.meta.glob` (the feature docs the
// `[Learn more]` links drill into).
import {
  buildFeatureDocs,
  parseChangelog,
} from "@niclaslindstedt/oss-framework/changelog";

import changelogMd from "../../CHANGELOG.md?raw";

// Parsed once at module load — the markdown is static, so the release list
// never changes between renders.
export const RELEASES = parseChangelog(changelogMd);

// Every `docs/features/*.md` becomes a slug-keyed feature doc; a changelog
// bullet's `[Learn more](feature:<slug>)` opens the matching one in place.
export const FEATURE_DOCS = buildFeatureDocs(
  import.meta.glob("../../docs/features/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);
