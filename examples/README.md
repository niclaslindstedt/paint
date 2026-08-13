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
  "version": 1, // stamped on the bytes at rest, not in memory
  "activeDrawingId": "drawing-1",
  "drawings": [
    {
      "id": "drawing-1",
      "name": "Auth flow",
      "width": 1600, // document pixels; the view scales to fit
      "height": 1000,
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
`filled` means outlined, no `opacity` means opaque. See
[`src/app/types.ts`](../src/app/types.ts) for the full model.
