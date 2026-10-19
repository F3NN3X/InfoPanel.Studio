/**
 * Reads what font matching needs from a TrueType/OpenType file or collection:
 * names, weight, width and slant, and the named instances of a variable font
 * (DirectWrite lists those as separate faces).
 */

export interface FontFace {
  /** Family as DirectWrite groups it: WWS name (21), else typographic (16), else legacy (1). */
  family: string;
  /** Face (style) name: WWS (22), else typographic (17), else legacy (2). */
  face: string;
  /** Legacy family (1) and the full name (4), which CSS `local()` matches. */
  legacyFamily: string;
  fullName: string;
  postscriptName: string;
  weight: number;
  /** usWidthClass, 1 (ultra-condensed) … 5 (normal) … 9 (ultra-expanded). */
  width: number;
  italic: boolean;
  /** Index within a .ttc collection. */
  index: number;
  /** Named instance coordinates for a variable font, e.g. { wght: 700 }. */
  variation?: Record<string, number>;
  /** The font's own license description (name 13) and URL (name 14), when it has them. */
  licenseText?: string;
  licenseUrl?: string;
  /** OS/2 fsType: what the license allows when the font is embedded in a document. */
  embedding?: Embedding;
  /** A rough kind of design from OS/2 (family class, PANOSE proportion); "other" when the font does not say. */
  category?: FontCategory;
}

export type FontCategory = "monospace" | "serif" | "sans" | "script" | "other";

export type Embedding = "installable" | "restricted" | "preview & print" | "editable";

/** OS/2 fsType bits 1–3 (OpenType spec); 0 is installable. */
function embeddingOf(fsType: number): Embedding {
  if (fsType & 0x0008) return "editable";
  if (fsType & 0x0004) return "preview & print";
  if (fsType & 0x0002) return "restricted";
  return "installable";
}

/** OS/2 sFamilyClass (high byte) and PANOSE proportion 9 (monospaced). */
function categoryOf(familyClass: number, proportion: number): FontCategory {
  if (proportion === 9) return "monospace";
  const cls = familyClass >> 8;
  if ((cls >= 1 && cls <= 5) || cls === 7) return "serif";
  if (cls === 8) return "sans";
  if (cls === 10) return "script";
  return "other";
}

/** Font files are untrusted: every table and string must lie inside the file. */
class Malformed extends Error {}

function checkRange(dv: DataView, at: number, length: number): void {
  if (at < 0 || length < 0 || at + length > dv.byteLength) throw new Malformed(`range ${at}+${length} outside ${dv.byteLength}`);
}

const tag = (dv: DataView, at: number) =>
  String.fromCharCode(dv.getUint8(at), dv.getUint8(at + 1), dv.getUint8(at + 2), dv.getUint8(at + 3));

function tables(dv: DataView, offset: number): Map<string, { offset: number; length: number }> {
  checkRange(dv, offset, 12);
  const count = dv.getUint16(offset + 4);
  checkRange(dv, offset + 12, count * 16);
  const out = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < count; i++) {
    const rec = offset + 12 + i * 16;
    const table = { offset: dv.getUint32(rec + 8), length: dv.getUint32(rec + 12) };
    checkRange(dv, table.offset, table.length);
    out.set(tag(dv, rec), table);
  }
  return out;
}

const utf16be = new TextDecoder("utf-16be");
const latin1 = new TextDecoder("latin1");

/** nameID → string, preferring Windows English (US), then any Windows, then Mac Roman. */
function names(dv: DataView, table: { offset: number; length: number }): Map<number, string> {
  const at = table.offset;
  const end = at + table.length;
  const bytesOf = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  checkRange(dv, at, 6);
  const count = dv.getUint16(at + 2);
  const strings = at + dv.getUint16(at + 4);
  if (at + 6 + count * 12 > end) throw new Malformed("name records outside the name table");
  const best = new Map<number, { rank: number; value: string }>();
  for (let i = 0; i < count; i++) {
    const r = at + 6 + i * 12;
    const platform = dv.getUint16(r);
    const encoding = dv.getUint16(r + 2);
    const language = dv.getUint16(r + 4);
    const id = dv.getUint16(r + 6);
    const start = strings + dv.getUint16(r + 10);
    const length = dv.getUint16(r + 8);
    if (start + length > end) throw new Malformed("name string outside the name table");
    const bytes = bytesOf.subarray(start, start + length);
    let rank: number;
    let value: string;
    if (platform === 3 && (encoding === 1 || encoding === 10)) {
      rank = language === 0x409 ? 0 : 1;
      value = utf16be.decode(bytes);
    } else if (platform === 1 && encoding === 0) {
      rank = 2;
      value = latin1.decode(bytes);
    } else continue;
    const prev = best.get(id);
    if (!prev || rank < prev.rank) best.set(id, { rank, value });
  }
  return new Map([...best].map(([id, { value }]) => [id, value]));
}

function readFont(dv: DataView, offset: number, index: number): FontFace[] {
  const t = tables(dv, offset);
  const nameTable = t.get("name");
  if (!nameTable) return [];
  const n = names(dv, nameTable);
  const os2 = t.get("OS/2");
  if (os2 && os2.length < 64) throw new Malformed("OS/2 table too short");
  const weight = os2 ? dv.getUint16(os2.offset + 4) : 400;
  const width = os2 ? dv.getUint16(os2.offset + 6) : 5;
  const selection = os2 ? dv.getUint16(os2.offset + 62) : 0;
  const fsType = os2 ? dv.getUint16(os2.offset + 8) : 0;
  const category = categoryOf(os2 ? dv.getInt16(os2.offset + 30) : 0, os2 ? dv.getUint8(os2.offset + 35) : 0);
  const legacyFamily = n.get(1) ?? "";
  const family = n.get(21) ?? n.get(16) ?? legacyFamily;
  const base: FontFace = {
    family,
    face: n.get(22) ?? n.get(17) ?? n.get(2) ?? "Regular",
    legacyFamily,
    fullName: n.get(4) ?? "",
    postscriptName: n.get(6) ?? "",
    weight,
    width,
    italic: (selection & 0x201) !== 0, // ITALIC or OBLIQUE
    index,
    ...(n.get(13) ? { licenseText: n.get(13) } : {}),
    ...(n.get(14) ? { licenseUrl: n.get(14) } : {}),
    embedding: embeddingOf(fsType),
    category,
  };

  const fvar = t.get("fvar");
  if (!fvar) return [base];
  const f = fvar.offset;
  checkRange(dv, f, 16);
  const axesAt = f + dv.getUint16(f + 4);
  const axisCount = dv.getUint16(f + 8);
  const axisSize = dv.getUint16(f + 10);
  const instanceCount = dv.getUint16(f + 12);
  const instanceSize = dv.getUint16(f + 14);
  const instancesAt = axesAt + axisCount * axisSize;
  if (axisSize < 20 || instanceSize < 4 + axisCount * 4 || instancesAt + instanceCount * instanceSize > f + fvar.length) {
    throw new Malformed("fvar records outside the fvar table");
  }
  const axes = Array.from({ length: axisCount }, (_, i) => tag(dv, axesAt + i * axisSize));
  return Array.from({ length: instanceCount }, (_, i) => {
    const at = instancesAt + i * instanceSize;
    const variation = Object.fromEntries(axes.map((a, k) => [a, dv.getInt32(at + 4 + k * 4) / 65536]));
    const face = n.get(dv.getUint16(at)) ?? base.face;
    return {
      ...base,
      face,
      fullName: `${family} ${face}`,
      weight: variation.wght ?? weight,
      width: variation.wdth !== undefined ? widthClass(variation.wdth) : width,
      italic: base.italic || (variation.ital ?? 0) >= 1 || (variation.slnt ?? 0) !== 0,
      variation,
    };
  });
}

/** OpenType wdth percentage → usWidthClass. */
function widthClass(percent: number): number {
  const classes = [50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200];
  let best = 0;
  for (let i = 1; i < classes.length; i++) if (Math.abs(classes[i] - percent) < Math.abs(classes[best] - percent)) best = i;
  return best + 1;
}

/** Faces in a .ttf/.otf file or every font of a .ttc collection; none for a malformed file. */
export function readFaces(buf: Uint8Array): FontFace[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  try {
    checkRange(dv, 0, 12);
    if (tag(dv, 0) === "ttcf") {
      const count = dv.getUint32(8);
      checkRange(dv, 12, count * 4);
      return Array.from({ length: count }, (_, i) => readFont(dv, dv.getUint32(12 + i * 4), i)).flat();
    }
    return readFont(dv, 0, 0);
  } catch (e) {
    if (e instanceof Malformed || e instanceof RangeError) return [];
    throw e;
  }
}
