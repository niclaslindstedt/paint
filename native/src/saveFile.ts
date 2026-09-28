// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native half of the save-file bridge (see `saveFileBridge.ts`): write the
// bytes the page sent to the cache and open the share sheet.
//
// The reference implementation from oss-framework's `docs/native-shell.md`.
// The payload is the reader's drawing: it is never logged, only the latest
// export is kept on disk (in the cache, which the next export clears and the
// OS may purge), and it goes to nothing but the share sheet.

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import {
  SAVE_FILE_UTI,
  bareName,
  saveFileResultScript,
  type SaveFileRequest,
} from "./saveFileBridge";

/** Write the bytes to the cache, open the share sheet, answer the page. */
export async function answerSaveFile(
  request: SaveFileRequest,
  inject: (script: string) => void,
): Promise<void> {
  if (request.version !== 1) {
    inject(saveFileResultScript(request.id, false, "Unsupported version."));
    return;
  }
  // One directory per request, so the file keeps exactly the name the reader
  // sees in the sheet. The previous export's directory goes first: it is not
  // deleted when its sheet closes, because an Android target may still be
  // reading it after the chooser has returned.
  const root = `${FileSystem.cacheDirectory}exports/`;
  const dir = `${root}${request.id.replace(/[^\w-]/g, "_")}/`;
  const uri = dir + bareName(request.filename);
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing is not available on this device.");
    }
    await FileSystem.deleteAsync(root, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await FileSystem.writeAsStringAsync(uri, request.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await Sharing.shareAsync(uri, {
      mimeType: request.mimeType,
      UTI: SAVE_FILE_UTI[request.mimeType],
      dialogTitle: bareName(request.filename),
    });
    inject(saveFileResultScript(request.id, true));
  } catch (error) {
    inject(
      saveFileResultScript(
        request.id,
        false,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}
