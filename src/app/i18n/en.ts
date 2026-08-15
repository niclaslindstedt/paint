// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The bundled English catalog — also the source of the `Catalog` / message-key
// types every other language must satisfy. Grouped by surface; the runtime
// (`./index.ts`) flattens it to dotted keys (`menu.drawings`, …) that `t()`
// resolves.

import type { Widen } from "@niclaslindstedt/oss-framework/i18n";

export const en = {
  common: {
    close: "Close",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    rename: "Rename",
    duplicate: "Duplicate",
    resetToDefaults: "Reset to defaults",
  },
  menu: {
    nav: "Drawings",
    open: "Show the drawings menu",
    close: "Hide the drawings menu",
    drawings: "Drawings",
    favorites: "Favorites",
    newDrawing: "New drawing",
    newDrawingIn: "New drawing in {name}",
    newFolder: "New folder",
    dropImage: "Drop the image to start a drawing from it",
    folderName: "Folder name",
    deleteFolder: "Delete folder",
    drawingActions: "Drawing actions",
    folderActions: "Folder actions",
    moveToFolder: "Move to folder…",
    moveToFolderMenu: "Move to folder",
    noFolder: "No folder",
    dropToArchive: "Drop here to archive",
    dropToTopLevel: "Drop here to move out of the folder",
    showNamespaces: "Show sketchbooks",
    hideNamespaces: "Hide sketchbooks",
    favorite: "Add to favorites",
    unfavorite: "Remove from favorites",
    archive: "Archive",
    drawingName: "Drawing name",
    untitled: "Untitled drawing",
    undo: "Undo",
    redo: "Redo",
    search: "Search",
    settings: "Settings",
    donate: "Donate",
    privacy: "Privacy",
    about: "About",
    whatsNew: "What's new",
    sourceCode: "Source",
    collapseFooter: "Hide the menu footer",
    expandFooter: "Show the menu footer",
    checkUpdate: "Check for updates",
    checking: "Checking…",
    updateAvailable: "Update available",
    upToDate: "Up to date",
    updating: "Updating…",
    deleteConfirm: "Delete “{name}”? This cannot be undone.",
  },
  newDrawing: {
    title: "New drawing",
    titleIn: "New drawing in {name}",
    sourceLabel: "Start from",
    sourceBlank: "New",
    sourceFile: "Load",
    sourceClipboard: "Clipboard",
    sizeLabel: "Canvas size",
    dimensions: "{width} × {height} px",
    presets: {
      screen: "This screen",
      hd: "Full HD",
      uhd: "4K",
      print: "A4",
    },
    custom: "Custom",
    customEmpty: "Type a size",
    width: "Width",
    height: "Height",
    sizeHint: "Pixels, {min}–{max} on each side.",
    chooseImage: "Choose an image or a paint file…",
    chooseImageHint:
      "Or drop one here. A picture cuts the page to its own size; a .pct opens with its layers and marks intact.",
    pctChosen: "Paint file · {layers} layers · {dimensions}",
    dropImage: "Drop the image to start a drawing from it",
    clipboardName: "Pasted image",
    clipboardPaste: "Paste from clipboard",
    clipboardAgain: "Look again",
    clipboardAsk: "Your browser asks before a page may read the clipboard.",
    clipboardWaiting: "Confirm the paste when your browser asks for it.",
    clipboardEmpty: "There's no picture on the clipboard.",
    create: "Create",
  },
  // The page actions — what the right-hand panel does to a whole drawing rather
  // than to one mark.
  page: {
    title: "Image",
    resize: "Resize…",
    reset: "Start over",
    resetConfirm:
      "Throw this drawing away and start over? Every mark, every layer and the page colour go. Undo still brings them back.",
    resetConfirmLabel: "Start over",
    flip: "Flip",
    flipLeft: "Quarter turn left",
    flipRight: "Quarter turn right",
    mirror: "Mirror",
    mirrorHorizontal: "Mirror left to right",
    mirrorVertical: "Mirror top to bottom",
    left: "Left",
    right: "Right",
    horizontal: "Horizontal",
    vertical: "Vertical",
  },
  // The page filters — what the drawing is seen *through*, rather than what is
  // on it. One section of the right-hand panel and one dialog per filter.
  filters: {
    title: "Filters",
    off: "Off",
    open: "{name} options",
    openOnLayer: "{name} options for {layer}",
    hint: "A filter changes how the page is seen — no mark is redrawn, and switching it off leaves the drawing exactly as it was.",
    layerHint:
      "This layer is seen through the filter; the rest of the stack is not. The eraser cuts through the result, so you can rub a hole in a softened layer and show what is under it.",
    apply: "Apply",
    remove: "Turn off",
    blur: {
      name: "Blur",
      hint: "Softens the whole page, as though the drawing were out of focus.",
      radius: "Radius: {value} px",
    },
    noise: {
      name: "Noise",
      hint: "Scatters fine specks across the page, the way grain sits on film.",
      amount: "Strength: {value}%",
      grain: "Speck size: {value} px",
      color: "Coloured specks",
      colorHint:
        "Speckle the colours as well as the light. Off leaves the grey grain film does.",
    },
  },
  resize: {
    title: "Resize",
    modeLabel: "What to resize",
    modeScale: "Everything",
    modeCanvas: "Canvas only",
    scaleHint:
      "The page and every mark on it grow or shrink together — the same drawing, at a different size.",
    canvasHint:
      "The sheet changes and the marks stay put. A smaller sheet crops; a bigger one gives you room.",
    width: "Width",
    height: "Height",
    keepProportions: "Keep proportions",
    dragHint: "Drag a corner of the new page to resize it.",
    handles: {
      "top-left": "Resize from the top left",
      "top-right": "Resize from the top right",
      "bottom-left": "Resize from the bottom left",
      "bottom-right": "Resize from the bottom right",
    },
    percent: "{percent}% of the current size",
    from: "Now {width} × {height} px",
    sizeHint: "Pixels, {min}–{max} on each side.",
    anchorLabel: "Where the current page sits",
    anchors: {
      "top-left": "Top left",
      top: "Top",
      "top-right": "Top right",
      left: "Left",
      center: "Centre",
      right: "Right",
      "bottom-left": "Bottom left",
      bottom: "Bottom",
      "bottom-right": "Bottom right",
    },
    sampling: "Pictures",
    samplingSmooth: "Smooth",
    samplingNearest: "Nearest",
    samplingSmoothHint:
      "Blends the pixels of any picture on the page as it grows.",
    samplingNearestHint:
      "Keeps the pixels square — what pixel art and screenshots want.",
    apply: "Resize",
  },
  archive: {
    title: "Archive",
    empty: "Nothing archived. Drawings and folders you shelve land here.",
    folders: "Folders",
    drawings: "Drawings",
    drawingsCount: "{n} drawings",
    marks: "{n} marks",
    restore: "Restore",
    restoreFolder: "Restore the folder and its drawings",
  },
  canvas: {
    title: "Canvas",
    exportPng: "Export as PNG",
    exportJson: "Export as JSON",
    download: "Download",
    downloadFormat: "Download {format}",
    downloadPct: "Paint file, with layers",
    copyToClipboard: "Copy to clipboard",
    dropImage: "Drop the image to add it to this drawing",
    placeImage: "Placed image",
    placeImageHint: "Drag to move, pull a corner to resize.",
    placeImageKeep: "Keep",
    placeImageDiscard: "Discard",
    resizeImage: "Resize the image",
    pageColor: "Page colour",
    grid: "Grid",
    color: "Colour",
    size: "Size",
    // The cog beside the ink, for a tool whose settings are not a width — the
    // paint bucket (see `plugins/controls.ts`).
    toolSettings: "Tool settings",
    fill: "Fill shapes",
    fillOutline: "Outline",
    fillFilled: "Filled",
    mixColor: "Mix a colour…",
    hideMixer: "Hide the mixer",
    mixField: "Saturation and brightness",
    mixHue: "Hue",
    keepColor: "Keep",
    colorKept: "Kept",
    removeColor: "Forget",
    // Widths read in millimetres of page (see `PX_PER_MM`) — a number with a
    // unit on it says what a nib is without a second one to compare it against.
    sizeMm: "{size} mm",
    // …and type, which is measured in points everywhere outside this app.
    sizePt: "{size} pt",
    // A width the trade has a name for: "4.8 mm · #6".
    sizeNamed: "{size} · {note}",
    // What the slider says about where you are on it. The middle band is the
    // range the real implement is made in; either side of it is a width no
    // shop sells, which is worth saying out loud and not worth forbidding.
    sizeReal: "as made",
    sizeFiner: "finer than made",
    sizeWider: "wider than made",
    customSize: "Width",
    // The settings a tool ships with — the "must haves" of its medium, named by
    // whoever made the tool (see `plugins/builtin/presets.ts`). Above the saved
    // row, because it is there on the first run and the saved row is not.
    builtinPresets: "Presets",
    // Saved tools — a width and every dial, under a name and a mark you pick
    // (see `presets.ts`). The way in is the star on the panel's title row,
    // which is what `savePreset` names.
    presets: "Saved",
    savePreset: "Save this tool",
    savePresetName: "Name",
    savePresetGlyph: "Mark",
    presetNoGlyph: "No mark",
    savePresetPlaceholder: "My favourite pencil",
    presetDefaultName: "Preset",
    presetSave: "Save",
    presetForget: "Forget",
    tool: "Tool",
    toolbar: "Tools",
    selectionActions: "Selection",
    copy: "Copy",
    cut: "Cut",
    paste: "Paste",
    fitPage: "Fit the page, or show it at 1:1",
    zoomPercent: "{percent}%",
    undo: "Undo",
    redo: "Redo",
  },
  // The tool dials — the sliders behind Advanced in the size panel. One entry
  // per dial the shipped tools declare (see `plugins/builtin/dials.ts`); the
  // unit lives in the label because it is part of the sentence.
  dials: {
    advanced: "Advanced",
    reset: "Reset",
    opacity: {
      name: "Opacity: {value}%",
      hint: "How much of the page shows through the mark.",
    },
    strength: {
      name: "Strength: {value}%",
      hint: "How much of a mark one pass takes off. Turn it down to fade something back rather than remove it.",
    },
    chisel: {
      name: "Chisel: {value}%",
      hint: "Round like a bullet tip, or flat like a wedge that draws broad one way and fine the other.",
    },
    angle: {
      name: "Nib angle: {value}°",
      hint: "Which way the flat of the nib is turned.",
    },
    grade: {
      name: "Lead: {value}",
      hint: "The grade of the lead. H is hard and pale and rides the paper; B is soft and dark and fills its tooth in.",
    },
    hardness: {
      name: "Hardness: {value}%",
      hint: "Soft feathers the edge; hard keeps it crisp.",
    },
    hair: {
      name: "Hair: {value}%",
      hint: "Fine hair leaves many thin streaks, coarse hair a few broad ones.",
    },
    splay: {
      name: "Splay: {value}%",
      hint: "A new brush cuts a crisp side; a worn one frays.",
    },
    bleed: {
      name: "Bleed: {value}%",
      hint: "How far a wet edge wicks into the paper.",
    },
    flow: {
      name: "Flow: {value}%",
      hint: "How much paint each pass lays down. Low builds up slowly.",
    },
    pressure: {
      name: "Pressure: {value}%",
      hint: "Bear down to fill the paper's grain in; ease off to let it show.",
    },
    feather: {
      name: "Feather: {value} mm",
      hint: "Fades the fill's edge out instead of stopping it.",
    },
    water: {
      name: "Water: {value}%",
      hint: "How charged the brush is. Wet spreads past the hair and dilutes; dry keeps the shape of the head.",
    },
    pigment: {
      name: "Pigment: {value}%",
      hint: "How much colour is in the water — a pale tint, or a full-strength stain.",
    },
    granulation: {
      name: "Granulation: {value}%",
      hint: "How heavily the pigment settles into the paper's dips. Rough stock and mineral colours mottle most.",
    },
  },
  // The presets each tool ships with — the settings its medium is actually used
  // at, offered as chips above the ones you saved yourself (see
  // `plugins/builtin/presets.ts`). Grouped by the tool's own id, so the
  // registration and the string sit under the same word; `pencil` is the
  // drawing pen and `graphite` the pencil, which is the one place that id shows
  // through. A tool missing from here ships no presets, and that is deliberate.
  //
  // These are the names of *implements and techniques*, so they are the words a
  // shop or a class would use — "wet-in-wet", "one-stroke", "uncial" — and not
  // descriptions of the settings behind them.
  presets: {
    pencil: {
      liner: "Liner",
      fineliner: "Fineliner",
      guide: "Guide line",
    },
    eraser: {
      block: "Block",
      detail: "Detail",
      kneaded: "Kneaded",
    },
    graphite: {
      sketch: "Sketch",
      construction: "Construction",
      shading: "Shading",
      detail: "Detail",
    },
    paintbrush: {
      round: "Round",
      hog: "Hog bristle",
      dry: "Dry brush",
      glaze: "Glaze",
    },
    flatbrush: {
      onestroke: "One-stroke",
      lettering: "Lettering",
      wash: "Flat wash",
    },
    watercolor: {
      wash: "Wash",
      wet: "Wet-in-wet",
      glaze: "Glaze",
      dry: "Dry brush",
    },
    airspray: {
      general: "General",
      detail: "Detail",
      background: "Background",
    },
    marker: {
      marker: "Marker",
      chisel: "Chisel",
      fineliner: "Fineliner",
    },
    highlighter: {
      text: "Line of text",
      broad: "Broad",
    },
    crayon: {
      coloring: "Colouring",
      shading: "Shading",
      solid: "Solid",
    },
    calligraphy: {
      italic: "Italic",
      foundational: "Foundational",
      uncial: "Uncial",
    },
    filler: {
      flat: "Flat fill",
      soft: "Soft edge",
      wash: "Wash",
    },
  },
  // The text tool's entry box and the bar of type controls over it. The
  // typefaces themselves are not here: each is shown set in its own face, which
  // names it in every language at once (see `plugins/builtin/text.ts`).
  text: {
    field: "Caption",
    placeholder: "Type…",
    font: "Typeface",
    bold: "Bold",
    italic: "Italic",
    move: "Drag to move the text",
    keep: "Keep the text",
    discard: "Discard the text",
  },
  layers: {
    title: "Layers",
    open: "Side panel",
    add: "New layer",
    base: "Layer 1",
    background: "Background",
    numbered: "Layer {n}",
    select: "Draw on {name}",
    show: "Show {name}",
    hide: "Hide {name}",
    lock: "Lock {name}",
    unlock: "Unlock {name}",
    lockedHint: "{name} is locked — unlock it to draw on it",
    moveUp: "Move {name} up",
    moveDown: "Move {name} down",
    delete: "Delete {name}",
    deleteConfirm:
      "Delete “{name}” and the {n} marks on it? Undo still brings them back.",
    marks: "{n} marks",
    empty: "Empty",
    hint: "New marks land on the selected layer. The background carries the page colour; hide it and the page goes transparent.",
    swipeHint: "Swipe in from the right edge to open this panel.",
  },
  // The sheets a drawing can be laid on (see `ground.ts`). Named the way a
  // paper merchant names them — these are stocks you can buy, not adjectives —
  // and the hint says what the sheet *does*, because that is the thing you are
  // actually choosing between.
  grounds: {
    solid: {
      name: "Solid colour",
      hint: "A sealed digital page: no grain, and paint sits on top of what it covers.",
    },
    hot: {
      name: "Hot-pressed",
      hint: "Watercolour paper rolled smooth. It drinks like paper with almost nothing for pigment to settle into.",
    },
    cold: {
      name: "Cold-pressed",
      hint: "The sheet most watercolour is painted on. Enough tooth to mottle, not so much that a line breaks up.",
    },
    rough: {
      name: "Rough",
      hint: "Dried unpressed. Washes pool in the valleys and a dry brush skips across the peaks.",
    },
    cartridge: {
      name: "Cartridge",
      hint: "Sketchbook paper. A fine grain, and sized enough that ink stays where you put it.",
    },
    laid: {
      name: "Laid",
      hint: "Ribbed writing paper, with a chain line across it. Holds ink on its face rather than drinking it.",
    },
    newsprint: {
      name: "Newsprint",
      hint: "Thirsty and unsized: everything wet spreads on it, and a marker goes furry.",
    },
    kraft: {
      name: "Kraft",
      hint: "Brown wrapping stock — a fibrous sheet that takes a wash. Pin a brown page to go with it.",
    },
    cotton: {
      name: "Cotton duck",
      hint: "Primed canvas: a coarse weave that shows through everything, and a ground that holds paint on its face.",
    },
    linen: {
      name: "Linen",
      hint: "A finer, slubbier weave than cotton, and thirstier than neither — primed cloth barely drinks at all.",
    },
  },
  tools: {
    // Named "Pen" but keyed `pencil`: the id is persisted on every stroke ever
    // drawn with it, so the name moved and the key stayed put. The tool that
    // actually behaves like a pencil is `graphite`.
    pencil: {
      name: "Pen",
      description: "Freehand line at the selected width.",
    },
    graphite: {
      name: "Pencil",
      description:
        "A graphite sketching pencil. It only ever draws grey — set the lead from a hard, pale H to a soft, dark B.",
    },
    eraser: {
      name: "Eraser",
      description:
        "Rubs marks off the page. Turn the strength down to fade them rather than remove them.",
    },
    line: { name: "Line", description: "A straight line between two points." },
    rectangle: {
      name: "Rectangle",
      description: "A box, outlined or filled.",
    },
    ellipse: {
      name: "Ellipse",
      description: "A circle or oval, outlined or filled.",
    },
    hand: {
      name: "Hand",
      description:
        "Drag the page around instead of drawing on it. Double-tap to fit the page, again for 1:1.",
    },
    arrow: {
      name: "Arrow",
      description: "A line with an arrowhead — for pointing at things.",
    },
    shapes: {
      name: "Shapes",
      description:
        "Boxes, circles, polygons, stars, lines and arrows — eleven of them behind one button. Press it again to pick another, or to fill it in.",
    },
    roundrect: {
      name: "Rounded rectangle",
      description: "A box with its corners taken off.",
    },
    triangle: {
      name: "Triangle",
      description: "Three sides, point up, stretched to fill the drag.",
    },
    diamond: {
      name: "Diamond",
      description: "A square on its corner — the flowchart decision.",
    },
    pentagon: { name: "Pentagon", description: "Five sides, point up." },
    hexagon: { name: "Hexagon", description: "Six sides, standing on a flat." },
    star: { name: "Star", description: "A five-pointed star." },
    doublearrow: {
      name: "Double arrow",
      description: "A line with a head at both ends — for measuring a gap.",
    },
    selection: {
      name: "Select",
      description:
        "Pick marks out — with a box, an oval, a lasso, or by tracing what is painted under the pointer. Press it again to choose which. Move what you picked with the hand; copy, cut or delete it with the keyboard, a right-click, or a long press.",
    },
    select: {
      name: "Box select",
      description: "Drag a rectangle to pick out the marks it covers.",
    },
    selectOval: {
      name: "Oval select",
      description: "The same drag, read as the oval inside it.",
    },
    selectLasso: {
      name: "Lasso select",
      description:
        "Draw around the marks you want, freehand — the loop closes itself.",
    },
    selectTrace: {
      name: "Trace select",
      description:
        "Press an area and the selection follows the contours of what is drawn there, rather than a shape you drew over it.",
    },
    marker: {
      name: "Marker",
      description:
        "A felt tip loaded with spirit ink: it darkens where it overlaps, and its tip goes from a round bullet to a chisel.",
    },
    highlighter: {
      name: "Highlighter",
      description:
        "A broad translucent wedge — a full band across the page, a hairline down it — that builds up where it overlaps.",
    },
    paintbrush: {
      name: "Round brush",
      description:
        "A loaded bristle brush: the stroke swells in the middle and tapers off at both ends.",
    },
    flatbrush: {
      name: "Flat brush",
      description:
        "A one-stroke brush with a chisel ferrule: full width pulled across itself, a hairline pulled along its edge.",
    },
    watercolor: {
      name: "Watercolour",
      description:
        "A wet wash on paper. It spreads past the hair, dries darkest at the rim, and every layer shows what is under it.",
    },
    airspray: {
      name: "Airbrush",
      description:
        "A cloud of paint that builds up the longer you hold it in one place.",
    },
    crayon: {
      name: "Crayon",
      description:
        "A waxy, grainy stick that skips over the tooth of the page.",
    },
    calligraphy: {
      name: "Calligraphy pen",
      description:
        "A flat nib — broad across the stroke, hairline along it. Set the angle it is held at.",
    },
    text: {
      name: "Text",
      description:
        "Tap the page and type. Pick a typeface, a size, bold or italic while you write.",
    },
    filler: {
      name: "Paint bucket",
      description:
        "Tap an empty space and it takes the colour, up to the marks around it.",
    },
    dropper: {
      name: "Colour dropper",
      description: "Tap the page to draw with the colour you tapped.",
    },
    image: {
      name: "Image",
      description:
        "A picture dropped onto the page. It has no button — drop an image file on the canvas and place it.",
    },
  },
  settings: {
    title: "Settings",
    sections: "Sections",
    chooseSection: "Choose a section",
    tabs: {
      general: "General",
      appearance: "Appearance",
      tools: "Tools",
      canvas: "Canvas",
      download: "Download",
      storage: "Storage",
      developer: "Developer",
      logs: "Logs",
    },
    general: {
      intro: "How the app behaves around the canvas.",
      languageTitle: "Language",
      chooseLanguage: "App language",
      languageHint: "Applies immediately — no need to save.",
      sidebarTitle: "Sidebar",
      openSidebarWith: "Open the sidebar with",
      optionSwipe: "Edge swipe too",
      optionButton: "The button only",
      sidebarHint:
        "On phones. The hamburger beside the drawing's name always opens it; this is whether an inward swipe from the screen edge does as well. Wide screens dock the sidebar.",
      developerTitle: "Developer",
      developerMode: "Developer mode",
      developerModeHint: "Show the Developer tab and its diagnostics.",
    },
    tools: {
      intro:
        "Every tool in the app is a plugin, and this is the rack they hang on. Switch one on and it appears in the toolbar straight away.",
      alwaysOn: "Always on",
      optionalTitle: "Toolbar",
      optionalHint:
        "In the order the buttons sit in — move a row and the toolbar moves with it. Some tools are on out of the box; the rest are a tap away. Switching one off only hides it — marks you already drew with it stay on the page.",
      shortcut: "Shortcut: {key}",
      moveUp: "Move {name} earlier in the toolbar",
      moveDown: "Move {name} later in the toolbar",
    },
    canvas: {
      intro: "Defaults for the page you draw on.",
      themeTitle: "Canvas theme",
      themeLabel: "Draw on",
      themeAuto: "Follow app theme",
      themeLight: "Light page",
      themeDark: "Dark page",
      themeHint:
        "A dark app draws on a dark page in light ink; switching the app to a light theme flips both back. Applies to every drawing that hasn't pinned a colour of its own.",
      pageTitle: "Page",
      pageColor: "Page colour",
      pageFollowTheme: "Follow theme",
      pageColorHint:
        "Pin a colour for this drawing only — it overrides the canvas theme and travels with the drawing when it syncs.",
      surfaceTitle: "Surface",
      surfaceLabel: "What the page is made of",
      surfaceHint:
        "The sheet is part of the picture, so it travels with this drawing: its grain is painted under the marks, and a wet tool on a thirsty sheet mixes with what it is painted over instead of covering it. Watercolour is the one to try it with.",
      surfaceSolid: "Solid",
      surfacePaper: "Paper",
      surfaceCanvas: "Canvas",
      surfaceTexture: "Grain: {value}%",
      surfaceTextureHint:
        "How strongly the sheet's grain shows. It changes what you see, never how much the sheet drinks — that is what the stock is.",
      gridTitle: "Grid",
      showGrid: "Show a grid",
      showGridHint:
        "A light grid behind the page, to line boxes and arrows up. It is a guide only — it never exports.",
      toolNameTitle: "Tool name",
      showToolName: "Name the tool you pick",
      showToolNameHint:
        "The name of the tool fades in over the middle of the page for a moment when you switch to it, then gets out of the way.",
    },
    download: {
      intro:
        "What the download button offers, and what comes out of it. The clipboard is always on the menu.",
      typesTitle: "File types",
      typesHint: "Only the types you switch on appear in the download menu.",
      formatPng: "PNG image",
      formatPngHint:
        "Lossless, and the only type that can carry a transparent background. The safe default.",
      formatJpg: "JPG photo",
      formatJpgHint:
        "Smaller for photo-heavy pages, and accepted by uploads that refuse anything else. Never transparent.",
      formatSvg: "SVG vector",
      formatSvgHint:
        "The marks as vectors, so the drawing stays sharp at any size. Dropped images ride along inside the file.",
      noTypes:
        "Every file type is off — the menu can only copy to the clipboard.",
      areaTitle: "Area",
      areaLabel: "Download",
      scopePage: "The whole page",
      scopeMarks: "Just the marks",
      areaHint:
        "“Just the marks” crops the file to what you have drawn, with a small margin — handy on a big page with a small diagram on it.",
      backgroundTitle: "Background",
      transparent: "Transparent background",
      transparentHint:
        "Leave the page unpainted so the marks land on transparency. JPG has no transparency and always keeps the page colour; the eraser paints with the page colour, so erased areas stay opaque.",
    },
    appearance: {
      intro: "Theme, fonts, and the look of the app chrome.",
      backdropTitle: "Dialog backdrop",
      backdropDarkness: "Darkness",
      backdropBlur: "Blur",
      levelNone: "None",
      levelSubtle: "Subtle",
      levelMedium: "Medium",
      levelStrong: "Strong",
      darknessDark: "Dark",
    },
    storage: {
      intro:
        "Your drawings live on this device. Connect a folder or a cloud drive to keep them in step across devices.",
      backendTitle: "Where drawings are kept",
      backendThisDevice: "This device",
      backendFolder: "Local folder",
      backendDropbox: "Dropbox",
      backendGdrive: "Google Drive",
      folderHint:
        "Pick a folder on this computer; the drawing file is written straight into it.",
      folderChoose: "Choose a folder…",
      folderConnected: "Folder connected",
      folderReconnectNeeded: "Permission to that folder was withdrawn.",
      folderReconnect: "Reconnect",
      connect: "Connect {name}",
      connected: "Connected to {name}",
      disconnect: "Disconnect",
      missingKeyDropbox:
        "This build has no Dropbox app key, so Dropbox can't be connected. See docs/configuration.md.",
      missingKeyGdrive:
        "This build has no Google client id, so Google Drive can't be connected. See docs/configuration.md.",
      encryptionTitle: "Encryption",
      encrypt: "Encrypt the cloud copy",
      encryptHint:
        "Encrypts the synced file end-to-end with a passphrase you choose. The passphrase is never stored — lose it and the cloud copy is unreadable.",
      unlockTitle: "Unlock",
      unlockHint: "Enter the passphrase to read the encrypted cloud copy.",
      exportTitle: "Export",
      exportHint: "Download the whole document as JSON, or this page as a PNG.",
    },
    developer: {
      intro: "Diagnostics for when something looks wrong.",
      loggingTitle: "Logging",
      captureLogs: "Capture logs",
      captureLogsHint:
        "Record diagnostic log lines so the Logs tab can show them.",
      buildTitle: "Build",
      buildLabel: "build",
      commitLabel: "commit",
      modeLabel: "mode",
      displayLabel: "display",
      installedPwa: "installed PWA (standalone)",
      browserTab: "browser tab",
      pluginsTitle: "Plugins",
      pluginsRegistered: "{n} tool plugins registered",
    },
    logs: {
      intro:
        "The in-app log buffer, rendered live from the framework's logging module.",
      logsTitle: "Logs",
    },
  },
  // The header's disk button — filing the drawing's rendered layers out to the
  // backend as a `.pct` tree. Not the same thing as the document save, which
  // happens on its own; these read "layers" throughout so the two are never
  // mistaken for each other.
  layerSave: {
    save: "Save the layers",
    saving: "Saving the layers…",
    saved: "The layers are saved",
  },
  cloudSetup: {
    heading: "{provider} already has drawings",
    blurb:
      "This device and {provider} hold different documents. Pick which one to keep — the other is replaced.",
    useCloud: "Use the {provider} copy",
    useLocal: "Keep this device's copy",
    cloudSummary: "{provider}: {drawings} drawings, {strokes} marks",
    localSummary: "This device: {drawings} drawings, {strokes} marks",
  },
  sync: {
    cloudSync: "Cloud sync",
    status: "Status",
    backend: "Backend",
    fileLocation: "File location",
    encryptionLabel: "Encryption",
    encryptionOn: "On",
    encryptionOff: "Off",
    reloadFromBackend: "Reload from the backend",
    saveNow: "Save now",
    tryAgain: "Try again",
    reconnect: "Reconnect {name}",
    openIn: "Open in {name}",
    checkConnection: "Check connection",
    viewSyncLog: "View sync log",
    hideSyncLog: "Hide sync log",
    syncingNow: "Saving…",
    failedHeading: "Save failed",
    throttledHeading: "Slow down",
    throttledDetail: "{name} is rate limiting us — retrying shortly.",
    reauthHeading: "Session expired",
    reauthDetail: "Reconnect {name} to keep syncing.",
    conflictHeading: "Newer copy on the backend",
    conflictDetail:
      "Another device saved after this one. Reload to adopt that copy.",
    pendingHeading: "Unsaved changes",
    pendingDetail: "Waiting to push to {name}.",
    offlineHeading: "Offline",
    offlineDetail: "Can't reach {name} — your work is safe on this device.",
    syncedTo: "Synced to {name}",
    checkPinging: "Pinging {name}…",
    checkStillOffline: "{name} is still unreachable.",
    checkAuthExpired: "{name} needs reconnecting.",
    failedDetailFallback: "Couldn't save to {name}.",
  },
  namespaces: {
    heading: "Namespaces",
    blurb: "Separate sets of drawings — work, teaching, scratch.",
    newAction: "New namespace",
    namePlaceholder: "Namespace name",
    nameLabel: "Name",
    create: "Create",
    nameRequired: "Give it a name first.",
    colorLabel: "Colour",
    glyphLabel: "Glyph",
    glyphNone: "None",
    save: "Save",
    cancel: "Cancel",
    renameAction: "Rename",
    deleteAction: "Delete",
    delete: "Delete",
    deleteConfirm: "Delete “{name}” and every drawing in it?",
    switchTo: "Switch to {name}",
    defaultBadge: "default",
  },
  changelog: {
    heading: "What's new",
    empty: "No releases yet.",
    back: "Back",
  },
} as const;

// The catalog shape every language must satisfy. `Widen` relaxes each leaf from
// its English literal to plain `string` so a translation can differ.
export type Catalog = Widen<typeof en>;
