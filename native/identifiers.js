// THE ONE PLACE A DEPLOYMENT'S COORDINATES ENTER THIS REPOSITORY.
//
// The repository is the project; a store listing is a deployment of it. So the
// listing's name and identifier are configuration, not source: they arrive as
// build variables and are never committed. What is committed is the project's
// own plain name and a development id, which is what a fresh checkout runs
// under.
//
//   APP_DISPLAY_NAME  the listing name, and the name under the icon
//   APP_BUNDLE_ID     iOS bundle identifier + Android package name
//   EAS_PROJECT_ID    the Expo project this builds against
//
// Each is a GitHub Actions secret the build workflow forwards, and an EAS
// environment variable on the project, because EAS resolves the config again
// on its own builders. The names are identical in every app in the fleet, so a
// secret is pasted rather than translated.

/** The project's own name. Not the listing name — see APP_DISPLAY_NAME. */
const PROJECT_NAME = "Paint";

/** Reverse-DNS id used only by local/dev builds; never submitted. */
const DEV_BUNDLE_ID = "dev.local.paint";

const DISPLAY_NAME = process.env.APP_DISPLAY_NAME?.trim() || PROJECT_NAME;
const BUNDLE_ID = process.env.APP_BUNDLE_ID?.trim() || DEV_BUNDLE_ID;
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID?.trim() ?? "";

// THE iCLOUD CONTAINER IS NOT THE BUNDLE ID, and deriving it from one would be
// a mistake. It names a container, registered once in the developer portal and
// addressed by the app and its native module; the listing it ships under is
// not its business. Deriving it would mean a plain checkout addressing
// `iCloud.dev.local.paint` while the module's Swift — which cannot read a
// build variable — said something else, and a document store pointed at the
// wrong container syncs nothing while reporting success.
//
// So it is committed, identical in every build, and the Swift agrees with it
// by being the same string.
/** The iCloud Drive container the document syncs through. */
const ICLOUD_CONTAINER = "iCloud.se.agilator.paint";

// A `production` build is one headed for a store, so the fallbacks above are
// not good enough: fail here rather than uploading a binary under the dev
// bundle id or the project name. EAS sets EAS_BUILD_PROFILE on its builders.
if (process.env.EAS_BUILD_PROFILE === "production") {
  for (const name of ["APP_DISPLAY_NAME", "APP_BUNDLE_ID", "EAS_PROJECT_ID"]) {
    if (!process.env[name]?.trim()) {
      throw new Error(
        `${name} is not set. A production build needs it — set it as an EAS ` +
          `environment variable on the EAS project (and as a repository ` +
          `secret for the build workflow). See RELEASING.md.`,
      );
    }
  }
}

module.exports = {
  PROJECT_NAME,
  DEV_BUNDLE_ID,
  DISPLAY_NAME,
  BUNDLE_ID,
  EAS_PROJECT_ID,
  ICLOUD_CONTAINER,
};
