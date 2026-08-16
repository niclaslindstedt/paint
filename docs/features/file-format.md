# The paint file (`.pct`)

A drawing with a stack of layers is a document, not just a picture — and a PNG
of it is a photograph of the finished thing, with the layers baked in. `.pct` is
the whole drawing in one file: every layer, its name, whether it was showing,
whether it was locked, and the marks themselves.

## Saving one

Open the download menu in the header and choose **Paint file, with layers**. You
get `<drawing-name>.pct` — one file, wherever your downloads go.

## Opening one

**New image** → the **Load** tab → choose the `.pct`, or drop it onto the
dialog. The page arrives at its own size with its own stack; nothing is cut or
resized to fit. Press **Create** and it is filed into the sketchbook as a new
drawing.

Opening the same file twice gives you two independent drawings rather than one
drawing arguing with itself, so a `.pct` doubles as a template.

## What is inside

A `.pct` is a zip. Rename it to `.zip` and open it, and you will find:

```
mimetype          image/vnd.paint.pct
manifest.json     the index — canvas size, and the layer stack bottom-first
vectors.json      the drawing itself, as marks
layers/00-….png   one transparent PNG per layer, bottom first
preview.png       the merged image
```

Two halves, deliberately. **`manifest.json` and the `layers/` PNGs are the
interchange half**: anything that can read JSON and PNG can pull your layers out
— stack order, names and all — without knowing anything about this app.
**`vectors.json` is the native half**: it holds the marks, which is what makes
reopening your own file lossless rather than a flatten. Your strokes come back
as strokes, undoable and re-editable, and a drawing that pinned no colour of its
own re-inks itself when you flip the app theme.

A file from another tool that has no `vectors.json` still opens — each layer's
PNG is placed as an image on a layer of its own, so the picture and the stack
survive even though the individual marks don't.

## Layers on your cloud backend

When you sync to a local folder, Dropbox or Google Drive, the same manifest and
the same layer PNGs are written there too — unpacked rather than zipped, one
folder per drawing:

```
drawings/sequence-diagram-b40p/manifest.json
drawings/sequence-diagram-b40p/layers/00-a41f….png
drawings/sequence-diagram-b40p/layers/01-9c02….png
```

So your layers are browsable as ordinary files, from any device, without this
app.

**These are written only when you press the disk button** in the header (or
⌘/Ctrl+S). That is the one thing in the app you save by hand, and there is a
reason: a page of layers is megabytes of PNG, and uploading it every time you
draw a line would be slow, expensive on a metered connection, and pointless.

Your marks are never waiting on that button. They are written to this device the
instant you draw them and pushed to your backend on their own, exactly as
before. The disk button decides when the _rendered picture_ is worth uploading —
never whether your work is safe.

Pressing it is cheap too. Each layer's file name contains a fingerprint of what
is on it, so a layer you haven't touched is already filed under the name it
would be written as, and nothing is uploaded for it. An afternoon spent on one
layer of one drawing costs one layer.

The button is absent when there is nowhere to file layers to — on the on-device
sketchbook, and on an encrypted backend. Encryption is a refusal rather than a
delay: writing your layers as plain PNGs beside an encrypted document would hand
over the very picture the encryption exists to hide.
