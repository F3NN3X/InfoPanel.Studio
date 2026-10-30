// The parity fixtures (tests/fixtures/parity/*.json, written once from the Node server (removed; tests/fixtures/parity/README.md)):
// each case's input through the native function must give the Node output exactly.

use std::path::PathBuf;

use ips_server::config_guard::version_refusal;
use ips_server::config_settings::{apply_settings_patch, reapply_settings, SettingsEntry};
use ips_server::control::{
    current_page, is_island_shown, is_rotating, public_state, reduce, target_profile, State,
};
use ips_server::control_store::Control;
use ips_server::request_guard::{
    agent_write_refusal, config_write_refusal, control_write_refusal, hostname_of, is_loopback,
    parse_allowed_hosts, remote_edit_refusal, Refusal, RequestGuard,
};
use ips_server::security_headers::security_headers;
use ips_server::studio_prefs::{apply_prefs, normalize_prefs};
use ips_server::{js, json, locale};
use serde_json::{json, Value};

fn cases(module: &str) -> Vec<(Value, Value)> {
    let file = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../tests/fixtures/parity")
        .join(format!("{module}.json"));
    let text = std::fs::read_to_string(&file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
    let list: Vec<Value> = serde_json::from_str(&text).unwrap();
    assert!(!list.is_empty(), "{module}: no cases");
    list.into_iter()
        .map(|case| (case["input"].clone(), case["output"].clone()))
        .collect()
}

fn str_of<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

fn refusal(r: Option<Refusal>) -> Value {
    r.map_or(
        Value::Null,
        |r| json!({ "status": r.status, "message": r.message }),
    )
}

/// Compares as JSON text, so key order counts.
fn same(module: &str, input: &Value, got: &Value, want: &Value) {
    assert_eq!(
        json::stringify(got),
        json::stringify(want),
        "{module}: {}",
        json::stringify(input)
    );
}

#[test]
fn request_guard() {
    for (input, want) in cases("request-guard") {
        let headers = &input["headers"];
        let got = match str_of(&input, "fn").unwrap() {
            "hostnameOf" => hostname_of(str_of(&input, "value")).map_or(Value::Null, Value::String),
            "guard" => {
                let options = &input["options"];
                let allowed: Vec<String> = options
                    .get("allowedHosts")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(String::from)
                            .collect()
                    })
                    .unwrap_or_default();
                let guard = RequestGuard::new(
                    str_of(options, "host").unwrap(),
                    &allowed,
                    str_of(options, "machineName").unwrap_or(""),
                );
                refusal(guard.check(
                    str_of(&input, "method").unwrap(),
                    str_of(headers, "host"),
                    str_of(headers, "sec-fetch-site"),
                    str_of(headers, "origin"),
                ))
            }
            "parseAllowedHosts" => json!(parse_allowed_hosts(str_of(&input, "value"))),
            "configWriteRefusal" => refusal(config_write_refusal(
                str_of(headers, "content-type"),
                str_of(headers, "x-dashboard-config"),
            )),
            "controlWriteRefusal" => refusal(control_write_refusal(
                str_of(headers, "content-type"),
                str_of(headers, "x-dashboard-control"),
            )),
            "agentWriteRefusal" => refusal(agent_write_refusal(
                str_of(headers, "content-type"),
                str_of(headers, "x-agent-event"),
                str_of(&input, "address"),
            )),
            "isLoopback" => json!(is_loopback(str_of(&input, "address"))),
            "remoteEditRefusal" => {
                let allow = str_of(&input["env"], "ALLOW_REMOTE_EDIT") == Some("1");
                refusal(remote_edit_refusal(str_of(&input, "address"), allow))
            }
            other => panic!("unknown fn {other}"),
        };
        same("request-guard", &input, &got, &want);
    }
}

#[test]
fn security_headers_match() {
    for (input, want) in cases("security-headers") {
        let headers = security_headers(
            input["isHtml"].as_bool().unwrap(),
            str_of(&input, "search").unwrap(),
        );
        let got = Value::Object(
            headers
                .into_iter()
                .map(|(k, v)| (k.to_string(), Value::String(v)))
                .collect(),
        );
        same("security-headers", &input, &got, &want);
    }
}

#[test]
fn config_guard() {
    for (input, want) in cases("config-guard") {
        let got = refusal(version_refusal(
            str_of(&input, "storedText").unwrap(),
            &input["incoming"],
        ));
        same("config-guard", &input, &got, &want);
    }
}

#[test]
fn config_settings() {
    for (input, want) in cases("config-settings") {
        let got = match str_of(&input, "fn").unwrap() {
            "applySettingsPatch" => {
                let stored = json::parse(str_of(&input, "storedText").unwrap()).unwrap();
                let patch = json::parse(str_of(&input, "patchText").unwrap()).unwrap();
                match apply_settings_patch(&stored, &patch) {
                    Ok(config) => json!({ "text": json::stringify(&config) }),
                    Err(r) => refusal(Some(r)),
                }
            }
            "reapplySettings" => {
                let config = json::parse(str_of(&input, "configText").unwrap()).unwrap();
                let log: Vec<SettingsEntry> = input["log"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|e| SettingsEntry {
                        rev: e["rev"].as_i64().unwrap(),
                        patch: e["patch"].clone(),
                    })
                    .collect();
                let since = js::string_to_number(str_of(&input, "sinceRev").unwrap());
                json!({ "text": json::stringify(&reapply_settings(config, &log, since)) })
            }
            "supportedLanguages" => json!(locale::LANGUAGES),
            other => panic!("unknown fn {other}"),
        };
        same("config-settings", &input, &got, &want);
    }
}

#[test]
fn studio_prefs() {
    for (input, want) in cases("studio-prefs") {
        let got = match str_of(&input, "fn").unwrap() {
            "normalizePrefs" => Value::Object(normalize_prefs(&input["raw"])),
            "applyPrefs" => match apply_prefs(&input["prefs"], &input["patch"]) {
                Ok(prefs) => json!({ "prefs": prefs }),
                Err(error) => json!({ "error": error }),
            },
            other => panic!("unknown fn {other}"),
        };
        same("studio-prefs", &input, &got, &want);
    }
}

/// The state as the fixtures write it (fields equal to the empty state's left out), read and printed in full.
fn full_state(slim: &Value) -> Value {
    State::from_value(slim).to_value()
}

#[test]
fn control() {
    for (input, want) in cases("control") {
        let state = State::from_value(&input["state"]);
        let config = &input["config"];
        let id = &input["id"];
        let got = match str_of(&input, "fn").unwrap() {
            "reduce" => match reduce(
                &state,
                &input["action"],
                config,
                input["now"].as_f64().unwrap(),
            ) {
                Err(error) => json!({ "error": error }),
                Ok(None) => json!({ "same": true }),
                Ok(Some(next)) => json!({ "state": next.to_value() }),
            },
            "publicState" => public_state(&state, config),
            "targetProfile" => target_profile(&state, config, Some(id).filter(|id| !id.is_null())),
            "currentPage" => current_page(&state, config, id).map_or(Value::Null, Value::String),
            "isRotating" => json!(is_rotating(&state, config, id)),
            "isIslandShown" => json!(is_island_shown(&state, config, id)),
            "session" => session(&input),
            other => panic!("unknown fn {other}"),
        };
        let want = if want.get("state").is_some() {
            json!({ "state": full_state(&want["state"]) })
        } else {
            want
        };
        same("control", &input, &got, &want);
    }
}

/// A store over time: the steps' results, the public state, control.json's text and the alert mute at the end.
fn session(input: &Value) -> Value {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("control.json");
    if let Some(text) = input["file"].as_str() {
        std::fs::write(&file, text).unwrap();
    }
    let config = std::sync::Arc::new(std::sync::Mutex::new(input["config"].clone()));
    let read = std::sync::Arc::clone(&config);
    let control = Control::new(file.clone(), input["now0"].as_i64().unwrap(), move || {
        Some(read.lock().unwrap().clone()).filter(|c| !c.is_null())
    });
    let (mut rx, _listener) = control.subscribe();
    let mut now = input["now0"].as_f64().unwrap();
    let mut steps = Vec::new();
    for step in input["steps"].as_array().unwrap() {
        if let Some(at) = step["now"].as_f64() {
            now = at;
        }
        let mut error = None;
        if !step["action"].is_null() {
            error = control.dispatch_at(&step["action"], now).err();
        }
        if !step["setAlerts"].is_null() {
            control.set_alerts(step["setAlerts"].clone());
        }
        if step.get("config").is_some() {
            *config.lock().unwrap() = step["config"].clone();
            control.config_changed();
        }
        let mut told = 0;
        while rx.try_recv().is_ok() {
            told += 1;
        }
        steps.push(error.map_or_else(|| json!({ "told": told }), |e| json!({ "error": e })));
    }
    json!({
        "steps": steps,
        "get": control.get(),
        "file": std::fs::read_to_string(&file).ok(),
        "mutedUntil": control.muted_until(),
    })
}
