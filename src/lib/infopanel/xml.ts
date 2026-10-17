/**
 * Minimal XML reader for .NET XmlSerializer output.
 *
 * Covers what XmlSerializer writes: a declaration, elements with attributes,
 * self-closing tags, text with the five named entities and numeric character
 * references, plus comments and CDATA for hand-edited files. DTDs are rejected,
 * so no entity expansion. Dependency-free so the same code runs in the browser,
 * in Vitest under Node and in a server.
 */

export interface XmlElement {
  /** Qualified name as written, e.g. `DisplayItem` or `xsi:type`. */
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Concatenated character data directly inside this element. */
  text: string;
}

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(s: string, at: number): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);|&/g, (m, ref: string | undefined) => {
    if (!ref) throw new XmlError("Bare '&' in text", at);
    if (ref[0] === "#") {
      const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return String.fromCodePoint(code);
    }
    const named = NAMED[ref];
    if (named === undefined) throw new XmlError(`Unknown entity ${m}`, at);
    return named;
  });
}

export class XmlError extends Error {
  // A plain field, not a parameter property: Node's type stripping (scripts/) rejects those.
  readonly offset: number;

  constructor(message: string, offset: number) {
    super(message);
    this.offset = offset;
  }
}

const NAME = /[^\s/>=]+/y;
const ATTR = /\s*([^\s/>=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

/** Parses a document and returns its root element; a failure reports its 1-based line and column. */
export function parseXml(source: string): XmlElement {
  const s = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  try {
    return parseDocument(s);
  } catch (e) {
    if (!(e instanceof XmlError)) throw e;
    const before = s.slice(0, e.offset);
    const line = before.split("\n").length;
    const column = e.offset - (before.lastIndexOf("\n") + 1) + 1;
    throw new XmlError(`${e.message} (line ${line}, column ${column})`, e.offset);
  }
}

function parseDocument(s: string): XmlElement {
  let i = 0;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;

  const skip = (open: string, close: string): void => {
    const end = s.indexOf(close, i + open.length);
    if (end < 0) throw new XmlError(`Unterminated ${open}`, i);
    i = end + close.length;
  };

  while (i < s.length) {
    const lt = s.indexOf("<", i);
    const textEnd = lt < 0 ? s.length : lt;
    if (textEnd > i) {
      const raw = s.slice(i, textEnd);
      const top = stack[stack.length - 1];
      if (top) top.text += decodeEntities(raw, i);
      else if (raw.trim()) throw new XmlError("Text outside the root element", i);
      i = textEnd;
    }
    if (lt < 0) break;

    if (s.startsWith("<?", i)) skip("<?", "?>");
    else if (s.startsWith("<!--", i)) skip("<!--", "-->");
    else if (s.startsWith("<![CDATA[", i)) {
      const end = s.indexOf("]]>", i);
      if (end < 0) throw new XmlError("Unterminated CDATA", i);
      const top = stack[stack.length - 1];
      if (!top) throw new XmlError("CDATA outside the root element", i);
      top.text += s.slice(i + 9, end);
      i = end + 3;
    } else if (s.startsWith("<!", i)) throw new XmlError("DTDs are not supported", i);
    else if (s[i + 1] === "/") {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(s);
      const top = stack.pop();
      if (!m || !top || m[0] !== top.name) throw new XmlError(`Mismatched closing tag </${m?.[0] ?? ""}>`, i);
      const gt = s.indexOf(">", NAME.lastIndex);
      if (gt < 0 || s.slice(NAME.lastIndex, gt).trim()) throw new XmlError("Malformed closing tag", i);
      i = gt + 1;
    } else {
      const start = i;
      NAME.lastIndex = i + 1;
      const m = NAME.exec(s);
      if (!m) throw new XmlError("Malformed tag", i);
      const el: XmlElement = { name: m[0], attrs: {}, children: [], text: "" };
      let p = NAME.lastIndex;
      for (;;) {
        ATTR.lastIndex = p;
        const a = ATTR.exec(s);
        if (!a) break;
        el.attrs[a[1]] = decodeEntities(a[2] ?? a[3], p);
        p = ATTR.lastIndex;
      }
      while (/\s/.test(s[p] ?? "")) p++;
      const selfClosing = s.startsWith("/>", p);
      if (!selfClosing && s[p] !== ">") throw new XmlError(`Malformed tag <${el.name}>`, start);
      i = p + (selfClosing ? 2 : 1);

      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      else if (root) throw new XmlError("More than one root element", start);
      else root = el;
      if (!selfClosing) stack.push(el);
    }
  }

  if (stack.length) throw new XmlError(`Unclosed element <${stack[stack.length - 1].name}>`, s.length);
  if (!root) throw new XmlError("No root element", 0);
  return root;
}

/** First direct child with this name. */
export function child(el: XmlElement, name: string): XmlElement | undefined {
  return el.children.find((c) => c.name === name);
}
