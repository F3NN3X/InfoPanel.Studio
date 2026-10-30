// The parity fixtures for the media modules (assets, canvases, library, infopanel-local; tests/fixtures/parity/*.json,
// written once from the Node server (removed; tests/fixtures/parity/README.md)): each case's input through the native function must
// give the Node output exactly.

use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use ips_server::asset_types::{declared_type, is_asset_id, is_svg_text, limit_of, parse_range, referenced_hashes, sniff_type, upload_quota_refusal, Range, AssetType, SVG_LIMIT};
use ips_server::canvases::{canvas_id_of, canvas_refusal, canvas_write_refusal, referenced_canvas_ids, CanvasStore, MAX_CANVAS_BYTES, SWEEP_GRACE_MS};
use ips_server::infopanel_local::{is_asset_name, is_guid, profiles_from_xml};
use ips_server::library::{library_write_refusal, normalize_item, summary_of};
use ips_server::request_guard::Refusal;
use ips_server::json;
use serde_json::{json, Map, Value};

fn cases(module: &str) -> Vec<(Value, Value)> {
    let file = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/parity").join(format!("{module}.json"));
    let text = std::fs::read_to_string(&file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
    let list: Vec<Value> = serde_json::from_str(&text).unwrap();
    assert!(!list.is_empty(), "{module}: no cases");
    list.into_iter().map(|case| (case["input"].clone(), case["output"].clone())).collect()
}

fn str_of<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// Compares as JSON text, so key order counts.
fn same(module: &str, input: &Value, got: &Value, want: &Value) {
    assert_eq!(json::stringify(got), json::stringify(want), "{module}: {}", &json::stringify(input)[..json::stringify(input).len().min(300)]);
}

fn refusal(r: Option<Refusal>) -> Value {
    r.map_or(Value::Null, |r| json!({ "status": r.status, "message": r.message }))
}

fn type_json(t: Option<&AssetType>) -> Value {
    let Some(t) = t else { return Value::Null };
    let mut out = Map::new();
    out.insert("ext".into(), json!(t.ext));
    out.insert("mime".into(), json!(t.mime));
    out.insert("kind".into(), json!(t.kind));
    if let Some(limit) = t.limit {
        out.insert("limit".into(), json!(limit));
    }
    Value::Object(out)
}

fn unhex(hex: &str) -> Vec<u8> {
    (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap()).collect()
}

#[test]
fn assets() {
    for (input, want) in cases("assets") {
        let got = match str_of(&input, "fn").unwrap() {
            "sniffType" => type_json(sniff_type(&unhex(str_of(&input, "hex").unwrap()))),
            "isSvgText" => json!(is_svg_text(str_of(&input, "text").unwrap())),
            "declaredType" => type_json(declared_type(str_of(&input, "header"))),
            "limitOf" => json!(limit_of(ips_server::asset_types::by_ext(str_of(&input, "ext").unwrap()).unwrap())),
            "svgLimit" => json!(SVG_LIMIT),
            "assetPath" => json!(str_of(&input, "id").is_some_and(is_asset_id)),
            "referencedHashes" => json!(referenced_hashes(str_of(&input, "text").unwrap())),
            "parseRange" => match parse_range(str_of(&input, "header"), input["size"].as_u64().unwrap()) {
                Range::Whole => Value::Null,
                Range::Unsatisfiable => json!("unsatisfiable"),
                Range::Span(start, end) => json!({ "start": start, "end": end }),
            },
            "uploadQuotaRefusal" => {
                let n = |key: &str| input[key].as_f64().unwrap();
                match upload_quota_refusal(n("inFlight") as usize, n("maxInFlight") as usize, n("used"), n("incoming"), n("maxBytes")) {
                    Some((status, message)) => json!({ "status": status, "message": message }),
                    None => Value::Null,
                }
            }
            other => panic!("unknown fn {other}"),
        };
        same("assets", &input, &got, &want);
    }
}

/// What the sweep fixture reports: the names deleted and the names left, of the files it made.
fn sweep(input: &Value) -> Value {
    let dir = tempfile::tempdir().unwrap();
    let canvases = dir.path().join("canvases");
    std::fs::create_dir_all(&canvases).unwrap();
    let store = CanvasStore::new(&canvases);
    let now = js_now();
    let mut names = Vec::new();
    for file in input["files"].as_array().unwrap() {
        let text = str_of(file, "text").unwrap();
        let name = str_of(file, "name").map_or_else(|| format!("{}.json", canvas_id_of(text)), String::from);
        std::fs::write(canvases.join(&name), text).unwrap();
        let age = Duration::from_millis((file["ageHours"].as_f64().unwrap() * 3_600_000.0) as u64);
        std::fs::OpenOptions::new().write(true).open(canvases.join(&name)).unwrap().set_modified(SystemTime::now() - age).unwrap();
        names.push(name);
    }
    let mut deleted: Vec<String> = store
        .sweep(str_of(input, "configText").unwrap(), now, SWEEP_GRACE_MS)
        .into_iter()
        .map(|d| if d.len() == 36 && d.starts_with("cnv_") { format!("{d}.json") } else { d })
        .collect();
    deleted.sort();
    let mut left: Vec<String> = names.into_iter().filter(|n| canvases.join(n).exists()).collect();
    left.sort();
    json!({ "deleted": deleted, "left": left })
}

fn js_now() -> f64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_millis() as f64
}

#[test]
fn canvases() {
    for (input, want) in cases("canvases") {
        let text = str_of(&input, "text");
        let got = match str_of(&input, "fn").unwrap() {
            "canvasIdOf" => json!(canvas_id_of(text.unwrap())),
            "canvasRefusal" => canvas_refusal(text.unwrap()).map_or(Value::Null, |e| json!(e)),
            "canvasRefusalBig" => {
                let pad = "x".repeat(input["pad"].as_u64().unwrap() as usize);
                canvas_refusal(&format!(r#"{{"format":"infopanel-canvas","pad":"{pad}"}}"#)).map_or(Value::Null, |e| json!(e))
            }
            "referencedCanvasIds" => referenced_canvas_ids(str_of(&input, "configText").unwrap()).map_or(Value::Null, |ids| json!(ids)),
            "canvasWriteRefusal" => {
                let h = &input["headers"];
                refusal(canvas_write_refusal(str_of(h, "content-type"), str_of(h, "x-dashboard-canvas"), str_of(&input, "remote"), input["allowRemote"].as_bool().unwrap()))
            }
            "sweep" => sweep(&input),
            other => panic!("unknown fn {other}"),
        };
        same("canvases", &input, &got, &want);
    }
    assert_eq!(MAX_CANVAS_BYTES, 8 * 1024 * 1024);
}

/// `{ "$repeat": "x", "n": 5 }` is a string, `{ "$fill": item, "n": 5 }` a list (see media-fixtures.mjs).
fn expand(v: &Value) -> Value {
    match v {
        Value::Array(items) => Value::Array(items.iter().map(expand).collect()),
        Value::Object(map) if map.contains_key("$repeat") => json!(map["$repeat"].as_str().unwrap().repeat(map["n"].as_u64().unwrap() as usize)),
        Value::Object(map) if map.contains_key("$fill") => Value::Array(vec![expand(&map["$fill"]); map["n"].as_u64().unwrap() as usize]),
        Value::Object(map) => Value::Object(map.iter().map(|(k, x)| (k.clone(), expand(x))).collect()),
        other => other.clone(),
    }
}

/// The fixture's view of a normalised item: the error, a long item as its length, a new item with its id masked.
fn normalized(result: Result<Value, String>, existing: bool) -> Value {
    match result {
        Err(error) => json!({ "error": error }),
        Ok(item) => {
            let length = json::stringify(&item).encode_utf16().count();
            if length > 4000 {
                return json!({ "big": length, "copies": item["copies"].as_array().unwrap().len() });
            }
            let mut item = item;
            if !existing {
                item["id"] = json!("NEW");
            }
            json!({ "item": item })
        }
    }
}

#[test]
fn library() {
    for (input, want) in cases("library") {
        let now = input["now"].as_i64();
        let got = match str_of(&input, "fn").unwrap() {
            "normalizeItem" => {
                let existing = Some(&input["existing"]).filter(|e| !e.is_null());
                normalized(normalize_item(&expand(&input["raw"]), existing, now.unwrap()), existing.is_some())
            }
            "normalizeBigData" => {
                let raw = json!({ "kind": "canvas", "name": "c", "data": { "s": "x".repeat(input["chars"].as_u64().unwrap() as usize) } });
                match normalize_item(&raw, None, now.unwrap()) {
                    Err(error) => json!({ "error": error }),
                    Ok(item) => json!({ "length": json::stringify(&item).encode_utf16().count() }),
                }
            }
            "summaryOf" | "summaryOfNull" => {
                let mut item = json!({ "id": "lib_summary00000", "kind": "canvas", "name": "c", "createdAt": "2026-10-17T12:00:00.000Z", "updatedAt": "2026-10-17T12:00:00.000Z", "files": [], "meta": {}, "copies": [] });
                if str_of(&input, "fn") == Some("summaryOfNull") {
                    item["data"] = Value::Null;
                } else if let Some(chars) = input["chars"].as_u64() {
                    item["data"] = json!({ "s": "x".repeat(chars as usize) });
                }
                let summary = summary_of(&item);
                json!({ "keys": json::keys(summary.as_object().unwrap()), "dataSize": summary.get("dataSize").cloned().unwrap_or(Value::Null) })
            }
            "libraryWriteRefusal" => {
                let h = &input["headers"];
                refusal(library_write_refusal(
                    str_of(h, "content-type"),
                    str_of(h, "x-dashboard-library"),
                    str_of(&input, "remote"),
                    input["allowRemote"].as_bool().unwrap(),
                    input["body"].as_bool().unwrap(),
                ))
            }
            other => panic!("unknown fn {other}"),
        };
        same("library", &input, &got, &want);
    }
}

#[test]
fn infopanel_local() {
    for (input, want) in cases("infopanel-local") {
        let got = match str_of(&input, "fn").unwrap() {
            "profilesFromXml" => Value::Array(
                profiles_from_xml(str_of(&input, "text").unwrap()).into_iter().map(|p| json!({ "guid": p.guid, "name": p.name, "xml": p.xml })).collect(),
            ),
            "isGuid" => json!(is_guid(str_of(&input, "value").unwrap())),
            "isAssetName" => json!(is_asset_name(str_of(&input, "value").unwrap())),
            other => panic!("unknown fn {other}"),
        };
        same("infopanel-local", &input, &got, &want);
    }
}
