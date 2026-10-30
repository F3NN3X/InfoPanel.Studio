// The parity fixtures for the alert engine (alerts, alerts-thresholds, alerts-rules, alerts-output, alerts-live;
// tests/fixtures/parity/*.json, written once from the Node server (removed; tests/fixtures/parity/README.md)): each case's input
// through the native engine must give the Node output exactly. Quiet hours are read in Europe/Oslo, the zone the
// fixtures were built in.

use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use ips_server::alerts::{Alerts, Options, StreamHandle};
use ips_server::alerts_engine::{act, evaluate, quieten, AlertsState, Env, Event, Readings};
use ips_server::alerts_rules::{conditions_of, is_quiet, keys_of, prefix_of, rules_of, take_events};
use ips_server::control_store::Control;
use ips_server::ical::LocalZone;
use ips_server::json;
use serde_json::{json, Map, Value};

const ZONE: LocalZone = LocalZone::Pinned(chrono_tz::Europe::Oslo);

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
    assert_eq!(json::stringify(got), json::stringify(want), "{module}: {}", &shown[..shown.len().min(600)]);
}

#[test]
fn helpers() {
    for (input, want) in cases("alerts") {
        let alerts = input.get("alerts");
        let got = match str_of(&input, "fn").unwrap() {
            "keysOf" => json!(keys_of(alerts)),
            "rulesOf" => Value::Array(rules_of(alerts).iter().map(|r| r["id"].clone()).collect()),
            "conditionsOf" => Value::Array(conditions_of(&input["source"]).into_iter().cloned().collect()),
            "prefixOf" => json!(prefix_of(str_of(&input, "key").unwrap())),
            "takeEvents" => {
                let (data, rest) = take_events(str_of(&input, "buffer").unwrap());
                json!({ "data": data, "rest": rest })
            }
            "isQuiet" => json!(is_quiet(input.get("quietHours"), input.get("severity"), input["now"].as_f64().unwrap(), ZONE)),
            other => panic!("unknown fn {other}"),
        };
        same("alerts", &input, &got, &want);
    }
}

fn digest(event: &Event) -> Value {
    let (kind, alert, reason) = match event {
        Event::Fire(alert) => ("fire", alert, Value::Null),
        Event::Clear { alert, reason } => ("clear", alert, json!(reason)),
    };
    json!([kind, alert["id"], alert["text"], alert.get("quiet").is_some(), alert.get("test").is_some(), reason])
}

/// One scripted run through `evaluate` / `act` / `quieten`.
fn run_sequence(input: &Value) -> Value {
    let mode = str_of(input, "mode").unwrap();
    let mut state = AlertsState::default();
    let mut current = input.get("alerts").cloned().unwrap_or(Value::Null);
    let mut readings = Readings::new();
    let mut steps = vec![];
    for step in input["steps"].as_array().unwrap() {
        if let Some(alerts) = step.get("alerts") {
            current = alerts.clone();
        }
        if let Some(Value::Object(next)) = step.get("readings") {
            readings = next.clone();
        }
        let env = Env { now: step["at"].as_f64().unwrap(), muted: step["muted"] == json!(true), zone: ZONE };
        let alerts = (!current.is_null()).then_some(&current);
        let mut error = None;
        let events = match str_of(step, "op").unwrap_or("evaluate") {
            "evaluate" => evaluate(&mut state, alerts, &readings, env),
            "act" => act(&mut state, &step["action"], alerts, &readings, env).unwrap_or_else(|e| {
                error = Some(e);
                vec![]
            }),
            _ => {
                quieten(&mut state);
                vec![]
            }
        };
        let events: Vec<Value> = events
            .iter()
            .map(|e| match mode {
                "full" => e.to_json(),
                "brief" => e.to_json()["type"].clone(),
                _ => digest(e),
            })
            .collect();
        let mut result = Map::new();
        result.insert("events".into(), Value::Array(events));
        if let Some(e) = error {
            result.insert("error".into(), json!(e));
        }
        let active = if mode == "brief" {
            json!(state.active.len())
        } else {
            json!(state.active_alerts().iter().map(|a| a["id"].clone()).collect::<Vec<_>>())
        };
        result.insert("active".into(), active);
        steps.push(Value::Object(result));
    }
    let end = if mode == "brief" {
        let mut end = Map::new();
        end.insert("open".into(), json!(state.active.len()));
        end.insert("history".into(), json!(state.history.len()));
        if let Some(first) = state.history.first() {
            end.insert("first".into(), first["id"].clone());
        }
        if let Some(last) = state.history.last() {
            end.insert("last".into(), last["id"].clone());
        }
        Value::Object(end)
    } else {
        state.to_json()
    };
    json!({ "steps": steps, "state": end })
}

fn run_sequences(module: &str) {
    for (input, want) in cases(module) {
        same(module, &input, &run_sequence(&input), &want);
    }
}

#[test]
fn thresholds() {
    run_sequences("alerts-thresholds");
}

#[test]
fn rules() {
    run_sequences("alerts-rules");
}

#[test]
fn output() {
    run_sequences("alerts-output");
}

/// One scripted run through the live engine with a fake stream and a real control store.
fn run_live(input: &Value) -> Value {
    let dir = tempfile::tempdir().unwrap();
    let config = Arc::new(Mutex::new(input["config"].clone()));
    let clock = Arc::new(AtomicI64::new(1_000_000));
    let urls = Arc::new(Mutex::new(Vec::<String>::new()));
    let read = {
        let config = Arc::clone(&config);
        move || Some(config.lock().unwrap().clone())
    };
    let control = Control::new(dir.path().join("control.json"), 1_000_000, read.clone());
    let file = dir.path().join("alerts.json");
    if let Some(text) = input["file"].as_str() {
        std::fs::write(&file, text).unwrap();
    }
    let alerts = Alerts::new(Options {
        file: file.clone(),
        control: Arc::clone(&control),
        read_config: Box::new(read),
        now: Box::new({
            let clock = Arc::clone(&clock);
            move || clock.load(Ordering::SeqCst) as f64
        }),
        zone: ZONE,
        connect: Arc::new({
            let urls = Arc::clone(&urls);
            move |url, _| {
                urls.lock().unwrap().push(url.to_string());
                StreamHandle::none()
            }
        }),
        save_after: Duration::ZERO,
    });
    let mut steps = vec![];
    for step in input["steps"].as_array().unwrap() {
        clock.store(step["at"].as_i64().unwrap(), Ordering::SeqCst);
        if let Some(next) = step.get("config") {
            *config.lock().unwrap() = next.clone();
            control.config_changed();
            alerts.config_changed();
        }
        if let Some(action) = step.get("control") {
            let _ = control.dispatch(action);
        }
        if let Some(message) = step.get("feed") {
            alerts.feed(message);
        }
        let mut result = Map::new();
        if let Some(action) = step.get("act") {
            let mut done = match alerts.act(action) {
                Ok(done) => done,
                Err(error) => json!({ "error": error }),
            };
            if done.get("mutedUntil").is_some_and(|m| m.as_f64().is_some_and(|m| m != 0.0)) {
                done["mutedUntil"] = json!(true);
            }
            result.insert("result".into(), done);
        }
        let state = control.get();
        let pages: Map<String, Value> = state["profiles"].as_object().unwrap().iter().map(|(k, v)| (k.clone(), v["page"].clone())).collect();
        result.insert("pages".into(), Value::Object(pages));
        result.insert("active".into(), Value::Array(alerts.alerts().as_array().unwrap().iter().map(|a| a["id"].clone()).collect()));
        result.insert("controlAlerts".into(), json!(state["alerts"].as_array().unwrap().len()));
        result.insert("muted".into(), json!(!state["mutedUntil"].is_null()));
        steps.push(Value::Object(result));
    }
    alerts.stop();
    let mut urls = urls.lock().unwrap().clone();
    urls.sort();
    json!({ "urls": urls, "steps": steps, "alerts": control.get()["alerts"], "history": alerts.history(), "file": std::fs::read_to_string(&file).unwrap() })
}

#[test]
fn live() {
    for (input, want) in cases("alerts-live") {
        same("alerts-live", &input, &run_live(&input), &want);
    }
}
