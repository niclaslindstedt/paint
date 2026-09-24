// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Expo config, as a FUNCTION rather than a static app.json so the app's
// marketing version can be read from the web app's `package.json`. The wrapper
// has no version of its own — it ships one build of the paint app, and the
// two must never disagree about which one. Store build numbers are
// auto-incremented by EAS (see eas.json), so nothing here is bumped by hand.

const { version } = require("../package.json");

// The listing's name and identifier, and the container the document syncs
// through. Build variables rather than literals — see ./identifiers.js.
const {
  DISPLAY_NAME,
  BUNDLE_ID,
  ICLOUD_CONTAINER,
} = require("./identifiers.js");

// The app's dark surface — the same ink the mark is cut from. Only paints the
// splash and the chrome before the page reports its live theme.
const BRAND_BG = "#0b0d10";

// The ink the app mark is cut from (scripts/generate-icons.mjs's BG). The
// adaptive icon's foreground runs to the edges of its tile, so the layer
// behind it has to be the same ink or the launcher's mask shows a seam.
const MARK_INK = "#0b0d10";

// The EAS project this app builds under. `eas init` prints the id; paste it
// here or pass it in the environment (which is what CI does), because
// `eas init` cannot write into a dynamic config. Left unset, the project is
// simply unlinked and `eas build` will ask — it is not a build failure.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? "";

module.exports = () => ({
  expo: {
    name: DISPLAY_NAME,
    slug: "paint",
    version,
    // A drawing app follows the page the reader is holding: a landscape
    // sheet is drawn on a landscape screen, and on an iPad either way up is
    // the normal way to hold it. Nothing is pinned.
    orientation: "default",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    icon: "./assets/icon.png",
    // The URL scheme is the bundle id — reverse-DNS, as RFC 8252 §7.1 asks of
    // a private-use scheme, so it is this listing's own and no other app can
    // claim it. `se.agilator.paint` in production, `dev.local.paint` in a
    // plain checkout; never committed.
    scheme: BUNDLE_ID,
    backgroundColor: BRAND_BG,
    assetBundlePatterns: ["**/*"],

    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      entitlements: {
        // What lets the app read and write its iCloud Drive container. The
        // three keys travel together: the service, the container the app may
        // address, and the one it treats as its own.
        "com.apple.developer.icloud-services": ["CloudDocuments"],
        "com.apple.developer.icloud-container-identifiers": [ICLOUD_CONTAINER],
        "com.apple.developer.ubiquity-container-identifiers": [
          ICLOUD_CONTAINER,
        ],
      },
      infoPlist: {
        // The bundled build is served over plain HTTP on the loopback
        // interface. ATS is left ON — only localhost is excepted, so nothing
        // else in the app may fall back to cleartext.
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
          NSExceptionDomains: {
            localhost: {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: false,
            },
          },
        },
        // The at-rest encryption the app offers is AES-GCM through the
        // browser's own WebCrypto, which is exempt; the wrapper adds no crypto
        // of its own. Declaring it here skips the export-compliance prompt on
        // every upload.
        ITSAppUsesNonExemptEncryption: false,
      },
    },

    android: {
      package: BUNDLE_ID,
      // None. The wrapper reads no device data — it serves the bundled web
      // app and, on iOS only, files it into iCloud Drive. Play's data-safety
      // form is answered against this list.
      permissions: [],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: MARK_INK,
      },
    },

    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 180,
          resizeMode: "contain",
          backgroundColor: BRAND_BG,
        },
      ],
      // The bundled static server (lighttpd, via
      // @dr.pogodin/react-native-static-server) needs Android minSdk 28, and
      // the loopback origin is plain HTTP so cleartext has to be permitted.
      [
        "expo-build-properties",
        { android: { minSdkVersion: 28, usesCleartextTraffic: true } },
      ],
      // Declares the iCloud Drive container as a document-scope folder, so the
      // synced sketchbook shows up under "Paint" in the Files app rather
      // than living invisibly inside the container.
      "./plugins/with-icloud",
    ],

    extra: {
      // NO remote URL here, deliberately. The app serves the copy of the
      // paint app bundled inside it (assets/webroot.zip) from a loopback
      // server — that is what makes it work offline, and what makes it an app
      // rather than a viewer for a website (App Store guideline 4.2). To point
      // a debug build at a deployed slot, set EXPO_PUBLIC_PAINT_URL at
      // build time; src/config.ts reads that env var directly.
      ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
    },
  },
});
