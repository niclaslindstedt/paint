// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { exportFileName } from "../src/app/export.ts";
import type { Drawing } from "../src/app/types.ts";

const drawing = (name: string): Drawing => ({
  id: "d1",
  name,
  width: 800,
  height: 600,
  strokes: [],
});

describe("exportFileName", () => {
  it("slugifies the drawing's name", () => {
    expect(exportFileName(drawing("Sequence diagram"), "png")).toBe(
      "sequence-diagram.png",
    );
  });

  it("collapses punctuation and trims the edges", () => {
    expect(exportFileName(drawing("  Auth flow — v2!  "), "png")).toBe(
      "auth-flow-v2.png",
    );
  });

  it("keeps letters from other scripts", () => {
    expect(exportFileName(drawing("Översikt"), "png")).toBe("översikt.png");
  });

  it("falls back for an unnamed drawing", () => {
    expect(exportFileName(drawing("   "), "png")).toBe("drawing.png");
  });
});
