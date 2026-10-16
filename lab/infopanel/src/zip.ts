/**
 * Read-only ZIP reader for `.infopanel` exports.
 *
 * InfoPanel writes them with .NET's ZipArchive: deflate (8) entries, no zip64
 * at the sizes seen (largest corpus file 18 MB). Inflates with the
 * `DecompressionStream` global, present in browsers and Node 18+.
 */

export interface ZipEntry {
  /** Name as stored, with `\` normalised to `/`. */
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  /** Offset of the entry's local file header. */
  headerOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const STORE = 0;
const DEFLATE = 8;

const utf8 = new TextDecoder();

function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function findEocd(dv: DataView): number {
  // EOCD is 22 bytes plus a comment of at most 65535 bytes.
  const min = Math.max(0, dv.byteLength - 22 - 0xffff);
  for (let i = dv.byteLength - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error("Not a zip file: end of central directory not found");
}

export function listEntries(buf: Uint8Array): ZipEntry[] {
  const dv = view(buf);
  const eocd = findEocd(dv);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error("zip64 archives are not supported");

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== CENTRAL_SIG) throw new Error(`Bad central directory record ${i}`);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    entries.push({
      name: utf8.decode(buf.subarray(p + 46, p + 46 + nameLen)).replaceAll("\\", "/"),
      method: dv.getUint16(p + 10, true),
      compressedSize: dv.getUint32(p + 20, true),
      size: dv.getUint32(p + 24, true),
      headerOffset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readEntry(buf: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const dv = view(buf);
  const h = entry.headerOffset;
  if (dv.getUint32(h, true) !== LOCAL_SIG) throw new Error(`Bad local header for ${entry.name}`);
  // The local extra field can differ from the central one; read its own lengths.
  const start = h + 30 + dv.getUint16(h + 26, true) + dv.getUint16(h + 28, true);
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === STORE) return raw.slice();
  if (entry.method === DEFLATE) return inflateRaw(raw);
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}
