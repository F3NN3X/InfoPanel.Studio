// InfoPanel's installed profiles, read-only, for the studio's Import dialog (server/infopanel-local.mjs).
//
// InfoPanel keeps its data in %LOCALAPPDATA%\InfoPanel (INFOPANEL_DATA_DIR overrides it): `profiles.xml` lists the
// profiles, `profiles/<guid>.xml` holds each one's display items and `assets/<guid>/` its files. Only those are read.
// A path is only built from a guid and a plain file name. This machine only: the files are the user's own.
//
// GET /api/infopanel/installed and /api/infopanel/installed/<guid>/{Profile.xml,DisplayItems.xml,assets/<name>}.
//
// `profiles.xml` is read as text, as the Node code reads it (the `<Profile>` element, the first `<Guid>` and `<Name>`
// in it), not through an XML parser: a document a parser would refuse still lists, and the element comes back verbatim.

use std::io::ErrorKind;
use std::path::Path;

use axum::body::Body;
use axum::http::{HeaderValue, Method, Response, StatusCode};
use serde_json::{json, Value};

use crate::http::{self, Req};
use crate::static_files::decode_uri_component;
use crate::App;

const PREFIX: &str = "/api/infopanel/installed";

/// A profile in `profiles.xml`: its guid, its name (unescaped) and its own `<Profile>` element.
#[derive(Debug, PartialEq)]
pub struct Profile {
    pub guid: String,
    pub name: String,
    pub xml: String,
}

/// `GUID`: `8-4-4-4-12` hex digits, any case.
pub fn is_guid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && [8, 4, 4, 4, 12]
            .iter()
            .zip(&parts)
            .all(|(n, p)| p.len() == *n && p.bytes().all(|b| b.is_ascii_hexdigit()))
}

/// An asset file name as InfoPanel stores it: one plain name, no folders, no dot-only names.
pub fn is_asset_name(s: &str) -> bool {
    !s.is_empty()
        && !s.chars().any(|c| {
            matches!(
                c,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'
            )
        })
        && !s.chars().all(|c| c == '.')
}

fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let known = [
            ("&lt;", '<'),
            ("&gt;", '>'),
            ("&amp;", '&'),
            ("&quot;", '"'),
            ("&apos;", '\''),
        ]
        .into_iter()
        .find(|(e, _)| rest.starts_with(e));
        match known {
            Some((entity, c)) => {
                out.push(c);
                rest = &rest[entity.len()..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out + rest
}

/// `new RegExp("<n>([^<]*)</n>").exec(block)?.[1]`.
fn field<'a>(block: &'a str, n: &str) -> Option<&'a str> {
    let (open, close) = (format!("<{n}>"), format!("</{n}>"));
    let mut from = 0;
    while let Some(at) = block[from..].find(&open) {
        let start = from + at + open.len();
        let end = start + block[start..].find('<').unwrap_or(block.len() - start);
        if block[end..].starts_with(&close) {
            return Some(&block[start..end]);
        }
        from = from + at + 1;
    }
    None
}

/// The profiles in `profiles.xml`, each with its own `<Profile>` element. Entries without a valid Guid are skipped.
pub fn profiles_from_xml(text: &str) -> Vec<Profile> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("<Profile>") {
        let Some(len) = rest[start + 9..].find("</Profile>") else {
            break;
        };
        let end = start + 9 + len + 10;
        let block = &rest[start..end];
        rest = &rest[end..];
        let guid = field(block, "Guid").unwrap_or("");
        if is_guid(guid) {
            out.push(Profile {
                guid: guid.to_string(),
                name: unescape(field(block, "Name").unwrap_or("")),
                xml: block.to_string(),
            });
        }
    }
    out
}

/// `None` for the errors Node's `missing` swallows (ENOENT, ENOTDIR), else the error.
fn missing<T>(result: std::io::Result<T>) -> std::io::Result<Option<T>> {
    match result {
        Ok(v) => Ok(Some(v)),
        Err(e) if matches!(e.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) => Ok(None),
        Err(e) => Err(e),
    }
}

fn profiles(dir: &Path) -> std::io::Result<Option<Vec<Profile>>> {
    Ok(missing(std::fs::read(dir.join("profiles.xml")))?
        .map(|bytes| profiles_from_xml(&String::from_utf8_lossy(&bytes))))
}

/// Every profile: guid, name, the size of its items file and its asset names.
fn list(dir: &Path) -> std::io::Result<Value> {
    let mut found = Vec::new();
    for p in profiles(dir)?.unwrap_or_default() {
        let bytes = std::fs::metadata(dir.join("profiles").join(format!("{}.xml", p.guid)))
            .map_or(0, |m| m.len());
        let mut assets: Vec<String> = std::fs::read_dir(dir.join("assets").join(&p.guid))
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|n| is_asset_name(n))
                    .collect()
            })
            .unwrap_or_default();
        // The default sort compares UTF-16 code units.
        assets.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
        found.push(json!({ "guid": p.guid, "name": p.name, "bytes": bytes, "assets": assets }));
    }
    Ok(Value::Array(found))
}

/// One file of a profile: "Profile.xml", "DisplayItems.xml" or "assets/<name>"; `None` for what is not there.
fn read(dir: &Path, guid: &str, parts: &[String]) -> std::io::Result<Option<Vec<u8>>> {
    if !is_guid(guid) {
        return Ok(None);
    }
    match parts {
        [name] if name == "Profile.xml" => Ok(profiles(dir)?
            .and_then(|all| all.into_iter().find(|p| p.guid == guid))
            .map(|p| p.xml.into_bytes())),
        [name] if name == "DisplayItems.xml" => missing(std::fs::read(
            dir.join("profiles").join(format!("{guid}.xml")),
        )),
        [name, asset] if name == "assets" && is_asset_name(asset) => {
            missing(std::fs::read(dir.join("assets").join(guid).join(asset)))
        }
        _ => Ok(None),
    }
}

/// The /api/infopanel/installed routes.
pub fn handle(app: &App, req: &Req) -> std::io::Result<Response<Body>> {
    if req.method != Method::GET {
        return Ok(http::empty(405));
    }
    if !req.is_loopback() {
        return Ok(http::text(
            403,
            "installed profiles are served to this computer only",
        ));
    }
    let dir = &app.cfg.infopanel_dir;
    if req.path == PREFIX {
        return Ok(http::json(200, &list(dir)?));
    }
    let parts: Option<Vec<String>> = req.path[PREFIX.len() + 1..]
        .split('/')
        .map(decode_uri_component)
        .collect();
    let Some(mut parts) = parts.filter(|p| !p.is_empty()) else {
        return Ok(http::empty(404));
    };
    let guid = parts.remove(0);
    let Some(body) = read(dir, &guid, &parts)? else {
        return Ok(http::empty(404));
    };
    // Assets are the profile's own files, served as bytes: never rendered here.
    let kind = if parts.first().is_some_and(|p| p == "assets") {
        "application/octet-stream"
    } else {
        "application/xml; charset=utf-8"
    };
    let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", HeaderValue::from_static(kind))
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(http::chunked(body));
    Ok(response.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    const G1: &str = "70538526-f13f-4074-bb42-f6892d6e42d4";

    fn profiles_xml() -> String {
        format!(
            "<?xml version=\"1.0\"?><ArrayOfProfile xmlns:xsi=\"x\"><Profile><Guid>{G1}</Guid><Name>A &amp; B &amp;lt; &bogus;</Name><Width>600</Width></Profile><Profile><Guid>../../etc</Guid><Name>bad</Name></Profile></ArrayOfProfile>"
        )
    }

    #[test]
    fn lists_each_profile_with_its_own_element_skipping_invalid_guids() {
        let list = profiles_from_xml(&profiles_xml());
        assert_eq!(list.len(), 1);
        assert_eq!(
            (list[0].guid.as_str(), list[0].name.as_str()),
            (G1, "A & B &lt; &bogus;")
        );
        assert!(list[0].xml.starts_with("<Profile><Guid>") && list[0].xml.ends_with("</Profile>"));
        assert!(profiles_from_xml("<Profile><Guid>x").is_empty());
        let odd = format!("<Profile><Guid>a<b</Guid><Guid>{G1}</Guid></Profile>");
        assert_eq!(profiles_from_xml(&odd).len(), 1);
    }

    #[test]
    fn accepts_guids_and_plain_file_names_only() {
        assert!(is_guid(G1) && is_guid(&G1.to_uppercase()));
        assert!(!is_guid("..") && !is_guid(&format!("{G1}0")));
        assert!(["a.png", "Donut_00001.png", "with space.gif", "..a"]
            .iter()
            .all(|n| is_asset_name(n)));
        assert!(!["..", ".", "a/b.png", "a\\b.png", "C:x", ""]
            .iter()
            .any(|n| is_asset_name(n)));
    }

    #[test]
    fn reads_the_profiles_files_and_swallows_only_missing_ones() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert_eq!(list(root).unwrap(), json!([]));
        std::fs::write(root.join("profiles.xml"), profiles_xml()).unwrap();
        std::fs::create_dir_all(root.join("profiles")).unwrap();
        std::fs::write(
            root.join("profiles").join(format!("{G1}.xml")),
            "<ArrayOfDisplayItem/>",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("assets").join(G1)).unwrap();
        std::fs::write(root.join("assets").join(G1).join("logo.png"), "png").unwrap();
        assert_eq!(
            list(root).unwrap(),
            json!([{ "guid": G1, "name": "A & B &lt; &bogus;", "bytes": 21, "assets": ["logo.png"] }])
        );
        let parts = |p: &[&str]| p.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            read(root, G1, &parts(&["DisplayItems.xml"]))
                .unwrap()
                .unwrap(),
            b"<ArrayOfDisplayItem/>"
        );
        assert_eq!(
            read(root, G1, &parts(&["assets", "logo.png"]))
                .unwrap()
                .unwrap(),
            b"png"
        );
        assert!(read(root, G1, &parts(&["assets", "gone.png"]))
            .unwrap()
            .is_none());
        assert!(read(root, G1, &parts(&["assets", "..", "x"]))
            .unwrap()
            .is_none());
        assert!(read(root, "nope", &parts(&["Profile.xml"]))
            .unwrap()
            .is_none());
        assert!(read(root, G1, &parts(&["Profile.xml"]))
            .unwrap()
            .unwrap()
            .starts_with(b"<Profile>"));
        assert!(read(root, &G1.to_uppercase(), &parts(&["Profile.xml"]))
            .unwrap()
            .is_none());
    }
}
