// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A ZIP reader and writer, in about as few bytes as the format allows.
//
// The `.pct` container is a zip (see `pct.ts`), and this is the whole reason it
// can be one without a dependency: `CompressionStream("deflate-raw")` is the
// codec, and everything around it is thirty bytes of header arithmetic. A
// library would have bought the same two functions for a couple of hundred
// kilobytes on the entry path, which is the one budget this app guards
// (`CLAUDE.md`: "keep boot small").
//
// Only the subset a container needs is implemented, and the omissions are
// deliberate rather than pending:
//
//   - **Store and deflate**, methods 0 and 8. Nothing else has been a real
//     zip's contents this century.
//   - **No zip64.** A drawing whose layers run past 4 GB is not a drawing.
//   - **No encryption, no multi-disk, no data descriptors.** Every entry is
//     compressed in memory first, so the sizes and the CRC are known before the
//     local header is written and there is nothing to stream back and fix up.
//
// Two properties the rest of the format leans on:
//
//   1. **Deterministic output.** Entries carry a fixed DOS timestamp rather
//     than the clock, so the same content always produces the same bytes. That
//     is what lets a test assert on a container, and what stops a re-save
//     looking like a change to anything comparing bytes.
//   2. **Order is preserved.** `unzip` hands entries back in central-directory
//     order, which is the order they were written — so `mimetype` staying first
//     is a property of the archive, not a convention the reader has to trust.

/** One file in an archive. */
export type ZipEntry = {
  /** POSIX-style path inside the archive, e.g. `layers/00-a1b2c3.png`. */
  name: string;
  bytes: Uint8Array;
  /** Deflate the bytes rather than storing them. Default true.
   *
   *  Pass false for anything already compressed — a PNG is deflate all the way
   *  down, and running it through a second time costs CPU to add a few bytes.
   *  The `mimetype` entry is stored too, so the archive's type can be sniffed
   *  from the first few bytes of the file without inflating anything. */
  compress?: boolean;
};

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** The DOS timestamp every entry carries: 1980-01-01 00:00:00, the earliest the
 *  format can express. A real clock would make otherwise-identical archives
 *  differ, which costs determinism and buys a modification date nobody reads
 *  off a container. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

// --- CRC32 -------------------------------------------------------------------

/** The standard CRC-32 table (polynomial 0xEDB88320), built once on first use.
 *  Lazily, because a container is not on the app's entry path and 1 KB of table
 *  should not be either. */
let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  const next = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    next[i] = c >>> 0;
  }
  crcTable = next;
  return next;
}

/** CRC-32 of a byte run, as an unsigned 32-bit number. */
export function crc32(bytes: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = t[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// --- Byte plumbing -----------------------------------------------------------

/** A growable little-endian byte sink. The zip format is a few dozen fixed-width
 *  fields and some blobs, so a cursor over a `DataView` is the whole of it. */
class Sink {
  private parts: Uint8Array[] = [];
  private size = 0;

  get length(): number {
    return this.size;
  }

  u16(value: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, value, true);
    this.raw(b);
  }

  u32(value: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, value >>> 0, true);
    this.raw(b);
  }

  raw(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.size += bytes.length;
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

const utf8 = new TextEncoder();

/** Whether this runtime can deflate. Node 18+ and every browser the app targets
 *  can; a stray environment that can't still gets a valid archive, just a
 *  bigger one (every entry stored). */
function canDeflate(): boolean {
  return typeof CompressionStream !== "undefined";
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Raw-deflate a byte run (no zlib wrapper — zip carries its own CRC). */
export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const source = new Blob([bytes as BlobPart]).stream();
  return drain(source.pipeThrough(cs) as ReadableStream<Uint8Array>);
}

/** Inflate a raw-deflate byte run. */
export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const source = new Blob([bytes as BlobPart]).stream();
  return drain(source.pipeThrough(ds) as ReadableStream<Uint8Array>);
}

// --- Write -------------------------------------------------------------------

/** What one entry contributed, kept so the central directory can name it. */
type Written = {
  name: Uint8Array;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
};

/** Pack entries into a zip archive.
 *
 *  Entries are written in the order given and read back in that order, so a
 *  caller that wants a particular file first (the container puts `mimetype`
 *  there) gets it by listing it first. */
export async function zip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const out = new Sink();
  const written: Written[] = [];

  for (const entry of entries) {
    const name = utf8.encode(entry.name);
    const wantsDeflate = entry.compress !== false && canDeflate();
    const packed = wantsDeflate ? await deflateRaw(entry.bytes) : entry.bytes;
    // Deflate can *grow* incompressible input. Storing it instead is both
    // smaller and cheaper to read back.
    const deflated = wantsDeflate && packed.length < entry.bytes.length;
    const body = deflated ? packed : entry.bytes;

    written.push({
      name,
      method: deflated ? METHOD_DEFLATE : METHOD_STORE,
      crc: crc32(entry.bytes),
      compressedSize: body.length,
      size: entry.bytes.length,
      offset: out.length,
    });
    const it = written[written.length - 1]!;

    out.u32(LOCAL_SIG);
    out.u16(20); // version needed
    out.u16(0); // flags — UTF-8 bit set below only when the name needs it
    out.u16(it.method);
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(it.crc);
    out.u32(it.compressedSize);
    out.u32(it.size);
    out.u16(name.length);
    out.u16(0); // extra field length
    out.raw(name);
    out.raw(body);
  }

  const centralStart = out.length;
  for (const it of written) {
    out.u32(CENTRAL_SIG);
    out.u16(20); // version made by
    out.u16(20); // version needed
    out.u16(0);
    out.u16(it.method);
    out.u16(DOS_TIME);
    out.u16(DOS_DATE);
    out.u32(it.crc);
    out.u32(it.compressedSize);
    out.u32(it.size);
    out.u16(it.name.length);
    out.u16(0); // extra
    out.u16(0); // comment
    out.u16(0); // disk number
    out.u16(0); // internal attrs
    out.u32(0); // external attrs
    out.u32(it.offset);
    out.raw(it.name);
  }
  const centralSize = out.length - centralStart;

  out.u32(EOCD_SIG);
  out.u16(0); // this disk
  out.u16(0); // disk the central directory starts on
  out.u16(written.length);
  out.u16(written.length);
  out.u32(centralSize);
  out.u32(centralStart);
  out.u16(0); // archive comment length

  return out.concat();
}

// --- Read --------------------------------------------------------------------

/** Where the end-of-central-directory record starts, or -1 when the bytes are
 *  not a zip. Scanned backwards from the end because the record is last and
 *  variable-length (it carries a trailing comment). */
function findEocd(view: DataView): number {
  const min = 22;
  if (view.byteLength < min) return -1;
  // The comment can be 64 KB; past that there is nothing left to find.
  const floor = Math.max(0, view.byteLength - min - 0xffff);
  for (let at = view.byteLength - min; at >= floor; at--) {
    if (view.getUint32(at, true) === EOCD_SIG) return at;
  }
  return -1;
}

/** Read an archive into its entries, in the order they were written.
 *
 *  Throws when the bytes are not a zip or an entry uses a method this reader
 *  doesn't implement — the caller surfaces that as "this isn't a paint file"
 *  rather than half-loading a document. */
export async function unzip(
  bytes: Uint8Array,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error("not a zip archive");

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: { name: string; bytes: Uint8Array }[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== CENTRAL_SIG) {
      throw new Error("corrupt zip central directory");
    }
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    // The local header repeats the name and extra lengths, and they are the
    // authoritative ones for finding the body — a writer may pad the local
    // extra field differently from the central one.
    if (view.getUint32(localAt, true) !== LOCAL_SIG) {
      throw new Error(`corrupt zip entry: ${name}`);
    }
    const localNameLength = view.getUint16(localAt + 26, true);
    const localExtraLength = view.getUint16(localAt + 28, true);
    const bodyAt = localAt + 30 + localNameLength + localExtraLength;
    const body = bytes.subarray(bodyAt, bodyAt + compressedSize);

    if (method === METHOD_STORE) {
      out.push({ name, bytes: body });
    } else if (method === METHOD_DEFLATE) {
      out.push({ name, bytes: await inflateRaw(body) });
    } else {
      throw new Error(`unsupported zip compression method ${method}`);
    }

    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** Read an archive into a path → bytes map. The convenience the container
 *  reader wants, which looks entries up by name rather than walking them. */
export async function unzipToMap(
  bytes: Uint8Array,
): Promise<Map<string, Uint8Array>> {
  return new Map((await unzip(bytes)).map((e) => [e.name, e.bytes]));
}
