// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  canSaveLayers,
  evaluateCloudSetup,
  isEmptyDoc,
  needsSetupPrompt,
  shouldAutoSave,
  summarizeDoc,
} from "../src/app/cloudSetup.ts";
import type { AppData } from "../src/app/types.ts";

// The two decisions that keep sync from losing work: whether a settled edit may
// be pushed, and whether a freshly-connected backend's copy collides with this
// device's. Both are pure so they can be pinned without a live adapter.

const blank: AppData = {
  folders: [],
  drawings: [{ id: "d1", name: "", width: 800, height: 600, strokes: [] }],
  activeDrawingId: "d1",
};

const drawn: AppData = {
  folders: [],
  drawings: [
    {
      id: "d1",
      name: "Sequence",
      width: 800,
      height: 600,
      strokes: [
        {
          id: "s1",
          tool: "pencil",
          size: 4,
          shape: { kind: "path", points: [{ x: 0, y: 0 }] },
        },
      ],
    },
  ],
  activeDrawingId: "d1",
};

const gate = {
  isRemote: true,
  connected: true,
  dirty: true,
  blocked: false,
  locked: false,
  pendingSetup: false,
  baselineReady: true,
};

describe("shouldAutoSave", () => {
  it("pushes a settled edit on a connected backend", () => {
    expect(shouldAutoSave(gate)).toBe(true);
  });

  it("holds while anything stands in the way", () => {
    for (const off of [
      "isRemote",
      "connected",
      "dirty",
      "baselineReady",
    ] as const) {
      expect(shouldAutoSave({ ...gate, [off]: false })).toBe(false);
    }
    for (const on of ["blocked", "locked", "pendingSetup"] as const) {
      expect(shouldAutoSave({ ...gate, [on]: true })).toBe(false);
    }
  });
});

// The other save — the disk button, which files the rendered layers out. It is
// gated differently on purpose, and the two differences are the interesting
// part: it does not need the document to be dirty, and it is refused outright
// on an encrypted backend.
const layerGate = {
  isRemote: true,
  connected: true,
  blocked: false,
  locked: false,
  pendingSetup: false,
  baselineReady: true,
  saving: false,
  encrypted: false,
};

describe("canSaveLayers", () => {
  it("allows a save on a connected plaintext backend", () => {
    expect(canSaveLayers(layerGate)).toBe(true);
  });

  // Unlike the document push: the backend may hold no layers for a document
  // that hasn't been touched since it was opened, and the button has to work.
  it("allows a save even when the document is unchanged", () => {
    expect(canSaveLayers({ ...layerGate })).toBe(true);
  });

  it("holds while anything stands in the way", () => {
    for (const off of ["isRemote", "connected", "baselineReady"] as const) {
      expect(canSaveLayers({ ...layerGate, [off]: false })).toBe(false);
    }
    for (const on of ["blocked", "locked", "pendingSetup", "saving"] as const) {
      expect(canSaveLayers({ ...layerGate, [on]: true })).toBe(false);
    }
  });

  // Not a delay but a refusal: plaintext layer PNGs beside an AES-GCM envelope
  // would hand over the picture the envelope exists to hide.
  it("refuses outright on an encrypted backend", () => {
    expect(canSaveLayers({ ...layerGate, encrypted: true })).toBe(false);
  });
});

describe("summarizeDoc", () => {
  it("counts drawings and their marks", () => {
    expect(summarizeDoc(drawn)).toEqual({ drawings: 1, strokes: 1 });
    expect(summarizeDoc(blank)).toEqual({ drawings: 1, strokes: 0 });
  });
});

describe("isEmptyDoc", () => {
  it("treats a fresh unnamed page as nothing to lose", () => {
    expect(isEmptyDoc(blank)).toBe(true);
    expect(isEmptyDoc(drawn)).toBe(false);
  });

  it("counts a named but unmarked page as content", () => {
    expect(
      isEmptyDoc({
        ...blank,
        drawings: [{ ...blank.drawings[0]!, name: "Plan" }],
      }),
    ).toBe(false);
  });
});

describe("evaluateCloudSetup", () => {
  const remoteText = JSON.stringify({ version: 1, ...drawn });

  it("raises the collision when both sides hold work", () => {
    const other: AppData = {
      ...drawn,
      drawings: [{ ...drawn.drawings[0]!, name: "Other" }],
    };
    expect(evaluateCloudSetup(remoteText, other)).not.toBeNull();
    expect(needsSetupPrompt(other)).toBe(true);
  });

  it("adopts silently onto a device with nothing on it", () => {
    expect(evaluateCloudSetup(remoteText, blank)).not.toBeNull();
    expect(needsSetupPrompt(blank)).toBe(false);
  });

  it("says nothing when the two copies already match", () => {
    expect(evaluateCloudSetup(remoteText, drawn)).toBeNull();
  });

  it("does not count a filed picture's path as a difference", () => {
    // The same page either side, but the backend copy has been through the
    // image externaliser and carries where each bitmap is filed.
    const local: AppData = {
      ...drawn,
      drawings: [
        {
          ...drawn.drawings[0]!,
          strokes: [
            {
              id: "s2",
              tool: "image",
              size: 1,
              shape: {
                kind: "image",
                from: { x: 0, y: 0 },
                to: { x: 10, y: 10 },
                src: "data:image/png;base64,SGVsbG8=",
              },
            },
          ],
        },
      ],
    };
    const filed = JSON.stringify({
      version: 2,
      ...local,
      drawings: [
        {
          ...local.drawings[0]!,
          strokes: [
            {
              ...local.drawings[0]!.strokes[0]!,
              shape: {
                ...local.drawings[0]!.strokes[0]!.shape,
                srcPath: "images/sequence-4k2a-1.png",
              },
            },
          ],
        },
      ],
    });
    expect(evaluateCloudSetup(filed, local)).toBeNull();
  });

  it("says nothing when the backend is empty", () => {
    const empty = JSON.stringify({ version: 1, ...blank });
    expect(evaluateCloudSetup(empty, drawn)).toBeNull();
  });

  it("leaves this device's copy standing on unparseable bytes", () => {
    expect(evaluateCloudSetup("{not json", drawn)).toBeNull();
  });
});
