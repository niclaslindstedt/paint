// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Swedish catalog — code-split and loaded on demand (see `./index.ts`).

import type { Catalog } from "./en.ts";

export const sv: Catalog = {
  common: {
    close: "Stäng",
    cancel: "Avbryt",
    save: "Spara",
    delete: "Ta bort",
    rename: "Byt namn",
    duplicate: "Duplicera",
    resetToDefaults: "Återställ till standard",
  },
  menu: {
    nav: "Teckningar",
    open: "Visa teckningsmenyn",
    close: "Dölj teckningsmenyn",
    drawings: "Teckningar",
    favorites: "Favoriter",
    newImage: "Ny bild",
    newImageIn: "Ny bild i {name}",
    newFolder: "Ny mapp",
    dropImage: "Släpp bilden för att skapa en teckning av den",
    folderName: "Mappens namn",
    deleteFolder: "Ta bort mappen",
    drawingActions: "Åtgärder för teckningen",
    folderActions: "Åtgärder för mappen",
    moveToFolder: "Flytta till mapp…",
    moveToFolderMenu: "Flytta till mapp",
    noFolder: "Ingen mapp",
    dropToArchive: "Släpp här för att arkivera",
    dropToTopLevel: "Släpp här för att flytta ut ur mappen",
    showNamespaces: "Visa skissböcker",
    hideNamespaces: "Dölj skissböcker",
    favorite: "Lägg till i favoriter",
    unfavorite: "Ta bort från favoriter",
    archive: "Arkiv",
    drawingName: "Teckningens namn",
    untitled: "Namnlös teckning",
    search: "Sök",
    settings: "Inställningar",
    donate: "Donera",
    privacy: "Integritet",
    about: "Om",
    whatsNew: "Nyheter",
    sourceCode: "Källkod",
    collapseFooter: "Dölj menyns sidfot",
    expandFooter: "Visa menyns sidfot",
    updating: "Uppdaterar…",
    deleteConfirm: "Ta bort ”{name}”? Det går inte att ångra.",
  },
  newImage: {
    title: "Ny bild",
    titleIn: "Ny bild i {name}",
    sourceLabel: "Utgå från",
    sourceBlank: "Ny",
    sourceFile: "Öppna",
    sourceClipboard: "Urklipp",
    sizeLabel: "Ritytans storlek",
    dimensions: "{width} × {height} px",
    presets: {
      screen: "Den här skärmen",
      hd: "Full HD",
      uhd: "4K",
      print: "A4",
    },
    custom: "Egen",
    customEmpty: "Skriv en storlek",
    flip: "Vänd",
    portrait: "Stående",
    landscape: "Liggande",
    flipToPortrait: "Ställ alla storlekar stående",
    flipToLandscape: "Lägg alla storlekar liggande",
    width: "Bredd",
    height: "Höjd",
    sizeHint: "Bildpunkter, {min}–{max} på varje sida.",
    pageColorLabel: "Sidfärg",
    pageColorTransparent: "Genomskinlig",
    canvasTypeLabel: "Typ av rityta",
    canvasTypeHint:
      "Väljs en gång, här — arket följer med bilden och kan inte ändras efteråt. På ett ark som suger blandar sig ett vått verktyg med det det ligger över i stället för att täcka det, oavsett vad sidan är.",
    grainLabel: "Struktur: {value}%",
    chooseImage: "Välj en bild eller en paint-fil…",
    chooseImageHint:
      "Eller släpp en här. En bild gör sidan lika stor som bilden; en .pct öppnas med sina lager och streck kvar.",
    pctChosen: "Paint-fil · {layers} lager · {dimensions}",
    dropImage: "Släpp bilden för att börja från den",
    clipboardName: "Inklistrad bild",
    clipboardPaste: "Klistra in från urklipp",
    clipboardAgain: "Titta igen",
    clipboardAsk: "Webbläsaren frågar innan en sida får läsa urklippet.",
    clipboardWaiting: "Bekräfta inklistringen när webbläsaren frågar.",
    clipboardEmpty: "Det finns ingen bild i urklippet.",
    create: "Skapa",
  },
  page: {
    title: "Bild",
    resize: "Ändra storlek…",
    reset: "Börja om",
    resetConfirm:
      "Kasta teckningen och börja om? Alla streck, alla lager och sidans färg försvinner. Ångra tar tillbaka dem.",
    resetConfirmLabel: "Börja om",
    flip: "Vänd",
    flipLeft: "Ett kvarts varv åt vänster",
    flipRight: "Ett kvarts varv åt höger",
    mirror: "Spegla",
    mirrorHorizontal: "Spegla vänster–höger",
    mirrorVertical: "Spegla upp–ner",
    left: "Vänster",
    right: "Höger",
    horizontal: "Vågrätt",
    vertical: "Lodrätt",
  },
  effects: {
    title: "Effekter",
    apply: "Använd",
    open: "Använd {name}",
    action: "Använd\u2026",
    scopeLabel: "Använd på",
    scopeLayer: "Det här lagret",
    scopeDrawing: "Alla lager",
    scopeLayerHint:
      "Bara {layer} plattas ut. Alla andra lager lämnas precis som de är.",
    scopeDrawingHint:
      "Varje lager som visas och är olåst plattas ut, ett i taget. Dolda och låsta lager lämnas i fred.",
    warning:
      "Strecken på {target} ersätts av en bild av dem med effekten pålagd. Ångra tar tillbaka dem; en omladdning gör det inte.",
    targetLayers: "{n} lager",
    empty: "Det finns ingenting på {target} att lägga den på.",
    previewHint:
      "Sidan bakom visar effekten medan du ställer in den. Ingenting läggs på teckningen förrän du använder den.",
    blur: {
      name: "Oskärpa",
      hint: "Gör det som redan finns mjukt, som om det vore ur fokus. Gör det igen och du gör oskärpan oskarp.",
      radius: "Radie: {value} px",
    },
    noise: {
      name: "Brus",
      hint: "Strör fina korn över det som redan finns, så som grynighet ligger på film.",
      amount: "Styrka: {value} %",
      grain: "Kornstorlek: {value} px",
      color: "Färgade korn",
      colorHint:
        "Låt kornen färga och inte bara ljusa upp. Av ger det grå korn film ger.",
    },
  },
  panel: {
    collapse: "Dölj {name}",
    expand: "Visa {name}",
  },
  resize: {
    title: "Ändra storlek",
    modeLabel: "Vad som ändras",
    modeScale: "Allt",
    modeCanvas: "Bara ritytan",
    scaleHint:
      "Sidan och alla streck på den växer eller krymper tillsammans — samma teckning, i en annan storlek.",
    canvasHint:
      "Arket ändras och strecken står kvar. Ett mindre ark beskär; ett större ger dig plats.",
    width: "Bredd",
    height: "Höjd",
    keepProportions: "Behåll proportionerna",
    dragHint: "Dra i ett hörn av den nya sidan för att ändra storleken.",
    handles: {
      "top-left": "Ändra storlek uppifrån vänster",
      "top-right": "Ändra storlek uppifrån höger",
      "bottom-left": "Ändra storlek nerifrån vänster",
      "bottom-right": "Ändra storlek nerifrån höger",
    },
    percent: "{percent} % av nuvarande storlek",
    from: "Nu {width} × {height} px",
    sizeHint: "Bildpunkter, {min}–{max} på varje sida.",
    anchorLabel: "Var nuvarande sida hamnar",
    anchors: {
      "top-left": "Uppe till vänster",
      top: "Uppe",
      "top-right": "Uppe till höger",
      left: "Vänster",
      center: "Mitten",
      right: "Höger",
      "bottom-left": "Nere till vänster",
      bottom: "Nere",
      "bottom-right": "Nere till höger",
    },
    sampling: "Bilder",
    samplingSmooth: "Mjuk",
    samplingNearest: "Närmaste",
    samplingSmoothHint: "Blandar bildpunkterna i bilder på sidan när de växer.",
    samplingNearestHint:
      "Håller bildpunkterna fyrkantiga — det pixelkonst och skärmbilder vill ha.",
    apply: "Ändra storlek",
  },
  archive: {
    title: "Arkiv",
    empty: "Inget arkiverat. Teckningar och mappar du lägger undan hamnar här.",
    folders: "Mappar",
    drawings: "Teckningar",
    drawingsCount: "{n} teckningar",
    marks: "{n} streck",
    restore: "Återställ",
    restoreFolder: "Återställ mappen och dess teckningar",
  },
  canvas: {
    title: "Rityta",
    exportPng: "Exportera som PNG",
    exportJson: "Exportera som JSON",
    download: "Ladda ner",
    downloadFormat: "Ladda ner {format}",
    downloadPct: "Paint-fil, med lager",
    copyToClipboard: "Kopiera till urklipp",
    dropImage: "Släpp bilden för att lägga till den i teckningen",
    placeImage: "Placerad bild",
    placeImageHint: "Dra för att flytta, dra i ett hörn för att ändra storlek.",
    placeImageKeep: "Behåll",
    placeImageDiscard: "Kasta",
    resizeImage: "Ändra bildens storlek",
    pageColor: "Sidfärg",
    grid: "Rutnät",
    color: "Färg",
    size: "Tjocklek",
    toolSettings: "Verktygsinställningar",
    fill: "Fyll former",
    fillOutline: "Kontur",
    fillFilled: "Fylld",
    mixColor: "Blanda en färg…",
    hideMixer: "Dölj blandaren",
    mixField: "Mättnad och ljushet",
    mixHue: "Nyans",
    keepColor: "Spara",
    colorKept: "Sparad",
    removeColor: "Glöm",
    sizeMm: "{size} mm",
    sizePt: "{size} pt",
    sizeNamed: "{size} · {note}",
    sizeReal: "som tillverkad",
    sizeFiner: "finare än tillverkad",
    sizeWider: "bredare än tillverkad",
    customSize: "Tjocklek",
    builtinPresets: "Förinställningar",
    presets: "Sparade",
    savePreset: "Spara verktyget",
    savePresetName: "Namn",
    savePresetGlyph: "Märke",
    presetNoGlyph: "Inget märke",
    savePresetPlaceholder: "Min favoritpenna",
    presetDefaultName: "Inställning",
    presetSave: "Spara",
    presetForget: "Glöm",
    colorUnused: "Det här verktyget ritar inte med färgen",
    tool: "Verktyg",
    toolbar: "Verktyg",
    selectionActions: "Markering",
    copy: "Kopiera",
    cut: "Klipp ut",
    paste: "Klistra in",
    fitPage: "Anpassa sidan, eller visa den i 1:1",
    zoomPercent: "{percent} %",
    undo: "Ångra",
    redo: "Gör om",
  },
  dials: {
    advanced: "Avancerat",
    reset: "Återställ",
    opacity: {
      name: "Opacitet: {value} %",
      hint: "Hur mycket av sidan som syns genom draget.",
    },
    strength: {
      name: "Styrka: {value} %",
      hint: "Hur mycket av ett streck ett drag tar bort. Skruva ner för att tona ner något i stället för att sudda bort det.",
    },
    rub: {
      name: "Tryck: {value} %",
      hint: "Hur hårt du trycker på gummit — hur djupt ner i papprets struktur det når. Tryck hårdare för att tona bort skuggan, aldrig för att få bort den helt.",
    },
    chisel: {
      name: "Kilspets: {value} %",
      hint: "Rund som en kulspets, eller platt som en kil som drar brett åt ett håll och fint åt det andra.",
    },
    angle: {
      name: "Spetsvinkel: {value}°",
      hint: "Åt vilket håll den platta spetsen är vänd.",
    },
    grade: {
      name: "Blyerts: {value}",
      hint: "Stiftets hårdhetsgrad. H är hård och ljus och går ovanpå papperet; B är mjuk och mörk och fyller kornet.",
    },
    hardness: {
      name: "Hårdhet: {value} %",
      hint: "Mjuk tonar ut kanten; hård håller den skarp.",
    },
    hair: {
      name: "Strån: {value} %",
      hint: "Fina strån ger många tunna streck, grova några få breda.",
    },
    load: {
      name: "Färgmängd: {value} %",
      hint: "Hur mycket färg penseln doppas med. Draget gör av med den efter hand, skrapar torrt och tar slut.",
    },
    splay: {
      name: "Spretighet: {value} %",
      hint: "En ny pensel ger en skarp kant, en sliten fransar sig.",
    },
    bleed: {
      name: "Blödning: {value} %",
      hint: "Hur långt en våt kant suger sig in i papperet.",
    },
    flow: {
      name: "Flöde: {value} %",
      hint: "Hur mycket färg varje drag lägger. Lågt byggs upp långsamt.",
    },
    pressure: {
      name: "Tryck: {value} %",
      hint: "Tryck hårdare för att fylla papprets korn; lätta för att låta det synas.",
    },
    feather: {
      name: "Mjuk kant: {value} mm",
      hint: "Tonar ut fyllningens kant i stället för att tvärt avsluta den.",
    },
    sample: {
      name: "Yta: {value}",
      hint: "Hur mycket av sidan ett tryck läser av. Bredare ger medelfärgen av en spretig yta i stället för en enstaka prick.",
    },
    water: {
      name: "Vatten: {value} %",
      hint: "Hur laddad penseln är. Blött rinner ut förbi håret och späder ut; torrt behåller penselns form.",
    },
    pigment: {
      name: "Pigment: {value} %",
      hint: "Hur mycket färg som finns i vattnet — en ljus lasyr eller full styrka.",
    },
    granulation: {
      name: "Granulering: {value} %",
      hint: "Hur tungt pigmentet sjunker ner i papperets gropar. Grovt papper och jordfärger granulerar mest.",
    },
  },
  options: {
    title: "Återgivning",
    washDetail: "Laveringens detaljnivå: {value} %",
    washDetailHint: "Lägre är snabbare och grövre.",
    leadDetail: "Stiftets detaljnivå: {value} %",
    leadDetailHint: "Lägre är snabbare och grövre.",
  },
  presets: {
    pencil: {
      liner: "Kontur",
      fineliner: "Fineliner",
      guide: "Hjälplinje",
    },
    eraser: {
      block: "Kloss",
      detail: "Detalj",
      kneaded: "Knådgummi",
    },
    rubber: {
      pocket: "Fickgummi",
      kneaded: "Knådgummi",
      top: "Pennsudd",
    },
    graphite: {
      sketch: "Skiss",
      construction: "Hjälplinjer",
      shading: "Skuggning",
      detail: "Detalj",
    },
    paintbrush: {
      round: "Rund",
      hog: "Svinborst",
      dry: "Torrpensel",
      glaze: "Lasering",
    },
    flatbrush: {
      onestroke: "Enkeldrag",
      lettering: "Textning",
      wash: "Lavering",
    },
    watercolor: {
      wash: "Lavering",
      wet: "Vått i vått",
      glaze: "Lasering",
      dry: "Torrpensel",
    },
    airspray: {
      general: "Allround",
      detail: "Detalj",
      background: "Bakgrund",
    },
    marker: {
      marker: "Märkpenna",
      chisel: "Snedskuren",
      fineliner: "Fineliner",
    },
    highlighter: {
      text: "Textrad",
      broad: "Bred",
    },
    crayon: {
      coloring: "Färgläggning",
      shading: "Skuggning",
      solid: "Täckande",
    },
    calligraphy: {
      italic: "Italic",
      foundational: "Foundational",
      uncial: "Uncial",
    },
    filler: {
      flat: "Jämn fyllning",
      soft: "Mjuk kant",
      wash: "Lavering",
    },
  },
  text: {
    field: "Bildtext",
    placeholder: "Skriv…",
    font: "Typsnitt",
    bold: "Fet",
    italic: "Kursiv",
    move: "Dra för att flytta texten",
    keep: "Behåll texten",
    discard: "Släng texten",
  },
  layers: {
    title: "Lager",
    open: "Sidopanel",
    add: "Nytt lager",
    base: "Lager 1",
    background: "Bakgrund",
    numbered: "Lager {n}",
    select: "Rita på {name}",
    show: "Visa {name}",
    hide: "Dölj {name}",
    lock: "Lås {name}",
    unlock: "Lås upp {name}",
    lockedHint: "{name} är låst — lås upp det för att rita på det",
    moveUp: "Flytta {name} uppåt",
    moveDown: "Flytta {name} nedåt",
    delete: "Ta bort {name}",
    deleteConfirm:
      "Ta bort ”{name}” och de {n} streck som ligger där? Ångra tar tillbaka dem.",
    marks: "{n} streck",
    empty: "Tomt",
    hint: "Nya streck hamnar på det valda lagret. Bakgrunden bär sidans färg; dölj den så blir sidan genomskinlig.",
    swipeHint: "Svep in från högerkanten för att öppna panelen.",
  },
  swatches: {
    from: "Från",
    mid: "Mitten",
    to: "Till",
    none: "Ingen {name}-färg",
  },
  pageColors: {
    white: "Vit",
    paper: "Pappersvit",
    cream: "Gräddvit",
    charcoal: "Kolgrå",
    black: "Svart",
    slate: "Skiffer",
  },
  grounds: {
    solid: {
      name: "Enfärgad",
      hint: "En förseglad digital sida: ingen struktur, och färgen lägger sig ovanpå det den täcker.",
    },
    hot: {
      name: "Satinerat",
      hint: "Akvarellpapper valsat slätt. Det suger som papper men har nästan inget för pigmentet att lägga sig i.",
    },
    cold: {
      name: "Grovkornigt",
      hint: "Arket som de flesta akvareller målas på. Tillräckligt med struktur för att granulera, inte så mycket att en linje bryts upp.",
    },
    rough: {
      name: "Grovt",
      hint: "Torkat utan pressning. Laveringar samlas i dalarna och en torr pensel hoppar över topparna.",
    },
    cartridge: {
      name: "Ritpapper",
      hint: "Skissblockets papper. Fin struktur, och limmat nog att bläcket stannar där du satte det.",
    },
    cotton: {
      name: "Bomullsduk",
      hint: "Grundad duk: en grov väv som syns genom allt, och en grund som håller färgen på ytan.",
    },
  },
  tools: {
    pencil: {
      name: "Bläckpenna",
      description: "Frihandslinje med vald tjocklek.",
    },
    graphite: {
      name: "Blyertspenna",
      description:
        "En blyertspenna att skissa med. Den ritar alltid i grått — ställ in stiftet från hård och ljus H till mjuk och mörk B.",
    },
    erasers: {
      name: "Sudda",
      description:
        "Ta bort ett streck — helt med suddgummit, eller lite i taget med radergummit. Tryck igen för att välja vilket.",
    },
    eraser: {
      name: "Suddgummi",
      description:
        "Suddar bort streck från sidan. Skruva ner styrkan för att tona ner dem i stället för att sudda bort dem.",
    },
    rubber: {
      name: "Radergummi",
      description:
        "Blyertsgummit, som ett sådant faktiskt beter sig: det lyfter blyerts och krita lite i taget, låter papprets struktur skina igenom och får aldrig bort allt. Bläck, färg och tusch sitter kvar.",
    },
    line: { name: "Linje", description: "En rak linje mellan två punkter." },
    rectangle: {
      name: "Rektangel",
      description: "En ruta, med kontur eller fylld.",
    },
    ellipse: {
      name: "Ellips",
      description: "En cirkel eller oval, med kontur eller fylld.",
    },
    hand: {
      name: "Hand",
      description:
        "Dra runt sidan i stället för att rita på den. Dubbeltryck för att anpassa sidan, igen för 1:1.",
    },
    arrow: {
      name: "Pil",
      description: "En linje med pilspets — för att peka på saker.",
    },
    shapes: {
      name: "Former",
      description:
        "Rutor, cirklar, polygoner, stjärnor, linjer och pilar — elva stycken bakom en knapp. Tryck igen för att välja en annan, eller för att fylla den.",
    },
    roundrect: {
      name: "Rundad rektangel",
      description: "En ruta med avrundade hörn.",
    },
    triangle: {
      name: "Triangel",
      description: "Tre sidor, spetsen uppåt, utsträckt över draget.",
    },
    diamond: {
      name: "Romb",
      description: "En kvadrat på sitt hörn — flödesschemats beslut.",
    },
    pentagon: { name: "Femhörning", description: "Fem sidor, spetsen uppåt." },
    hexagon: {
      name: "Sexhörning",
      description: "Sex sidor, stående på en platt sida.",
    },
    star: { name: "Stjärna", description: "En femuddig stjärna." },
    doublearrow: {
      name: "Dubbelpil",
      description:
        "En linje med spets i båda ändar — för att mäta ett avstånd.",
    },
    selection: {
      name: "Markera",
      description:
        "Välj ut streck — med en ruta, en oval, ett lasso eller genom att följa konturerna av det som är målat under pekaren. Tryck igen för att välja vilket. Flytta det du valt med handen; kopiera, klipp ut eller ta bort det med tangentbordet, högerklick eller ett långt tryck.",
    },
    select: {
      name: "Markera ruta",
      description: "Dra en rektangel för att välja ut strecken den täcker.",
    },
    selectOval: {
      name: "Markera oval",
      description: "Samma drag, läst som ovalen inuti det.",
    },
    selectLasso: {
      name: "Markera med lasso",
      description:
        "Rita runt strecken du vill ha på fri hand — slingan sluts av sig själv.",
    },
    selectTrace: {
      name: "Markera kontur",
      description:
        "Tryck på ett område så följer markeringen konturerna av det som är ritat där, i stället för en form du ritat över det.",
    },
    marker: {
      name: "Tuschpenna",
      description:
        "En tuschpenna med spritbläck: den mörknar där den korsar sig själv, och spetsen går från rund kulspets till sned kil.",
    },
    highlighter: {
      name: "Överstrykningspenna",
      description:
        "En bred genomskinlig kil — ett helt band tvärs över sidan, hårfint nedför den — som byggs upp där den korsas.",
    },
    paintbrush: {
      name: "Rundpensel",
      description:
        "En laddad pensel: draget sväller på mitten och tonar ut i båda ändar.",
    },
    flatbrush: {
      name: "Flatpensel",
      description:
        "En pensel med rak kant: full bredd tvärs över draget, hårfin linje längs kanten.",
    },
    watercolor: {
      name: "Akvarell",
      description:
        "En våt lavering på papper. Den rinner ut förbi håret, torkar mörkast i kanten och varje lager visar det som ligger under.",
    },
    airspray: {
      name: "Airbrush",
      description:
        "Ett moln av färg som byggs upp ju längre du håller kvar på samma ställe.",
    },
    crayon: {
      name: "Vaxkrita",
      description: "En vaxig, kornig krita som hoppar över papprets struktur.",
    },
    calligraphy: {
      name: "Kalligrafipenna",
      description:
        "En platt spets — bred tvärs över draget, hårfin längs med det. Ställ in vinkeln den hålls i.",
    },
    text: {
      name: "Text",
      description:
        "Tryck på sidan och skriv. Välj typsnitt, storlek, fet eller kursiv medan du skriver.",
    },
    fills: {
      name: "Fyll",
      description:
        "Fyll en yta — enfärgat med färgburken, eller med en toning. Tryck igen för att välja vilken.",
    },
    filler: {
      name: "Färgburk",
      description:
        "Tryck på en tom yta så fylls den med färgen, fram till strecken runt omkring.",
    },
    gradient: {
      name: "Toning",
      description:
        "Tryck på en yta och dra: den fylls med en toning åt det håll du drog, i verktygets egna två färger (eller tre).",
    },
    dropper: {
      name: "Färgpipett",
      description:
        "Tryck på sidan för att rita med färgen du tryckte på. Ställ in hur stor yta ett tryck läser av.",
    },
    image: {
      name: "Bild",
      description:
        "En bild som släppts på sidan. Den har ingen knapp — dra in en bildfil på ritytan och placera den.",
    },
  },
  settings: {
    title: "Inställningar",
    sections: "Avsnitt",
    chooseSection: "Välj avsnitt",
    tabs: {
      general: "Allmänt",
      appearance: "Utseende",
      tools: "Verktyg",
      canvas: "Rityta",
      download: "Nedladdning",
      storage: "Lagring",
      developer: "Utvecklare",
      logs: "Loggar",
    },
    general: {
      intro: "Hur appen beter sig runt ritytan.",
      languageTitle: "Språk",
      chooseLanguage: "Appens språk",
      languageHint: "Gäller direkt — du behöver inte spara.",
      gridTitle: "Rutnät",
      showGrid: "Visa rutnät",
      showGridHint:
        "Ett ljust rutnät bakom sidan, för att rada upp rutor och pilar. Det är bara en hjälplinje — det exporteras aldrig.",
      toolNameTitle: "Verktygsnamn",
      showToolName: "Visa namnet på verktyget du väljer",
      showToolNameHint:
        "Verktygets namn tonas in mitt på sidan ett ögonblick när du byter till det, och försvinner sedan ur vägen.",
      developerTitle: "Utvecklare",
      developerMode: "Utvecklarläge",
      developerModeHint: "Visa fliken Utvecklare och dess diagnostik.",
    },
    tools: {
      intro:
        "Varje verktyg i appen är ett plugin, och det här är stället de hänger på. Slå på ett så dyker det upp i verktygsfältet direkt.",
      alwaysOn: "Alltid på",
      optionalTitle: "Verktygsfält",
      optionalHint:
        "I den ordning knapparna sitter — flytta en rad så flyttar verktygsfältet med. Några verktyg är på från början; resten är ett tryck bort. Att slå av ett döljer det bara — streck du redan ritat med det ligger kvar.",
      shortcut: "Kortkommando: {key}",
      moveUp: "Flytta {name} tidigare i verktygsfältet",
      moveDown: "Flytta {name} senare i verktygsfältet",
    },
    canvas: {
      intro:
        "Hyllan som Ny bild erbjuder: storlekarna appen levereras med, och sidorna du själv ställt i ordning.",
      sizesTitle: "Storlekar",
      sizesHint:
        "Storlekarna Ny bild erbjuder vid namn. Att dölja en tar bort den från hyllan — ingenting du redan ritat ändras, eftersom en sidas storlek bestäms när den skapas.",
      hide: "Dölj {name} på hyllan i Ny bild",
      show: "Visa {name} på hyllan i Ny bild",
      presetsTitle: "Förinställda ritytor",
      presetsHint:
        "En sida du ställt i ordning och gett ett namn — en skissbok, en telefonbakgrund, en serieruta. Den står på hyllan i Ny bild bredvid storlekarna ovan, och den kan ta med sig egna verktyg och en egen typ av rityta.",
      add: "Ny förinställd rityta",
      full: "Det är alla {n}. Släng en för att göra plats.",
      edit: "Ändra {name}",
      back: "Alla förinställda ritytor",
      pageTitle: "Sidan",
      nameLabel: "Namn",
      namePlaceholder: "Skissbok",
      toolsTitle: "Verktyg",
      ownTools: "Egna verktyg",
      ownToolsHint:
        "En sida som skapats på den här förinställningen öppnas med verktygen nedan i stället för din vanliga verktygsrad — varje gång den öppnas, inte bara första. Slår du på det utgår den från verktygsraden du har nu.",
      kitHint:
        "I den ordning knapparna kommer att sitta på den här sidan. Tryck på ett verktygs märke för att ställa i ordning just det verktyget för den här sidan; i övrigt är det samma ställ som Inställningar → Verktyg.",
      kitCustomize: "Ställ i ordning {name} för den här sidan",
      kitBack: "Den här sidans verktyg",
      kitDefaultTitle: "Förvalt verktyg",
      kitDefaultHint:
        "Vilket av dem den här sidans knapp öppnas på. Utan ett val öppnas den på det du använde senast, vilket säger mer om din eftermiddag än om den här sidan.",
      kitDefaultAny: "Det du hade senast",
      kitToolTitle: "Hur det är inställt",
      kitOwnTool: "Egen {name}",
      kitOwnToolHint:
        "En sida som skapats på den här förinställningen öppnas med {name} inställt som du ställer det här — bredden och varje ratt — i stället för hur du senast lämnade det. Slår du på det utgår det från hur du har det nu.",
      kitToolEach:
        "Var och en av dem har sina egna inställningar på den här sidan — välj den du ställer i ordning. Det säger ingenting om vilken sidan öppnas på.",
      ownSheet: "Egen typ av rityta",
      ownSheetHint:
        "Väljer du den här förinställningen i Ny bild ligger det här arket redan i väljaren. Bara ett förslag: arket målas in i varje streck som görs på det, så det är ditt att ändra innan du trycker Skapa.",
    },
    download: {
      intro:
        "Vad nedladdningsknappen erbjuder, och vad som kommer ut. Urklipp finns alltid med i menyn.",
      typesTitle: "Filtyper",
      typesHint: "Bara de typer du slår på visas i nedladdningsmenyn.",
      formatPng: "PNG-bild",
      formatPngHint:
        "Förlustfri, och den enda typen som kan bära en genomskinlig bakgrund. Det trygga valet.",
      formatJpg: "JPG-foto",
      formatJpgHint:
        "Mindre för sidor fulla av foton, och accepteras av uppladdningar som vägrar allt annat. Aldrig genomskinlig.",
      formatSvg: "SVG-vektor",
      formatSvgHint:
        "Strecken som vektorer, så teckningen förblir skarp i alla storlekar. Släppta bilder följer med inuti filen.",
      noTypes:
        "Alla filtyper är avslagna — menyn kan bara kopiera till urklipp.",
      areaTitle: "Yta",
      areaLabel: "Ladda ner",
      scopePage: "Hela sidan",
      scopeMarks: "Bara strecken",
      areaHint:
        "”Bara strecken” beskär filen till det du ritat, med en liten marginal — praktiskt på en stor sida med ett litet diagram på.",
      backgroundTitle: "Bakgrund",
      transparent: "Genomskinlig bakgrund",
      transparentHint:
        "Låt sidan vara omålad så att strecken hamnar på genomskinlighet. JPG saknar genomskinlighet och behåller alltid sidfärgen; suddgummit målar med sidfärgen, så suddade ytor förblir täckande.",
    },
    appearance: {
      intro: "Tema, typsnitt och utseendet på appens ramverk.",
      backdropTitle: "Bakgrund bakom dialoger",
      backdropDarkness: "Mörker",
      backdropBlur: "Oskärpa",
      levelNone: "Ingen",
      levelSubtle: "Svag",
      levelMedium: "Mellan",
      levelStrong: "Stark",
      darknessDark: "Mörk",
    },
    storage: {
      intro:
        "Dina teckningar ligger på den här enheten. Anslut en mapp eller en molntjänst för att hålla dem i takt mellan enheter.",
      backendTitle: "Var teckningarna sparas",
      backendThisDevice: "Den här enheten",
      backendFolder: "Lokal mapp",
      backendDropbox: "Dropbox",
      backendGdrive: "Google Drive",
      folderHint:
        "Välj en mapp på datorn; teckningsfilen skrivs rakt in i den.",
      folderChoose: "Välj en mapp…",
      folderConnected: "Mapp ansluten",
      folderReconnectNeeded: "Behörigheten till mappen har dragits tillbaka.",
      folderReconnect: "Anslut igen",
      connect: "Anslut {name}",
      connected: "Ansluten till {name}",
      disconnect: "Koppla från",
      missingKeyDropbox:
        "Det här bygget saknar Dropbox-appnyckel, så Dropbox kan inte anslutas. Se docs/configuration.md.",
      missingKeyGdrive:
        "Det här bygget saknar Google-klient-id, så Google Drive kan inte anslutas. Se docs/configuration.md.",
      encryptionTitle: "Kryptering",
      encrypt: "Kryptera molnkopian",
      encryptHint:
        "Krypterar den synkade filen med en lösenfras du väljer. Lösenfrasen sparas aldrig — tappar du bort den går molnkopian inte att läsa.",
      unlockTitle: "Lås upp",
      unlockHint: "Ange lösenfrasen för att läsa den krypterade molnkopian.",
      exportTitle: "Export",
      exportHint:
        "Ladda ner hela dokumentet som JSON, eller den här sidan som PNG.",
    },
    developer: {
      intro: "Diagnostik för när något ser fel ut.",
      updatesTitle: "Uppdateringar",
      checkUpdate: "Sök efter uppdateringar",
      checking: "Söker…",
      updateAvailable: "Uppdatering finns",
      upToDate: "Uppdaterad",
      updatesUnavailable: "Inget service worker i det här bygget.",
      loggingTitle: "Loggning",
      captureLogs: "Spela in loggar",
      captureLogsHint:
        "Spara diagnostiska loggrader så att fliken Loggar kan visa dem.",
      buildTitle: "Bygge",
      buildLabel: "bygge",
      commitLabel: "commit",
      modeLabel: "läge",
      displayLabel: "visning",
      installedPwa: "installerad PWA (fristående)",
      browserTab: "webbläsarflik",
      pluginsTitle: "Plugin",
      pluginsRegistered: "{n} verktygsplugin registrerade",
    },
    logs: {
      intro:
        "Appens loggbuffert, renderad live från ramverkets loggningsmodul.",
      logsTitle: "Loggar",
    },
  },
  layerSave: {
    save: "Spara lagren",
    saving: "Sparar lagren…",
    saved: "Lagren är sparade",
  },
  cloudSetup: {
    heading: "{provider} har redan teckningar",
    blurb:
      "Den här enheten och {provider} har olika dokument. Välj vilket som ska behållas — det andra ersätts.",
    useCloud: "Använd kopian från {provider}",
    useLocal: "Behåll enhetens kopia",
    cloudSummary: "{provider}: {drawings} teckningar, {strokes} streck",
    localSummary: "Den här enheten: {drawings} teckningar, {strokes} streck",
  },
  sync: {
    cloudSync: "Molnsynk",
    status: "Status",
    backend: "Lagring",
    fileLocation: "Filens plats",
    encryptionLabel: "Kryptering",
    encryptionOn: "På",
    encryptionOff: "Av",
    reloadFromBackend: "Läs om från lagringen",
    saveNow: "Spara nu",
    tryAgain: "Försök igen",
    reconnect: "Anslut {name} igen",
    openIn: "Öppna i {name}",
    checkConnection: "Testa anslutningen",
    viewSyncLog: "Visa synklogg",
    hideSyncLog: "Dölj synklogg",
    syncingNow: "Sparar…",
    failedHeading: "Sparandet misslyckades",
    throttledHeading: "För många anrop",
    throttledDetail: "{name} bromsar oss — försöker igen strax.",
    reauthHeading: "Sessionen har gått ut",
    reauthDetail: "Anslut {name} igen för att fortsätta synka.",
    conflictHeading: "Nyare kopia i lagringen",
    conflictDetail:
      "En annan enhet sparade efter den här. Läs om för att ta den kopian.",
    pendingHeading: "Osparade ändringar",
    pendingDetail: "Väntar på att skicka till {name}.",
    offlineHeading: "Offline",
    offlineDetail: "Når inte {name} — ditt arbete är kvar på enheten.",
    syncedTo: "Synkad till {name}",
    checkPinging: "Pingar {name}…",
    checkStillOffline: "{name} går fortfarande inte att nå.",
    checkAuthExpired: "{name} behöver anslutas igen.",
    failedDetailFallback: "Kunde inte spara till {name}.",
  },
  namespaces: {
    heading: "Namnrymder",
    blurb: "Separata uppsättningar teckningar — jobb, undervisning, kladd.",
    newAction: "Ny namnrymd",
    namePlaceholder: "Namnrymdens namn",
    nameLabel: "Namn",
    create: "Skapa",
    nameRequired: "Ge den ett namn först.",
    colorLabel: "Färg",
    glyphLabel: "Symbol",
    glyphNone: "Ingen",
    save: "Spara",
    cancel: "Avbryt",
    renameAction: "Byt namn",
    deleteAction: "Ta bort",
    delete: "Ta bort",
    deleteConfirm: "Ta bort ”{name}” och alla teckningar i den?",
    switchTo: "Byt till {name}",
    defaultBadge: "standard",
  },
  changelog: {
    heading: "Nyheter",
    empty: "Inga släpp än.",
    back: "Tillbaka",
  },
};
