/**
 * The slices of .NET formatting InfoPanel's text items depend on:
 * `string.Format("{0:0.00}", double)`, `double.ToString("N2", Invariant)`,
 * `double.TryParse(s, NumberStyles.Any, Invariant)` and `DateTime.ToString(format)`.
 *
 * InfoPanel formats with the machine's current culture. The user's renders
 * are en-US (`October`, `PM`, `/` dates), so that is the culture provided;
 * `Culture` is the seam for others.
 */

export interface Culture {
  decimal: string;
  group: string;
  dateSeparator: string;
  timeSeparator: string;
  am: string;
  pm: string;
  days: readonly string[];
  daysShort: readonly string[];
  months: readonly string[];
  monthsShort: readonly string[];
  /** Patterns for the single-character standard formats. */
  standard: Readonly<Record<string, string>>;
  infinity: string;
  nan: string;
}

export const EN_US: Culture = {
  decimal: ".",
  group: ",",
  dateSeparator: "/",
  timeSeparator: ":",
  am: "AM",
  pm: "PM",
  days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  months: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  standard: {
    d: "M/d/yyyy",
    D: "dddd, MMMM d, yyyy",
    t: "h:mm tt",
    T: "h:mm:ss tt",
    f: "dddd, MMMM d, yyyy h:mm tt",
    F: "dddd, MMMM d, yyyy h:mm:ss tt",
    g: "M/d/yyyy h:mm tt",
    G: "M/d/yyyy h:mm:ss tt",
    M: "MMMM d",
    m: "MMMM d",
    Y: "MMMM yyyy",
    y: "MMMM yyyy",
    s: "yyyy'-'MM'-'dd'T'HH':'mm':'ss",
  },
  infinity: "∞",
  nan: "NaN",
};

export const INVARIANT_NUMBERS = { decimal: ".", group: ",", infinity: "Infinity", nan: "NaN" } as const;

/** .NET formats doubles for custom patterns from 15 significant digits. */
const DOUBLE_DIGITS = 15;

/**
 * `x` with exactly `decimals` fraction digits, as the custom pattern
 * `0.000` (or `0` for 0 decimals) formats it: 15 significant digits, then
 * midpoint rounding away from zero. A negative value that rounds to zero
 * keeps its sign (`-0`), as in .NET Core 3.0+.
 */
export function formatFixed(
  x: number,
  decimals: number,
  culture: Pick<Culture, "decimal" | "infinity" | "nan"> = EN_US,
): string {
  if (Number.isNaN(x)) return culture.nan;
  if (!Number.isFinite(x)) return (x < 0 ? "-" : "") + culture.infinity;
  const negative = x < 0 || Object.is(x, -0);

  // digits d1..d15 with value 0.d1d2... × 10^(exp+1)
  const [mantissa, e] = Math.abs(x).toExponential(DOUBLE_DIGITS - 1).split("e");
  let digits = mantissa.replace(".", "").split("").map(Number);
  let exp = Number(e);
  const keep = exp + 1 + decimals; // digits left of the cut
  if (keep < 0) {
    digits = [];
  } else if (keep < digits.length) {
    const roundUp = digits[keep] >= 5;
    digits = digits.slice(0, keep);
    if (roundUp) {
      let i = digits.length - 1;
      while (i >= 0 && digits[i] === 9) digits[i--] = 0;
      if (i >= 0) digits[i]++;
      else {
        digits.unshift(1);
        exp++;
      }
    }
  }

  // Place the digits around the decimal point.
  const intLen = exp + 1;
  const at = (i: number) => (i >= 0 && i < digits.length ? digits[i] : 0);
  let int = "";
  for (let i = 0; i < intLen; i++) int += at(i);
  int = int.replace(/^0+/, "") || "0";
  let frac = "";
  for (let i = 0; i < decimals; i++) frac += at(intLen + i);
  return (negative ? "-" : "") + int + (decimals > 0 ? culture.decimal + frac : "");
}

/** The exact value of a finite double as mantissa × 2^exponent. */
function decompose(x: number): { mantissa: bigint; exponent: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  return biased === 0
    ? { mantissa: fraction, exponent: -1074 }
    : { mantissa: fraction | (1n << 52n), exponent: biased - 1075 };
}

/**
 * `x.ToString("N" + decimals, CultureInfo.InvariantCulture)`. Unlike the
 * custom patterns, the standard format rounds the exact binary value, half
 * to even (2.675 → "2.67", 0.25 → "0.2"), and prints every integer digit.
 */
export function formatN(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return formatFixed(x, decimals, INVARIANT_NUMBERS);
  const negative = x < 0 || Object.is(x, -0);
  const { mantissa, exponent } = decompose(x);
  const scale = 10n ** BigInt(decimals);
  let scaled: bigint; // round(|x| × 10^decimals), half to even
  if (exponent >= 0) {
    scaled = (mantissa << BigInt(exponent)) * scale;
  } else {
    const num = mantissa * scale;
    const den = 1n << BigInt(-exponent);
    scaled = num / den;
    const twice = 2n * (num % den);
    if (twice > den || (twice === den && scaled % 2n === 1n)) scaled++;
  }
  const digits = scaled.toString().padStart(decimals + 1, "0");
  const int = digits.slice(0, digits.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = digits.slice(digits.length - decimals);
  return (negative ? "-" : "") + int + (decimals > 0 ? "." + frac : "");
}

// NumberStyles.Any, invariant: whitespace, a sign before or after the number
// (no space between sign and digits) or parentheses, the currency symbol,
// "," groups, "." decimals and an exponent.
const ANY_NUMBER =
  /^\s*(?<lead>[+-]|\(\s*)?(?:¤\s*)?(?<int>[\d,]*)(?:\.(?<frac>\d*))?(?:[eE](?<exp>[+-]?\d+))?\s*¤?(?<trail>[+-]|\s*\))?\s*$/;
const SYMBOLS: Readonly<Record<string, number>> = {
  infinity: Infinity,
  "+infinity": Infinity,
  "-infinity": -Infinity,
  nan: NaN,
};

/** `double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out v)`; null when it fails. */
export function parseAnyInvariant(s: string): number | null {
  const symbol = SYMBOLS[s.trim().toLowerCase()];
  if (symbol !== undefined) return symbol;
  const m = ANY_NUMBER.exec(s);
  if (!m?.groups) return null;
  const { lead, int, frac, exp, trail } = m.groups;
  const digits = (int ?? "").replaceAll(",", "");
  if (digits === "" && !frac) return null;
  const parens = lead?.startsWith("(") ?? false;
  if (parens !== (trail?.endsWith(")") ?? false)) return null;
  if (lead && trail && !parens) return null;
  const negative = lead === "-" || trail === "-" || parens;
  const v = Number(`${digits || "0"}.${frac ?? ""}e${exp ?? 0}`);
  return negative ? -v : v;
}

export class FormatError extends Error {}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** `DateTime.ToString(format)` for a local time. Throws FormatError where .NET throws FormatException. */
export function formatDate(date: Date, format: string, culture: Culture = EN_US): string {
  if (format.length === 0) return formatDate(date, "G", culture);
  if (format.length === 1) {
    const pattern = culture.standard[format];
    if (pattern === undefined) throw new FormatError(`Unsupported standard date format "${format}"`);
    return formatDate(date, pattern, culture);
  }

  let out = "";
  let i = 0;
  const run = (ch: string) => {
    let n = 1;
    while (format[i + n] === ch) n++;
    return n;
  };
  while (i < format.length) {
    const ch = format[i];
    let n = 1;
    switch (ch) {
      case "d":
        n = run(ch);
        out +=
          n === 1 ? date.getDate()
          : n === 2 ? pad(date.getDate(), 2)
          : n === 3 ? culture.daysShort[date.getDay()]
          : culture.days[date.getDay()];
        break;
      case "M":
        n = run(ch);
        out +=
          n === 1 ? date.getMonth() + 1
          : n === 2 ? pad(date.getMonth() + 1, 2)
          : n === 3 ? culture.monthsShort[date.getMonth()]
          : culture.months[date.getMonth()];
        break;
      case "y": {
        n = run(ch);
        const y = date.getFullYear();
        out += n === 1 ? y % 100 : n === 2 ? pad(y % 100, 2) : pad(y, n);
        break;
      }
      case "h":
        n = run(ch);
        out += pad(date.getHours() % 12 || 12, Math.min(n, 2));
        break;
      case "H":
        n = run(ch);
        out += pad(date.getHours(), Math.min(n, 2));
        break;
      case "m":
        n = run(ch);
        out += pad(date.getMinutes(), Math.min(n, 2));
        break;
      case "s":
        n = run(ch);
        out += pad(date.getSeconds(), Math.min(n, 2));
        break;
      case "f":
      case "F": {
        n = run(ch);
        if (n > 7) throw new FormatError(`Too many "${ch}" in "${format}"`);
        // JS dates carry milliseconds only; .NET's 4th to 7th digits are 0 for them.
        let fraction = pad(date.getMilliseconds(), 3).padEnd(7, "0").slice(0, n);
        if (ch === "F") fraction = fraction.replace(/0+$/, "");
        out += fraction;
        break;
      }
      case "t": {
        n = run(ch);
        const designator = date.getHours() < 12 ? culture.am : culture.pm;
        out += n === 1 ? designator.slice(0, 1) : designator;
        break;
      }
      case "z": {
        n = run(ch);
        const offset = -date.getTimezoneOffset();
        const sign = offset < 0 ? "-" : "+";
        const a = Math.abs(offset);
        out +=
          sign +
          (n === 1 ? Math.floor(a / 60)
          : n === 2 ? pad(Math.floor(a / 60), 2)
          : `${pad(Math.floor(a / 60), 2)}${culture.timeSeparator}${pad(a % 60, 2)}`);
        break;
      }
      case "g":
        n = run(ch);
        out += "A.D.";
        break;
      case ":":
        out += culture.timeSeparator;
        break;
      case "/":
        out += culture.dateSeparator;
        break;
      case "'":
      case '"': {
        const end = format.indexOf(ch, i + 1);
        if (end < 0) throw new FormatError(`Unterminated quote in "${format}"`);
        out += format.slice(i + 1, end).replace(/\\(.)/g, "$1");
        n = end - i + 1;
        break;
      }
      case "\\":
        if (i + 1 >= format.length) throw new FormatError(`Trailing "\\" in "${format}"`);
        out += format[i + 1];
        n = 2;
        break;
      case "%":
        // "%x" formats the single specifier x as a custom one.
        if (i + 1 >= format.length || format[i + 1] === "%") throw new FormatError(`Bad "%" in "${format}"`);
        // A two-character format is never a standard one; the NUL is a literal, dropped again.
        out += formatDate(date, format[i + 1] + "\u0000", culture).slice(0, -1);
        n = 2;
        break;
      case "K":
        // A local DateTime: the offset, as zzz.
        out += formatDate(date, "zzz\u0000", culture).slice(0, -1);
        break;
      default:
        out += ch;
    }
    i += n;
  }
  return out;
}
