// The parity fixtures for the extras (ical, ical-rules, integrations, obs, calendar; tests/fixtures/parity/*.json,
// written from the Node server by tools/parity/extras-fixtures.mjs): each case's input through the native function must
// give the Node output exactly. Floating times are read in Europe/Oslo, the zone the fixtures were built in.

use std::path::PathBuf;

use ips_server::calendar::upcoming;
use ips_server::guarded_net::blocked_address;
use ips_server::ical::{occurrences, parse_ics, parse_time, to_instant, zone_of, LocalZone, Params};
use ips_server::integrations::{apply_integrations, clean_calendar_url, clean_host, normalize_integrations, public_view, stored_form};
use ips_server::json;
use ips_server::obs::{obs_auth, obs_step, ObsState};
use serde_json::{json, Value};

const LOCAL: LocalZone = LocalZone::Pinned(chrono_tz::Europe::Oslo);

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
    let shown = json::stringify(input);
    assert_eq!(json::stringify(got), json::stringify(want), "{module}: {}", &shown[..shown.len().min(400)]);
}

fn run_ical(module: &str) {
    for (input, want) in cases(module) {
        let got = match str_of(&input, "fn").unwrap() {
            "zoneOf" => zone_of(str_of(&input, "tzid").unwrap()).map_or(Value::Null, |z| json!(z.name)),
            "toInstant" => {
                let zone = str_of(&input, "zone").map(|name| zone_of(name).unwrap_or_else(|| panic!("zone {name}")));
                json!(to_instant(input["wall"].as_i64().unwrap(), zone.as_ref(), LOCAL))
            }
            "parseTime" => {
                let params: Params = input["params"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v.as_str().unwrap().to_string())).collect();
                parse_time(str_of(&input, "value").unwrap(), &params).map_or(Value::Null, |t| t.to_json())
            }
            "occurrences" => {
                let events = parse_ics(str_of(&input, "text").unwrap());
                let list = occurrences(&events, input["from"].as_i64().unwrap(), input["to"].as_i64().unwrap(), LOCAL);
                Value::Array(list.iter().map(|o| o.to_json()).collect())
            }
            "parseIcs" => Value::Array(parse_ics(str_of(&input, "text").unwrap()).iter().map(|e| e.to_json()).collect()),
            other => panic!("unknown fn {other}"),
        };
        same(module, &input, &got, &want);
    }
}

#[test]
fn ical() {
    run_ical("ical");
}

#[test]
fn ical_rules() {
    run_ical("ical-rules");
}

#[test]
fn integrations() {
    for (input, want) in cases("integrations") {
        let got = match str_of(&input, "fn").unwrap() {
            "cleanHost" => json!(clean_host(Some(&input["value"]))),
            "cleanCalendarUrl" => clean_calendar_url(Some(&input["value"])).map_or(Value::Null, Value::String),
            "normalizeIntegrations" => stored_form(&normalize_integrations(&input["raw"])),
            "publicIntegrations" => public_view(&normalize_integrations(&input["state"])),
            "applyIntegrations" => {
                let mut n = 0;
                let mut new_id = || {
                    n += 1;
                    format!("id{n}")
                };
                match apply_integrations(&normalize_integrations(&input["state"]), &input["patch"], &mut new_id) {
                    Ok(state) => json!({ "state": stored_form(&state) }),
                    Err(error) => json!({ "error": error }),
                }
            }
            other => panic!("unknown fn {other}"),
        };
        same("integrations", &input, &got, &want);
    }
}

#[test]
fn obs() {
    for (input, want) in cases("obs") {
        let got = match str_of(&input, "fn").unwrap() {
            "obsAuth" => json!(obs_auth(str_of(&input, "password").unwrap(), str_of(&input, "salt").unwrap(), str_of(&input, "challenge").unwrap())),
            "obsStep" => {
                let flag = |name: &str| input["state"][name].as_bool().unwrap();
                let state = ObsState { configured: flag("configured"), connected: flag("connected"), streaming: flag("streaming"), recording: flag("recording") };
                let (next, send) = obs_step(state, &input["message"], str_of(&input, "password").unwrap());
                json!({ "state": next.to_json(), "send": send })
            }
            other => panic!("unknown fn {other}"),
        };
        same("obs", &input, &got, &want);
    }
}

#[test]
fn calendar() {
    for (input, want) in cases("calendar") {
        let got = match str_of(&input, "fn").unwrap() {
            "blockedAddress" => json!(blocked_address(str_of(&input, "ip").unwrap(), input["blockLan"].as_bool().unwrap())),
            "upcoming" => {
                let feeds: Vec<String> = input["feeds"].as_array().unwrap().iter().map(|f| f.as_str().unwrap().to_string()).collect();
                Value::Array(upcoming(&feeds, input["now"].as_i64().unwrap(), LOCAL).iter().map(|o| o.to_json()).collect())
            }
            other => panic!("unknown fn {other}"),
        };
        same("calendar", &input, &got, &want);
    }
}
