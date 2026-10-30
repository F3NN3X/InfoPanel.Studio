// What server/assets.mjs knows about media without touching a file: the accepted types and their limits, sniffing a
// type from a file's first bytes, the declared Content-Type, asset ids, the hashes a text refers to, Range headers and
// the upload quota.

use crate::js;

pub struct AssetType {
    pub ext: &'static str,
    pub mime: &'static str,
    pub kind: &'static str,
    /// The upload limit when it is not the kind's.
    pub limit: Option<u64>,
}

const fn kind_type(ext: &'static str, mime: &'static str, kind: &'static str) -> AssetType {
    AssetType {
        ext,
        mime,
        kind,
        limit: None,
    }
}

/// The largest SVG accepted (SVG templates and icons).
pub const SVG_LIMIT: u64 = 256 * 1024;
/// How many leading bytes the sniffer looks at (an SVG's prologue and comments can be long).
pub const HEAD_BYTES: usize = 1024;
/// Served with every SVG: no script, no outside requests, inline styles and data: images only.
pub const SVG_CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
/// Uploads running at once, before the next one gets 429.
pub const MAX_IN_FLIGHT: usize = 2;
/// Default cap on the total size of the stored media.
pub const DEFAULT_MAX_BYTES: f64 = 2.0 * 1024.0 * 1024.0 * 1024.0;

/// Extension -> MIME type and kind of every accepted type.
pub const TYPES: [AssetType; 15] = [
    kind_type("png", "image/png", "image"),
    kind_type("jpg", "image/jpeg", "image"),
    kind_type("gif", "image/gif", "image"),
    kind_type("webp", "image/webp", "image"),
    kind_type("avif", "image/avif", "image"),
    kind_type("bmp", "image/bmp", "image"),
    kind_type("ico", "image/x-icon", "image"),
    AssetType {
        ext: "svg",
        mime: "image/svg+xml",
        kind: "image",
        limit: Some(SVG_LIMIT),
    },
    kind_type("mp4", "video/mp4", "video"),
    kind_type("webm", "video/webm", "video"),
    kind_type("ttf", "font/ttf", "font"),
    kind_type("otf", "font/otf", "font"),
    kind_type("ttc", "font/collection", "font"),
    kind_type("woff", "font/woff", "font"),
    kind_type("woff2", "font/woff2", "font"),
];

/// The upload limit of a type: its own, else its kind's.
pub fn limit_of(t: &AssetType) -> u64 {
    t.limit.unwrap_or(match t.kind {
        "video" => 300 * 1024 * 1024,
        "font" => 30 * 1024 * 1024,
        _ => 25 * 1024 * 1024,
    })
}

pub fn by_ext(ext: &str) -> Option<&'static AssetType> {
    TYPES.iter().find(|t| t.ext == ext)
}

/// `ID_RE`: 64 lowercase hex digits, a dot and an accepted extension.
pub fn is_asset_id(id: &str) -> bool {
    id.len() > 65
        && id.as_bytes()[64] == b'.'
        && id.as_bytes()[..64]
            .iter()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
        && by_ext(&id[65..]).is_some()
}

/// The hash part of an asset id.
pub fn hash_of(id: &str) -> &str {
    &id[..64.min(id.len())]
}

/// `buf.subarray(start, end)`.
fn bytes(buf: &[u8], start: usize, end: usize) -> &[u8] {
    &buf[start.min(buf.len())..end.min(buf.len())]
}

const AVIF_BRANDS: [&[u8]; 2] = [b"avif", b"avis"];
const MP4_BRANDS: [&[u8]; 12] = [
    b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"dash", b"M4V ",
    b"mmp4", b"MSNV",
];

/// ISO-BMFF brands (the `ftyp` box) of MP4 video and of AVIF.
fn sniff_ftyp(buf: &[u8]) -> Option<&'static str> {
    if buf.len() < 16 || bytes(buf, 4, 8) != b"ftyp" {
        return None;
    }
    let box_end = (u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize).min(buf.len());
    let major = bytes(buf, 8, 12);
    let mut compatible = (16..)
        .step_by(4)
        .take_while(|i| i + 4 <= box_end)
        .map(|i| &buf[i..i + 4]);
    // AVIF files often carry a generic major brand (mif1) and list avif later.
    if AVIF_BRANDS.contains(&major) || compatible.any(|b| AVIF_BRANDS.contains(&b)) {
        return Some("avif");
    }
    // HEIC, QuickTime and audio-only brands stay out.
    MP4_BRANDS.contains(&major).then_some("mp4")
}

/// Where a prologue item (`<?..?>`, a comment, a doctype) starting at `i` ends, or `None`.
fn prologue_end(c: &[char], i: usize) -> Option<usize> {
    let at = |j: usize, s: &str| {
        s.chars()
            .enumerate()
            .all(|(k, ch)| c.get(j + k) == Some(&ch))
    };
    let find = |from: usize, s: &str| (from..c.len()).find(|&j| at(j, s));
    if at(i, "<?") {
        return find(i + 2, "?>").map(|j| j + 2);
    }
    if at(i, "<!--") {
        return find(i + 4, "-->").map(|j| j + 3);
    }
    let doctype = c.len() > i + 9
        && c[i..i + 2] == ['<', '!']
        && c[i + 2..i + 9]
            .iter()
            .zip("doctype".chars())
            .all(|(a, b)| a.eq_ignore_ascii_case(&b));
    if !doctype || !js::is_js_space(c[i + 9]) {
        return None;
    }
    // `<!DOCTYPE\s[^<>]*(?:\[[\s\S]*?\])?\s*>`, as a regex backtracks it: the longest `[^<>]*` first.
    let after = i + 10;
    let run_end = (after..c.len())
        .find(|&j| matches!(c[j], '<' | '>'))
        .unwrap_or(c.len());
    let close = |from: usize| {
        let m = (from..c.len())
            .find(|&j| !js::is_js_space(c[j]))
            .unwrap_or(c.len());
        (c.get(m) == Some(&'>')).then_some(m + 1)
    };
    for k in (after..=run_end).rev() {
        if c.get(k) == Some(&'[') {
            if let Some(end) = (k + 1..c.len())
                .filter(|&j| c[j] == ']')
                .find_map(|j| close(j + 1))
            {
                return Some(end);
            }
        }
        if let Some(end) = close(k) {
            return Some(end);
        }
    }
    None
}

/// Whether text starts with an <svg> element: an optional BOM, XML declaration, processing instructions, comments and a
/// doctype may come first, nothing else. Unfinished prologue (cut by the sniff window) is not SVG.
pub fn is_svg_text(text: &str) -> bool {
    let c: Vec<char> = text.chars().collect();
    let mut i = usize::from(c.first() == Some(&'\u{feff}'));
    loop {
        while c.get(i).is_some_and(|&ch| js::is_js_space(ch)) {
            i += 1;
        }
        match prologue_end(&c, i) {
            Some(end) => i = end,
            None => break,
        }
    }
    c.len() >= i + 5
        && c[i..i + 4] == ['<', 's', 'v', 'g']
        && (js::is_js_space(c[i + 4]) || matches!(c[i + 4], '>' | '/'))
}

/// The type of a file from its first bytes (`HEAD_BYTES` is plenty), or `None` when it is not an accepted type.
pub fn sniff_type(buf: &[u8]) -> Option<&'static AssetType> {
    let le32 = |at: usize| u32::from_le_bytes([buf[at], buf[at + 1], buf[at + 2], buf[at + 3]]);
    let ext = if buf.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        "png"
    } else if buf.starts_with(&[0xff, 0xd8, 0xff]) {
        "jpg"
    } else if matches!(bytes(buf, 0, 6), b"GIF87a" | b"GIF89a") {
        "gif"
    } else if bytes(buf, 0, 4) == b"RIFF" && bytes(buf, 8, 12) == b"WEBP" {
        "webp"
    // BITMAPFILEHEADER followed by a header size of a known BITMAPINFOHEADER kind.
    } else if bytes(buf, 0, 2) == b"BM"
        && buf.len() >= 18
        && [12, 40, 52, 56, 64, 108, 124].contains(&le32(14))
    {
        "bmp"
    // ICONDIR: reserved 0, type 1 (icon), at least one image.
    } else if buf.starts_with(&[0, 0, 1, 0])
        && buf.len() >= 6
        && u16::from_le_bytes([buf[4], buf[5]]) > 0
    {
        "ico"
    // Matroska EBML header: stored as webm, which browsers play either way.
    } else if buf.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        "webm"
    } else if buf.starts_with(&[0, 1, 0, 0]) || bytes(buf, 0, 4) == b"true" {
        "ttf"
    } else if bytes(buf, 0, 4) == b"OTTO" {
        "otf"
    } else if bytes(buf, 0, 4) == b"ttcf" {
        "ttc"
    } else if bytes(buf, 0, 4) == b"wOFF" {
        "woff"
    } else if bytes(buf, 0, 4) == b"wOF2" {
        "woff2"
    } else if is_svg_text(&String::from_utf8_lossy(buf)) {
        "svg"
    } else {
        sniff_ftyp(buf)?
    };
    by_ext(ext)
}

// Other names browsers give accepted types (Matroska is stored as webm).
const MIME_ALIASES: [(&str, &str); 9] = [
    ("video/x-matroska", "webm"),
    ("video/matroska", "webm"),
    ("image/x-ms-bmp", "bmp"),
    ("image/vnd.microsoft.icon", "ico"),
    ("font/sfnt", "ttf"),
    ("application/x-font-ttf", "ttf"),
    ("application/x-font-otf", "otf"),
    ("application/vnd.ms-opentype", "otf"),
    ("application/font-woff", "woff"),
];

/// The accepted type a Content-Type header declares, or `None`.
pub fn declared_type(header: Option<&str>) -> Option<&'static AssetType> {
    let mime = js::trim(header.unwrap_or("").split(';').next().unwrap_or("")).to_lowercase();
    let ext = MIME_ALIASES
        .iter()
        .find(|(m, _)| *m == mime)
        .map(|(_, e)| *e)
        .or_else(|| TYPES.iter().find(|t| t.mime == mime).map(|t| t.ext))?;
    by_ext(ext)
}

/// The content hashes a text (the saved config, the library) refers to: in an asset URL, an asset id, or bare. Any run
/// of exactly 64 lowercase hex digits counts, so a file is kept rather than lost. Each once, in order of appearance.
pub fn referenced_hashes(text: &str) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    let is_hex = |b: &u8| matches!(b, b'0'..=b'9' | b'a'..=b'f');
    let b = text.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if !is_hex(&b[i]) {
            i += 1;
            continue;
        }
        let end = b[i..]
            .iter()
            .position(|x| !is_hex(x))
            .map_or(b.len(), |n| i + n);
        if end - i == 64 && !found.iter().any(|h| h.as_bytes() == &b[i..end]) {
            found.push(text[i..end].to_string());
        }
        i = end;
    }
    found
}

/// What a `Range` header asks of a file.
#[derive(Debug, PartialEq)]
pub enum Range {
    /// Serve the whole file (no header, malformed, or several ranges).
    Whole,
    Unsatisfiable,
    /// Inclusive byte positions.
    Span(u64, u64),
}

/// `Number(digits)` for an ASCII digit string (empty is 0).
fn digits(s: &str) -> f64 {
    js::string_to_number(s)
}

/// A `Range: bytes=…` header against a file of `size` bytes.
pub fn parse_range(header: Option<&str>, size: u64) -> Range {
    let h = js::trim(header.unwrap_or(""));
    let Some((first, last)) = h.strip_prefix("bytes=").and_then(|r| r.split_once('-')) else {
        return Range::Whole;
    };
    let all_digits = |s: &str| s.bytes().all(|b| b.is_ascii_digit());
    if !all_digits(first) || !all_digits(last) || (first.is_empty() && last.is_empty()) {
        return Range::Whole;
    }
    let size_f = size as f64;
    if first.is_empty() {
        // Suffix range: the last N bytes.
        let n = digits(last);
        if n == 0.0 || size == 0 {
            return Range::Unsatisfiable;
        }
        return Range::Span((size_f - n).max(0.0) as u64, size - 1);
    }
    let start = digits(first);
    let end = if last.is_empty() {
        size_f - 1.0
    } else {
        digits(last).min(size_f - 1.0)
    };
    if !last.is_empty() && digits(last) < start {
        return Range::Whole;
    }
    if start >= size_f {
        return Range::Unsatisfiable;
    }
    Range::Span(start as u64, end as u64)
}

/// The refusal `(status, message)` for a new upload: 429 when `max_in_flight` uploads are already running, 507 when
/// `used + incoming` would pass `max_bytes`.
pub fn upload_quota_refusal(
    in_flight: usize,
    max_in_flight: usize,
    used: f64,
    incoming: f64,
    max_bytes: f64,
) -> Option<(u16, &'static str)> {
    if in_flight >= max_in_flight {
        return Some((429, "too many uploads in progress"));
    }
    (used + incoming > max_bytes).then_some((507, "media storage is full"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ext(buf: &[u8]) -> Option<&'static str> {
        sniff_type(buf).map(|t| t.ext)
    }

    fn ftyp(major: &[u8], compatible: &[&[u8]]) -> Vec<u8> {
        let mut v = ((16 + 4 * compatible.len()) as u32).to_be_bytes().to_vec();
        v.extend(b"ftyp");
        v.extend(major);
        v.extend([0; 4]);
        compatible.iter().for_each(|c| v.extend(*c));
        v.extend([0, 0, 0, 8]);
        v.extend(b"free");
        v
    }

    #[test]
    fn sniffs_by_magic_bytes() {
        assert_eq!(
            ext(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
            Some("png")
        );
        assert_eq!(ext(b"GIF89a.."), Some("gif"));
        assert_eq!(ext(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        assert_eq!(ext(&[0x1a, 0x45, 0xdf, 0xa3]), Some("webm"));
        assert_eq!(ext(b"<html><svg>"), None);
        assert_eq!(ext(b""), None);
        assert_eq!(ext(&ftyp(b"mif1", &[b"avif"])), Some("avif"));
        assert_eq!(ext(&ftyp(b"isom", &[b"mp42"])), Some("mp4"));
        assert_eq!(ext(&ftyp(b"heic", &[b"isom"])), None);
        assert_eq!(ext(&ftyp(b"qt  ", &[])), None);
    }

    #[test]
    fn reads_svg_after_its_prologue_only() {
        assert!(is_svg_text("\u{feff}<?xml version=\"1.0\"?>\n<!-- c --><!DOCTYPE svg [ <!ENTITY a \"b\"> ]>\n<svg xmlns=\"x\"/>"));
        assert!(is_svg_text("<svg>"));
        assert!(is_svg_text("<svg/>"));
        assert!(!is_svg_text("<svgx>"));
        assert!(!is_svg_text("<SVG>"));
        assert!(!is_svg_text("<!-- never closed <svg>"));
        assert!(!is_svg_text("<html><svg>"));
        assert!(!is_svg_text("<!DOCTYPEsvg><svg>"));
    }

    #[test]
    fn declares_types_by_content_type() {
        assert_eq!(
            declared_type(Some("Image/PNG; x=y")).map(|t| t.ext),
            Some("png")
        );
        assert_eq!(
            declared_type(Some(" video/x-matroska ")).map(|t| t.ext),
            Some("webm")
        );
        assert_eq!(
            declared_type(Some("application/font-woff")).map(|t| t.ext),
            Some("woff")
        );
        assert!(declared_type(Some("image/jpg")).is_none());
        assert!(declared_type(None).is_none());
    }

    #[test]
    fn finds_hashes_of_exactly_sixty_four_digits() {
        let h = "a".repeat(64);
        let text = format!(
            "/api/assets/{h}.png {h} {}b {}",
            "c".repeat(64),
            "d".repeat(64)
        );
        assert_eq!(referenced_hashes(&text), vec![h, "d".repeat(64)]);
        assert!(is_asset_id(&format!("{}.woff2", "0".repeat(64))));
        assert!(!is_asset_id(&format!("{}.exe", "0".repeat(64))));
        assert!(!is_asset_id(&format!("{}.png", "A".repeat(64))));
    }

    #[test]
    fn parses_ranges() {
        assert_eq!(parse_range(Some("bytes=0-9"), 100), Range::Span(0, 9));
        assert_eq!(parse_range(Some("bytes=90-"), 100), Range::Span(90, 99));
        assert_eq!(parse_range(Some("bytes=-10"), 100), Range::Span(90, 99));
        assert_eq!(parse_range(Some("bytes=-500"), 100), Range::Span(0, 99));
        assert_eq!(parse_range(Some("bytes=5-500"), 100), Range::Span(5, 99));
        assert_eq!(parse_range(Some("bytes=100-"), 100), Range::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=-0"), 100), Range::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=-5"), 0), Range::Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=9-3"), 100), Range::Whole);
        assert_eq!(parse_range(Some("bytes=0-1,5-6"), 100), Range::Whole);
        assert_eq!(parse_range(Some("bytes=-"), 100), Range::Whole);
        assert_eq!(parse_range(None, 100), Range::Whole);
    }

    #[test]
    fn refuses_uploads_over_the_quota() {
        assert_eq!(
            upload_quota_refusal(2, 2, 0.0, 1.0, 10.0).map(|r| r.0),
            Some(429)
        );
        assert_eq!(
            upload_quota_refusal(0, 2, 6.0, 5.0, 10.0).map(|r| r.0),
            Some(507)
        );
        assert!(upload_quota_refusal(1, 2, 5.0, 5.0, 10.0).is_none());
    }
}
