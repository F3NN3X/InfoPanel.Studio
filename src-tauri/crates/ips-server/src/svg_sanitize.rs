// SVG sanitising at upload (pinned layer P5, decision 9): every SVG the asset store keeps, so every copy that travels
// (a profile file's bundled images, a Library export) has no script, no foreign content and no reference out of the
// file. The served copy is still drawn through `<img>` under the sandbox CSP (`asset_types::SVG_CSP`); this is the
// second line, for a copy opened anywhere else. It follows the studio's template sanitiser
// (src/lib/infopanel/gauges/svg-template.ts) rule for rule, on text rather than a DOM:
//
// - elements dropped with everything inside them: script, foreignObject, iframe, object, embed, audio, video, canvas,
//   handler, listener; any element with a prefix (another namespace) or an `xmlns` other than SVG's; an animation of a link;
// - attributes dropped: event handlers (`on…`), `xml:base`, a link (`href`, `xlink:href`) that is not `#…` or an embedded
//   raster image, and a style value that loads anything (`image-set(`, `src(`, `element(`, …) or hides its words behind a
//   CSS escape;
// - in a style attribute or a `<style>`, `@import` is removed and an outside `url(…)` becomes `none`. A `<style>`'s text
//   and CDATA are joined and cleaned as one stylesheet, as the browser reads them, and written back as one text node; a
//   `<style>` holding a comment or an element is refused, since its parts could join into CSS no check saw;
// - a character reference is decoded as the parser decodes it, any length; one it can't resolve (an unknown name, past
//   U+10FFFF) refuses the file;
// - processing instructions other than the XML declaration go (`<?xml-stylesheet?>` links out), and so does the DOCTYPE,
//   after its plain internal entities are written into the text (Illustrator declares its namespaces that way), each
//   write measured before it is made so the text never grows past `SVG_LIMIT`. A DOCTYPE with any other entity
//   (external, parameter, or one holding markup or a reference) is refused.
//
// A file that is already clean comes back byte for byte, so its content hash, and every URL to it, stays the same. What
// cannot be read (an unclosed tag, comment or quote, an unknown `<!` declaration) is refused, never passed through.

use crate::asset_types::{is_svg_text, SVG_LIMIT};

const SVG_NS: &str = "http://www.w3.org/2000/svg";
const DROP: [&str; 10] = ["script", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas", "handler", "listener"];
const ANIMATIONS: [&str; 4] = ["animate", "set", "animatetransform", "animatemotion"];
/// CSS functions that load something without `url(`, and script in a value.
const LOADERS: [&str; 9] = ["image-set(", "image(", "cross-fade(", "src(", "element(", "paint(", "expression(", "javascript:", "vbscript:"];

/// An in-file reference or an embedded raster image (`SAFE_REF` in svg-template.ts).
fn is_safe_ref(value: &str) -> bool {
    let v = value.trim().to_ascii_lowercase();
    v.starts_with('#') || ["png", "jpeg", "gif", "webp"].iter().any(|t| [';', ','].iter().any(|end| v.starts_with(&format!("data:image/{t}{end}"))))
}

/// A character reference's text (`#106`, `#x6A`, `lt`) as its character: digits of any length with checked arithmetic,
/// the five predefined names; `None` for anything else, U+0000 or a value past U+10FFFF.
fn reference(name: &str) -> Option<char> {
    let ch = match name {
        "lt" => '<',
        "gt" => '>',
        "amp" => '&',
        "quot" => '"',
        "apos" => '\'',
        _ => {
            let (digits, radix) = match name.strip_prefix("#x").or_else(|| name.strip_prefix("#X")) {
                Some(hex) => (hex, 16),
                None => (name.strip_prefix('#')?, 10),
            };
            if digits.is_empty() {
                return None;
            }
            let mut value: u32 = 0;
            for c in digits.chars() {
                value = value.checked_mul(radix)?.checked_add(c.to_digit(radix)?)?;
                if value > 0x10_FFFF {
                    return None;
                }
            }
            char::from_u32(value).filter(|&c| c != '\0')?
        }
    };
    Some(ch)
}

/// Character references and the five predefined entities decoded, as the XML parser does before CSS or a link reads a
/// value; `None` when a reference can't be resolved (or an `&` starts none), so it is refused rather than passed on.
fn decode(text: &str) -> Option<String> {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        let after = &rest[at + 1..];
        let end = after.find(';')?;
        out.push(reference(&after[..end])?);
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    Some(out)
}

/// Text written back into an attribute value or element text.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// `cleanCss`: `@import` removed and an outside `url(…)` made `none`. `None`: the CSS loads something some other way, or
/// uses an escape (`\75 rl(` is `url(`), so it cannot be kept at all.
fn clean_css(css: &str) -> Option<String> {
    let lower = css.to_ascii_lowercase();
    if css.contains('\\') || LOADERS.iter().any(|f| lower.contains(f)) {
        return None;
    }
    let mut out = String::with_capacity(css.len());
    let mut i = 0;
    while i < css.len() {
        if lower[i..].starts_with("@import") {
            let end = lower[i..].find(';').map_or(css.len(), |e| i + e + 1);
            i = end;
            continue;
        }
        if lower[i..].starts_with("url(") {
            let inner = i + 4;
            let close = css[inner..].find(')').map(|e| inner + e)?;
            let target = css[inner..close].trim().trim_matches(|c| c == '"' || c == '\'');
            out.push_str(if is_safe_ref(target) { &css[i..=close] } else { "none" });
            i = close + 1;
            continue;
        }
        let ch = css[i..].chars().next().unwrap_or(' ');
        out.push(ch);
        i += ch.len_utf8();
    }
    Some(out)
}

/// One attribute of a start tag: its name, its value as the parser reads it (references decoded) and its whole source text.
struct Attr<'a> {
    name: &'a str,
    value: String,
    source: &'a str,
}

/// A start tag `<name attrs… (/)>` at the start of `s`: its name, attributes, whether it closes itself, and its length.
fn start_tag(s: &str) -> Option<(&str, Vec<Attr<'_>>, bool, usize)> {
    let b = s.as_bytes();
    let name_end = s[1..].find(|c: char| c.is_whitespace() || c == '/' || c == '>').map(|e| e + 1)?;
    let name = &s[1..name_end];
    if name.is_empty() {
        return None;
    }
    let mut attrs = Vec::new();
    let mut i = name_end;
    loop {
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        match b.get(i)? {
            b'>' => return Some((name, attrs, false, i + 1)),
            b'/' => return (b.get(i + 1) == Some(&b'>')).then_some((name, attrs, true, i + 2)),
            _ => {}
        }
        let from = i;
        let eq = s[i..].find(|c: char| c == '=' || c.is_whitespace() || c == '>' || c == '/').map(|e| i + e)?;
        let attr_name = &s[i..eq];
        i = eq;
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if attr_name.is_empty() || b.get(i) != Some(&b'=') {
            return None;
        }
        i += 1;
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        let quote = *b.get(i)?;
        if quote != b'"' && quote != b'\'' {
            return None;
        }
        let close = s[i + 1..].find(quote as char).map(|e| i + 1 + e)?;
        let raw = &s[i + 1..close];
        if raw.contains('<') {
            return None;
        }
        attrs.push(Attr { name: attr_name, value: decode(raw)?, source: &s[from..=close] });
        i = close + 1;
    }
}

/// The local part of a name, lowercase (`xlink:href` → `href`).
fn local(name: &str) -> String {
    name.rsplit(':').next().unwrap_or(name).to_ascii_lowercase()
}

/// Whether an element goes with everything inside it.
fn drops_element(name: &str, attrs: &[Attr]) -> bool {
    let lname = local(name);
    let animates_ref = ANIMATIONS.contains(&lname.as_str()) && attrs.iter().any(|a| a.name == "attributeName" && a.value.to_ascii_lowercase().contains("href"));
    let foreign_ns = attrs.iter().any(|a| a.name == "xmlns" && a.value.trim() != SVG_NS);
    DROP.contains(&lname.as_str()) || name.contains(':') || animates_ref || foreign_ns
}

/// An attribute as it is kept: unchanged (`Some(None)`), rewritten (`Some(Some(value))`), or dropped (`None`).
fn kept_attr(a: &Attr) -> Option<Option<String>> {
    let name = local(a.name);
    if name.starts_with("on") || a.name.eq_ignore_ascii_case("xml:base") {
        return None;
    }
    let value = &a.value;
    if name == "href" {
        return is_safe_ref(value).then_some(None);
    }
    if value.contains('(') || value.contains('@') || value.contains('\\') || value.to_ascii_lowercase().contains("script:") {
        let cleaned = clean_css(value)?;
        return Some((&cleaned != value).then(|| escape(&cleaned)));
    }
    Some(None)
}

/// The plain internal entities of a DOCTYPE (`<!ENTITY name "value">`), or `None` for one that cannot be kept that way.
fn doctype_entities(doctype: &str) -> Option<Vec<(String, String)>> {
    let mut found = Vec::new();
    let Some(open) = doctype.find('[') else {
        return Some(found);
    };
    let mut rest = &doctype[open + 1..];
    while let Some(at) = rest.find("<!ENTITY") {
        let decl = &rest[at + 8..];
        let end = {
            // the declaration ends at the first `>` outside its quoted value
            let mut quote: Option<char> = None;
            decl.char_indices().find(|&(_, c)| match quote {
                Some(q) if c == q => {
                    quote = None;
                    false
                }
                Some(_) => false,
                None if c == '"' || c == '\'' => {
                    quote = Some(c);
                    false
                }
                None => c == '>',
            })?
            .0
        };
        let body = decl[..end].trim();
        let (name, value) = body.split_once(|c: char| c.is_whitespace())?;
        let value = value.trim();
        let q = value.chars().next()?;
        if name == "%" || !(q == '"' || q == '\'') || !value.ends_with(q) || value.len() < 2 {
            return None;
        }
        let text = &value[1..value.len() - 1];
        if text.contains(['<', '&', '%', q]) {
            return None;
        }
        found.push((name.to_string(), text.to_string()));
        rest = &decl[end + 1..];
    }
    Some(found)
}

/// Where a DOCTYPE starting at `i` ends (its internal subset may hold `>` inside brackets and quotes).
fn doctype_end(s: &str) -> Option<usize> {
    let mut depth = 0usize;
    let mut quote: Option<char> = None;
    for (i, c) in s.char_indices() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), _) => {}
            (None, '"' | '\'') => quote = Some(c),
            (None, '[') => depth += 1,
            (None, ']') => depth = depth.checked_sub(1)?,
            (None, '>') if depth == 0 => return Some(i + 1),
            _ => {}
        }
    }
    None
}

/// The length of a text of `len` bytes once `count` references of `old` bytes are each written as `new` bytes; `None` on
/// overflow.
fn expanded_len(len: u64, count: u64, old: u64, new: u64) -> Option<u64> {
    len.checked_sub(count.checked_mul(old)?)?.checked_add(count.checked_mul(new)?)
}

/// Where the DOCTYPE starts: in the prologue only (after a BOM, white space, processing instructions and comments), never
/// a `<!DOCTYPE` written inside a comment, a CDATA section or text further on.
fn doctype_at(text: &str) -> Option<usize> {
    let mut i = usize::from(text.starts_with('\u{feff}')) * '\u{feff}'.len_utf8();
    loop {
        i += text[i..].len() - text[i..].trim_start().len();
        let r = &text[i..];
        if r.len() >= 9 && r[..9].eq_ignore_ascii_case("<!doctype") {
            return Some(i);
        }
        let end = if r.starts_with("<?") {
            r.find("?>").map(|e| e + 2)
        } else {
            r.strip_prefix("<!--").and_then(|body| body.find("-->")).map(|e| e + 7)
        };
        i += end?;
    }
}

/// The text with its DOCTYPE gone and the DOCTYPE's entities written in, or `None` when it has one that can't be.
fn without_doctype(text: &str) -> Option<String> {
    let Some(at) = doctype_at(text) else {
        return Some(text.to_string());
    };
    let len = doctype_end(&text[at..])?;
    let entities = doctype_entities(&text[at..at + len])?;
    let mut rest = text[at + len..].to_string();
    for (name, value) in &entities {
        let reference = format!("&{name};");
        let written = escape(value).replace('\'', "&apos;");
        // measured before it is made: the text never grows past the limit, however many references there are
        let count = rest.matches(&reference).count() as u64;
        if expanded_len(rest.len() as u64, count, reference.len() as u64, written.len() as u64)? > SVG_LIMIT {
            return None;
        }
        rest = rest.replace(&reference, &written);
    }
    Some(format!("{}{}", &text[..at], rest))
}

/// The SVG with what could run or reach out taken away, or `None` when it cannot be read as SVG.
pub fn sanitize_svg(text: &str) -> Option<String> {
    if !is_svg_text(text) {
        return None;
    }
    let text = without_doctype(text)?;
    let s = text.as_str();
    let mut out = String::with_capacity(s.len());
    // the depth inside a dropped element (0: keeping)
    let mut skip = 0usize;
    let mut i = 0;
    while i < s.len() {
        let r = &s[i..];
        let keep = skip == 0;
        if let Some(body) = r.strip_prefix("<!--") {
            let end = body.find("-->").map(|e| e + 7)?;
            if keep {
                out.push_str(&r[..end]);
            }
            i += end;
        } else if let Some(body) = r.strip_prefix("<![CDATA[") {
            let end = body.find("]]>").map(|e| e + 12)?;
            if keep {
                out.push_str(&r[..end]);
            }
            i += end;
        } else if r.starts_with("<!") {
            return None;
        } else if r.starts_with("<?") {
            let end = r.find("?>").map(|e| e + 2)?;
            let is_decl = r.len() > 5 && r.starts_with("<?xml") && r.as_bytes()[5].is_ascii_whitespace();
            if keep && is_decl {
                out.push_str(&r[..end]);
            }
            i += end;
        } else if r.starts_with("</") {
            let end = r.find('>').map(|e| e + 1)?;
            if skip > 0 {
                skip -= 1;
            } else {
                out.push_str(&r[..end]);
            }
            i += end;
        } else if r.starts_with('<') {
            let (name, attrs, closed, len) = start_tag(r)?;
            if skip > 0 || drops_element(name, &attrs) {
                if !closed {
                    skip += 1;
                }
            } else {
                let kept: Vec<(&Attr, Option<String>)> = attrs.iter().filter_map(|a| kept_attr(a).map(|v| (a, v))).collect();
                if kept.len() == attrs.len() && kept.iter().all(|(_, v)| v.is_none()) {
                    out.push_str(&r[..len]);
                } else {
                    out.push('<');
                    out.push_str(name);
                    for (a, v) in &kept {
                        out.push(' ');
                        match v {
                            Some(value) => out.push_str(&format!("{}=\"{value}\"", a.name)),
                            None => out.push_str(a.source),
                        }
                    }
                    out.push_str(if closed { "/>" } else { ">" });
                }
                if !closed && local(name) == "style" {
                    let (css, close) = style_text(&r[len..], name)?;
                    out.push_str(&css);
                    i += len + close;
                    continue;
                }
            }
            i += len;
        } else {
            let end = r.find('<').unwrap_or(r.len());
            decode(&r[..end])?;
            if keep {
                out.push_str(&r[..end]);
            }
            i += end;
        }
    }
    (skip == 0 && out.len() as u64 <= SVG_LIMIT && is_svg_text(&out)).then_some(out)
}

/// A `<style>`'s content (`s`, after its start tag) as it is kept, with its `</name>`, and the length up to and with that end
/// tag. Its text and CDATA are joined as the browser joins them and cleaned once (`clean_css`): unchanged, they are written
/// back as they came; changed, as one text node; loading something another way, not at all. A comment, an element or
/// anything else inside refuses the file: its parts could join into CSS no check saw.
fn style_text(s: &str, name: &str) -> Option<(String, usize)> {
    let mut css = String::new();
    let mut i = 0;
    loop {
        let r = &s[i..];
        if let Some(body) = r.strip_prefix("<![CDATA[") {
            let end = body.find("]]>")?;
            css.push_str(&body[..end]);
            i += 9 + end + 3;
        } else if let Some(tail) = r.strip_prefix("</").and_then(|t| t.strip_prefix(name)) {
            let gap = tail.len() - tail.trim_start().len();
            if !tail[gap..].starts_with('>') {
                return None;
            }
            let kept = match clean_css(&css) {
                Some(clean) if clean == css => s[..i].to_string(),
                Some(clean) => escape(&clean),
                // a stylesheet that loads something some other way goes whole
                None => String::new(),
            };
            return Some((format!("{kept}</{name}>"), i + 2 + name.len() + gap + 1));
        } else if r.is_empty() || r.starts_with('<') {
            return None;
        } else {
            let end = r.find('<').unwrap_or(r.len());
            css.push_str(&decode(&r[..end])?);
            i += end;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clean(s: &str) -> String {
        sanitize_svg(s).unwrap_or_else(|| panic!("refused: {s}"))
    }

    const NS: &str = r#"xmlns="http://www.w3.org/2000/svg""#;

    #[test]
    fn a_clean_file_comes_back_byte_for_byte() {
        let svg = format!(
            "\u{feff}<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!-- made by hand -->\n<svg {NS} xmlns:xlink=\"http://www.w3.org/1999/xlink\" viewBox='0 0 64 64'>\n  <defs><linearGradient id=\"g\"><stop offset=\"0\" stop-color=\"#fff\"/></linearGradient></defs>\n  <style><![CDATA[ .a {{ fill: url(#g) }} ]]></style>\n  <path class=\"a\" d=\"M0 0h64v64z\" transform=\"rotate(45 32 32)\" fill=\"url( '#g' )\"/>\n  <use xlink:href=\"#g\"/><image href=\"data:image/png;base64,AAAA\"/><text>a &lt; b &amp; url(x)</text>\n  <animate attributeName=\"opacity\" values=\"0;1\" dur=\"1s\"/>\n</svg>\n"
        );
        assert_eq!(clean(&svg), svg);
    }

    #[test]
    fn drops_scripts_and_foreign_content_with_everything_inside() {
        let svg = format!("<svg {NS}><script>alert(1)</script><SCRIPT>x</SCRIPT><foreignObject><div><img src=\"x\"/></div></foreignObject><g><iframe/></g><circle r=\"1\"/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><g></g><circle r=\"1\"/></svg>"));
        // a script hidden in another namespace, by prefix or by xmlns
        let svg = format!("<svg {NS} xmlns:h=\"http://www.w3.org/1999/xhtml\"><h:script>alert(1)</h:script><a xmlns=\"http://www.w3.org/1999/xhtml\"><b>x</b></a></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS} xmlns:h=\"http://www.w3.org/1999/xhtml\"></svg>"));
        // a fake end inside a comment or CDATA does not end the dropped element early
        let svg = format!("<svg {NS}><script><!-- </script> --><![CDATA[</script>]]>alert(1)</script><g/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><g/></svg>"));
    }

    #[test]
    fn drops_event_handlers_and_links_out() {
        let svg = format!("<svg {NS} onload=\"alert(1)\"><a href=\"javascript:alert(1)\" ONCLICK='x'><use xlink:href=\"other.svg#a\" href=\"https://evil.example/a.svg#a\"/><image href=\"http://evil.example/x.png\"/><image href=\"data:image/svg+xml;base64,PHN2Zz4=\"/></a></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><a><use/><image/><image/></a></svg>"));
        // a link spelled with character references is read as the parser reads it
        let svg = format!("<svg {NS}><a href=\"&#106;avascript:alert(1)\"/><a href=\"&#35;ok\"/><g xml:base=\"http://evil.example/\"/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><a/><a href=\"&#35;ok\"/><g/></svg>"));
    }

    #[test]
    fn drops_an_animation_of_a_link() {
        let svg = format!("<svg {NS}><a><set attributeName=\"href\" to=\"javascript:alert(1)\"/><animate attributeName=\"xlink:href\" values=\"x\"></animate><animate attributeName=\"r\" values=\"1;2\"/></a></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><a><animate attributeName=\"r\" values=\"1;2\"/></a></svg>"));
    }

    #[test]
    fn cleans_css_in_styles_and_attributes() {
        let svg = format!("<svg {NS}><style>@import url(https://evil.example/a.css); .a {{ fill: url(https://evil.example/p.png) }} .b {{ fill: url(#g) }}</style><rect style=\"fill: url('http://evil.example/x')\" fill=\"url(#g)\"/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><style> .a {{ fill: none }} .b {{ fill: url(#g) }}</style><rect style=\"fill: none\" fill=\"url(#g)\"/></svg>"));
        // what loads some other way, or hides behind an escape, is dropped whole
        let svg = format!("<svg {NS}><style>.a {{ background: image-set(\"http://evil.example/x.png\" 1x) }}</style><rect fill=\"\\75 rl(http://evil.example/x)\" style=\"background: -webkit-image-set('x' 1x)\" r=\"1\"/><rect fill=\"&#117;rl(http://evil.example/)\"/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><style></style><rect r=\"1\"/><rect fill=\"none\"/></svg>"));
        let svg = format!("<svg {NS}><style><![CDATA[@import 'x.css'; .a {{}}]]></style></svg>");
        // a changed stylesheet is written back as one text node
        assert_eq!(clean(&svg), format!("<svg {NS}><style> .a {{}}</style></svg>"));
    }

    // P-B5: a <style>'s parts were cleaned one by one, so CSS split across them rejoined unseen.
    #[test]
    fn cleans_a_style_as_one_stylesheet_its_parts_joined() {
        let svg = format!("<svg {NS}><style>@im<![CDATA[port 'https://evil.example/a.css';]]> .a {{}}</style></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><style> .a {{}}</style></svg>"));
        let svg = format!("<svg {NS}><style>.a {{ fill: url<![CDATA[(https://evil.example/x)]]> }}</style></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><style>.a {{ fill: none }}</style></svg>"));
        let svg = format!("<svg {NS}><style>@im&#112;ort 'https://evil.example/a.css';</style></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><style></style></svg>"));
        // a comment or an element inside a style refuses the file
        for inner in ["@im<!---->port 'https://evil.example/a.css';", "u<!-- -->rl(https://evil.example/x)", ".a{}<g/>", ".a{}<?x?>"] {
            assert_eq!(sanitize_svg(&format!("<svg {NS}><style>{inner}</style></svg>")), None, "{inner}");
        }
        // an unclosed style is refused, and a clean one with CDATA comes back as it came
        assert_eq!(sanitize_svg(&format!("<svg {NS}><style>.a{{}}")), None);
        let svg = format!("<svg {NS}><style>.a {{ fill: url(#g) }}<![CDATA[ .b {{}} ]]></style ></svg>");
        assert_eq!(clean(&svg), svg.replace("</style >", "</style>"));
    }

    // P-B6: a reference longer than 12 characters stayed encoded here and was decoded by the browser.
    #[test]
    fn decodes_references_of_any_length_and_refuses_what_it_cannot() {
        let svg = format!("<svg {NS}><rect fill=\"&#000000000000117;rl(http://evil.example/)\"/><a href=\"&#x000000000000023;ok\"/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><rect fill=\"none\"/><a href=\"&#x000000000000023;ok\"/></svg>"));
        let svg = format!("<svg {NS}><g style=\"&#0000000000106;avascript:x\"/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><g/></svg>"));
        for bad in ["&nbsp;", "&#x110000;", "&#99999999999999999999;", "&#;", "&#x;", "&#0;", "& ", "&#12a;", "&#x12"] {
            assert_eq!(sanitize_svg(&format!("<svg {NS}><g id=\"{bad}\"/></svg>")), None, "attr {bad}");
            assert_eq!(sanitize_svg(&format!("<svg {NS}><text>{bad}</text></svg>")), None, "text {bad}");
        }
        assert_eq!(reference("#x10FFFF"), char::from_u32(0x10_FFFF));
        assert_eq!(reference("#106"), Some('j'));
    }

    // P-B7: each entity was written in before the size was checked, so a set of them could grow without bound first.
    #[test]
    fn measures_an_entity_before_writing_it_in() {
        assert_eq!(expanded_len(100, 10, 4, 1000), Some(100 - 40 + 10_000));
        assert_eq!(expanded_len(10, u64::MAX, 4, 1000), None);
        assert_eq!(expanded_len(u64::MAX, 1, 0, 1), None);
        // 140 references of 2000 bytes each: 280 000 bytes, refused before it is written
        let big = "a".repeat(2000);
        let refs = "&x;".repeat(140);
        assert_eq!(sanitize_svg(&format!("<!DOCTYPE svg [<!ENTITY x \"{big}\">]><svg {NS}><text>{refs}</text></svg>")), None);
        // within the limit it is written in
        let small = format!("<!DOCTYPE svg [<!ENTITY x \"ab\">]><svg {NS}><text>&x;&x;</text></svg>");
        assert_eq!(clean(&small), format!("<svg {NS}><text>abab</text></svg>"));
    }

    // P-B8 (found by the fuzz test): a `<!DOCTYPE` inside CDATA, a comment or text was taken for the DOCTYPE and cut out.
    #[test]
    fn reads_the_doctype_in_the_prologue_only() {
        let svg = format!("<svg {NS}><text><![CDATA[<!DOCTYPE svg [<!ENTITY x \"y\">]>]]>&amp;</text><!-- <!DOCTYPE z> --></svg>");
        assert_eq!(clean(&svg), svg);
        let svg = format!("\u{feff}<?xml version=\"1.0\"?>\n<!-- c --> <!doctype svg [<!ENTITY x \"y\">]><svg {NS}>&x;</svg>");
        assert_eq!(clean(&svg), format!("\u{feff}<?xml version=\"1.0\"?>\n<!-- c --> <svg {NS}>y</svg>"));
    }

    /// A small fixed-seed generator for the fuzz test.
    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self, n: usize) -> usize {
            self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
            ((self.0 >> 33) as usize) % n
        }
    }

    /// What the fuzz test asks of every output, read as markup (text outside a style is only text): no dropped element,
    /// no handler, no link out, no script in a value, and no loading CSS in a style.
    fn assert_markup_clean(out: &str, from: &str) {
        let mut i = 0;
        while let Some(at) = out[i..].find('<').map(|a| a + i) {
            let r = &out[at..];
            let skip = ["<!--", "<![CDATA[", "<?"].iter().find_map(|p| r.starts_with(p).then(|| if *p == "<!--" { "-->" } else if *p == "<?" { "?>" } else { "]]>" }));
            if let Some(end) = skip {
                i = at + r.find(end).unwrap() + end.len();
                continue;
            }
            if r.starts_with("</") {
                i = at + 2;
                continue;
            }
            let (name, attrs, closed, len) = start_tag(r).unwrap_or_else(|| panic!("unreadable output {out}\nfrom {from}"));
            assert!(!drops_element(name, &attrs), "<{name}> kept in {out}\nfrom {from}");
            for a in &attrs {
                let v = a.value.to_ascii_lowercase();
                assert!(!local(a.name).starts_with("on") && !v.contains("javascript:") && !v.contains("url(http"), "{} kept in {out}\nfrom {from}", a.source);
                assert!(local(a.name) != "href" || is_safe_ref(&a.value), "{} kept in {out}\nfrom {from}", a.source);
            }
            i = at + len;
            if !closed && local(name) == "style" {
                let end = out[i..].find("</style").unwrap() + i;
                let css = decode(&out[i..end].replace("<![CDATA[", "").replace("]]>", "")).unwrap().to_ascii_lowercase();
                assert!(!css.contains("@import") && !css.contains("url(http") && !css.contains("javascript:"), "style {css} in {out}\nfrom {from}");
                i = end;
            }
        }
    }

    #[test]
    fn fuzz_whatever_comes_out_is_clean_and_stays_the_same() {
        const PIECES: [&str; 28] = [
            "<script>alert(1)</script>", "<g>", "</g>", "<style>", "</style>", "<![CDATA[", "]]>", "<!--", "-->", "@import 'https://e.x/a';", "url(", "https://e.x/p)",
            "javascript:", "&#106;", "&#0000000000106;", "&amp;", "&x;", " onload=\"a()\"", "<a href=\"", "\">", "<foreignObject>", "</foreignObject>", "<h:script>", "</h:script>",
            "\\75 rl(", "<rect fill=\"url(#g)\"/>", "<!DOCTYPE svg [<!ENTITY x \"javascript:\">]>", "<set attributeName=\"href\" to=\"javascript:x\"/>",
        ];
        let mut rng = Lcg(0x5eed);
        let mut kept = 0;
        for _ in 0..20_000 {
            let mut body = String::new();
            for _ in 0..rng.next(10) {
                body.push_str(PIECES[rng.next(PIECES.len())]);
            }
            let svg = format!("<svg {NS}>{body}</svg>");
            let Some(out) = sanitize_svg(&svg) else { continue };
            kept += 1;
            assert_markup_clean(&out, &svg);
            assert_eq!(sanitize_svg(&out).as_deref(), Some(out.as_str()), "not stable: {svg}");
        }
        assert!(kept > 1000, "{kept}");
    }

    #[test]
    fn drops_stylesheet_links_and_keeps_the_xml_declaration() {
        let svg = format!("<?xml version=\"1.0\"?><?xml-stylesheet href=\"http://evil.example/a.css\"?><svg {NS}/>");
        assert_eq!(clean(&svg), format!("<?xml version=\"1.0\"?><svg {NS}/>"));
    }

    #[test]
    fn writes_plain_entities_in_and_drops_the_doctype() {
        // Illustrator's way: namespaces as entities
        let svg = "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\" [\n<!ENTITY ns_svg \"http://www.w3.org/2000/svg\">\n]><svg xmlns=\"&ns_svg;\"><g/></svg>";
        assert_eq!(clean(svg), format!("<svg {NS}><g/></svg>"));
        // an entity cannot smuggle a link past the checks: it is written in first
        let svg = format!("<!DOCTYPE svg [<!ENTITY x \"javascript:alert(1)\">]><svg {NS}><a href=\"&x;\"/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><a/></svg>"));
        // an attribute default in the DOCTYPE goes with it
        let svg = format!("<!DOCTYPE svg [<!ATTLIST a href CDATA \"javascript:alert(1)\">]><svg {NS}><a/></svg>");
        assert_eq!(clean(&svg), format!("<svg {NS}><a/></svg>"));
    }

    #[test]
    fn refuses_entities_it_cannot_write_in() {
        for doctype in [
            "<!DOCTYPE svg [<!ENTITY x SYSTEM \"file:///c:/windows/win.ini\">]>",
            "<!DOCTYPE svg [<!ENTITY % p \"x\">]>",
            "<!DOCTYPE svg [<!ENTITY x \"<script>alert(1)</script>\">]>",
            "<!DOCTYPE svg [<!ENTITY a \"aa\"><!ENTITY b \"&a;&a;\">]>",
        ] {
            assert_eq!(sanitize_svg(&format!("{doctype}<svg {NS}/>")), None, "{doctype}");
        }
        // a billion laughs can't grow past the SVG limit
        let big = "a".repeat(2000);
        let refs = "&x;".repeat(200);
        assert_eq!(sanitize_svg(&format!("<!DOCTYPE svg [<!ENTITY x \"{big}\">]><svg {NS}><text>{refs}</text></svg>")), None);
    }

    #[test]
    fn refuses_what_it_cannot_read() {
        for bad in [
            format!("<svg {NS}><g"),
            format!("<svg {NS}><!-- open"),
            format!("<svg {NS}><g a=unquoted/></svg>"),
            format!("<svg {NS}><g a=\"open/></svg>"),
            format!("<svg {NS}><script>never closed"),
            format!("<svg {NS}><!ELEMENT x ANY></svg>"),
            "<html><svg/></html>".to_string(),
            "<script>alert(1)</script><svg/>".to_string(),
        ] {
            assert_eq!(sanitize_svg(&bad), None, "{bad}");
        }
    }

    #[test]
    fn reads_safe_references() {
        assert!(is_safe_ref(" #a"));
        assert!(is_safe_ref("data:image/png;base64,AA"));
        assert!(is_safe_ref("DATA:image/webp,AA"));
        assert!(!is_safe_ref("data:image/svg+xml;base64,AA"));
        assert!(!is_safe_ref("data:image/pngx,AA"));
        assert!(!is_safe_ref("https://example.com/#a"));
        assert!(!is_safe_ref("//example.com/a"));
    }
}
