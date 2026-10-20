// Builders for test inputs: fonts and zips assembled byte by byte.

const enc = new TextEncoder();

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface ZipFixture {
  name: string;
  text?: string;
  /** Raw bytes instead of text. */
  data?: Uint8Array;
  method: 0 | 8;
  /** Extra bytes in the local header only, as some writers emit. */
  localExtra?: number;
}

/** Builds a zip by hand (CRCs left at 0; the reader does not check them). */
export async function buildZip(files: ZipFixture[]): Promise<Uint8Array> {
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);

  for (const f of files) {
    const name = enc.encode(f.name);
    const plain = f.data ?? enc.encode(f.text ?? "");
    const body = f.method === 8 ? await deflateRaw(plain) : plain;
    const extra = f.localExtra ?? 0;
    const offset = parts.length;

    u32(parts, 0x04034b50);
    u16(parts, 20);
    u16(parts, 0x0800);
    u16(parts, f.method);
    u32(parts, 0);
    u32(parts, 0);
    u32(parts, body.length);
    u32(parts, plain.length);
    u16(parts, name.length);
    u16(parts, extra);
    parts.push(...name, ...new Array(extra).fill(0), ...body);

    u32(central, 0x02014b50);
    u16(central, 20);
    u16(central, 20);
    u16(central, 0x0800);
    u16(central, f.method);
    u32(central, 0);
    u32(central, 0);
    u32(central, body.length);
    u32(central, plain.length);
    u16(central, name.length);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u16(central, 0);
    u32(central, 0);
    u32(central, offset);
    central.push(...name);
  }

  const eocd: number[] = [];
  u32(eocd, 0x06054b50);
  u16(eocd, 0);
  u16(eocd, 0);
  u16(eocd, files.length);
  u16(eocd, files.length);
  u32(eocd, central.length);
  u32(eocd, parts.length);
  u16(eocd, 0);
  return new Uint8Array([...parts, ...central, ...eocd]);
}

const u16 = (a: number[], v: number) => a.push((v >>> 8) & 0xff, v & 0xff);
const u32 = (a: number[], v: number) => a.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);

/** A font with a name table (Windows, en-US) and an OS/2 table; enough for readFaces. */
export function buildFont(names: Record<number, string>, opts: { weight?: number; italic?: boolean; fsType?: number; stringLengthBonus?: number; familyClass?: number; monospaced?: boolean } = {}) {
  const records: number[] = [];
  const strings: number[] = [];
  const ids = Object.keys(names).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    const bytes = [...names[id]].flatMap((c) => [0, c.charCodeAt(0)]);
    u16(records, 3);
    u16(records, 1);
    u16(records, 0x409);
    u16(records, id);
    u16(records, bytes.length + (opts.stringLengthBonus ?? 0));
    u16(records, strings.length);
    strings.push(...bytes);
  }
  const name: number[] = [];
  u16(name, 0);
  u16(name, ids.length);
  u16(name, 6 + records.length);
  name.push(...records, ...strings);

  const os2 = new Array(78).fill(0);
  os2[4] = ((opts.weight ?? 400) >>> 8) & 0xff;
  os2[5] = (opts.weight ?? 400) & 0xff;
  os2[7] = 5;
  if (opts.italic) os2[63] = 1;
  os2[9] = (opts.fsType ?? 0) & 0xff;
  os2[30] = (opts.familyClass ?? 0) & 0xff;
  if (opts.monospaced) os2[35] = 9;

  const header: number[] = [];
  u32(header, 0x00010000);
  u16(header, 2);
  header.push(0, 0, 0, 0, 0, 0);
  const tables = [
    ["OS/2", os2],
    ["name", name],
  ] as const;
  let offset = 12 + tables.length * 16;
  const body: number[] = [];
  for (const [tag, data] of tables) {
    header.push(...[...tag].map((c) => c.charCodeAt(0)));
    u32(header, 0);
    u32(header, offset);
    u32(header, data.length);
    body.push(...data);
    offset += data.length;
  }
  return new Uint8Array([...header, ...body]);
}
