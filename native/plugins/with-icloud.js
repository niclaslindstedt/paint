// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MAKES THE iCLOUD DRIVE CONTAINER VISIBLE IN THE FILES APP during
// `expo prebuild`.
//
// It has to be a config plugin rather than a file committed under `ios/`:
// that directory is prebuild OUTPUT, regenerated from scratch by
// `expo prebuild --clean` and never committed, so anything added there by hand
// survives exactly until the next build.
//
// The ENTITLEMENTS — which container the app may address — are spelled in
// `../app.config.js`, where Expo already writes them. What is left is the
// `NSUbiquitousContainers` declaration, which Expo has no field for: without
// it the container is real and syncing but invisible, and the reader has no
// way to see, copy or back up the document the app is writing on their behalf.
//
// Android gets nothing from this plugin, and correctly so: iCloud has no
// Android equivalent, the native module is Apple-only, and the wrapper reports
// the backend as unavailable there (see ../src/icloud.ts).

const { withInfoPlist } = require("expo/config-plugins");

// The same committed id the entitlements name (../identifiers.js), never one
// built from the bundle id: this declaration and the entitlement have to name
// the same container, and the Swift side spells it as a literal
// (../modules/icloud-store). Changing it after release strands every synced
// copy in the old container.
const { ICLOUD_CONTAINER: CONTAINER_ID } = require("../identifiers.js");

// What the folder is called in the Files app. Not the bundle id: this is the
// only string in the whole arrangement a reader ever sees.
const FOLDER_NAME = "Paint";

module.exports = function withICloud(config) {
  return withInfoPlist(config, (c) => {
    c.modResults.NSUbiquitousContainers = {
      ...(c.modResults.NSUbiquitousContainers ?? {}),
      [CONTAINER_ID]: {
        // The folder is the app's to write, shows up in the Files app, and is
        // not moved off the device when storage runs low — the drawings are
        // the document, not a cache of one.
        NSUbiquitousContainerIsDocumentScopePublic: true,
        NSUbiquitousContainerSupportedFolderLevels: "Any",
        NSUbiquitousContainerName: FOLDER_NAME,
      },
    };
    return c;
  });
};
