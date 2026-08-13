# Examples

## `sequence.paint.json`

A small two-drawing document in the exact shape Paint writes to localStorage and
pushes to a sync backend. Import it through **Settings → Storage** (or drop it
into the localStorage key listed in [`docs/configuration.md`](../docs/configuration.md))
to see the model with real content in it.

It is also the readable illustration of why the document is vector rather than a
bitmap: every mark is a few numbers, so undo is exact, the file is tiny, and a
diff between two versions is meaningful.

### The shape

```jsonc
{
  "version": 2, // stamped on the bytes at rest, not in memory
  "folders": [{ "id": "folder-1", "name": "Auth" }],
  "activeDrawingId": "drawing-1",
  "drawings": [
    {
      "id": "drawing-1",
      "name": "Auth flow",
      "width": 1600, // document pixels — a page may be any size
      "height": 1000,
      "favorite": true, // starred, so it heads the sidebar's Favorites
      // "folderId" is absent, so this page sits at the top level.
      // "background" is absent, so this page follows the canvas theme.
      "strokes": [
        {
          "id": "stroke-1",
          "tool": "rectangle", // a plugin id — the renderer looks it up
          "size": 4,
          // "color" is absent, so the mark takes the page's default ink.
          "shape": {
            "kind": "box",
            "from": { "x": 200, "y": 180 },
            "to": { "x": 560, "y": 380 },
          },
        },
      ],
    },
  ],
}
```

A stroke omits what it doesn't need: no `color` means "follow the page", no
`filled` means outlined, no `opacity` means opaque, and no `layer` means the
base of the stack. Drawings omit the same way: no `folderId` means top level, no
`favorite` means unstarred, no `archived` means live, and no `layers` — as here
— means the drawing is a single layer holding every stroke. See
[`src/app/types.ts`](../src/app/types.ts) for the full model.

A drawing that has been given a stack carries it as a short list beside the
strokes, bottom layer first, with each stroke naming the layer it sits on:

```jsonc
{
  "id": "drawing-1",
  "layers": [
    { "id": "base", "name": "" }, // the layer every drawing starts with
    { "id": "layer-2", "name": "Layer 2", "hidden": true },
  ],
  "activeLayerId": "layer-2", // where the next mark lands
  "strokes": [
    {
      "id": "stroke-1",
      "tool": "pencil",
      "size": 4 /* …, no layer: the base */,
    },
    { "id": "stroke-2", "tool": "pencil", "size": 4, "layer": "layer-2" },
  ],
}
```

The pages here are 1600 × 1000 — the size is per drawing, not a constant: a
**new** page is whatever size you pick for it (this screen's resolution by
default), and an older document keeps whatever it was made at.
