// The aggregation's tests: the grace/asleep bookkeeping and the readings shape, on a fake clock.
// These are the tray code's `on_results` semantics, hosted in devices.rs.

use super::*;
use serde_json::Value;

fn sample(key: &str, percent: i32) -> Sample {
    Sample {
        key: key.into(),
        name: "Model O Wireless".into(),
        via: "USB cable".into(),
        kind: "mouse".into(),
        percent,
        charging: false,
        connected: true,
        ..Sample::default()
    }
}

fn opts(hidden: &[&str]) -> Opts {
    Opts { enabled: true, interval_sec: 60, low_percent: 15, hidden: hidden.iter().map(|s| s.to_string()).collect(), ..Opts::default() }
}

fn text_of(readings: &Readings, key: &str) -> String {
    readings.get(key).and_then(Value::as_object).and_then(|o| o.get("text")).and_then(Value::as_str).unwrap_or("").to_string()
}

fn num_of(readings: &Readings, key: &str) -> i64 {
    readings.get(key).and_then(Value::as_object).and_then(|o| o.get("value")).and_then(Value::as_i64).unwrap_or(-999)
}

#[test]
fn a_reported_device_reads_out_every_field() {
    let (entries, readings) = aggregate(&BTreeMap::new(), &[sample("glorious:1038:1234:1", 93)], 1000, &opts(&[]));
    let id = device_id("glorious:1038:1234:1");
    let p = format!("{NAMESPACE}{id}.");
    assert_eq!(num_of(&readings, &format!("{p}percent")), 93);
    assert_eq!(text_of(&readings, &format!("{p}name")), "Model O Wireless");
    assert_eq!(text_of(&readings, &format!("{p}via")), "USB cable");
    assert_eq!(text_of(&readings, &format!("{p}kind")), "mouse");
    assert_eq!(text_of(&readings, &format!("{p}source")), "glorious");
    assert_eq!(text_of(&readings, &format!("{p}charging")), "no");
    assert_eq!(text_of(&readings, &format!("{p}asleep")), "no");
    assert_eq!(text_of(&readings, &format!("{p}low")), "no");
    assert_eq!(num_of(&readings, &format!("{p}updated")), 1);
    assert_eq!(entries["glorious:1038:1234:1"].last_pct, 93);
}

#[test]
fn an_unknown_percent_keeps_the_last_known_value_asleep() {
    let (entries, _) = aggregate(&BTreeMap::new(), &[sample("glorious:1038:1234:1", 93)], 1000, &opts(&[]));
    let asleep = sample("glorious:1038:1234:1", -1);
    let (entries, readings) = aggregate(&entries, std::slice::from_ref(&asleep), 2000, &opts(&[]));
    let id = device_id("glorious:1038:1234:1");
    let p = format!("{NAMESPACE}{id}.");
    assert_eq!(num_of(&readings, &format!("{p}percent")), 93);
    assert_eq!(text_of(&readings, &format!("{p}asleep")), "yes");
    assert_eq!(entries["glorious:1038:1234:1"].last_pct, 93);
}

#[test]
fn a_device_that_stops_answering_keeps_its_value_through_grace() {
    let mut s = sample("logi:c547:0:1", 40);
    s.grace_sec = 1800;
    let (entries, _) = aggregate(&BTreeMap::new(), &[s], 1000, &opts(&[]));
    // Gone from the link but inside its 30 min grace: still there, asleep, last value.
    let (entries, readings) = aggregate(&entries, &[], 1000 + 1000 * 1000, &opts(&[]));
    let id = device_id("logi:c547:0:1");
    let p = format!("{NAMESPACE}{id}.");
    assert_eq!(num_of(&readings, &format!("{p}percent")), 40);
    assert_eq!(text_of(&readings, &format!("{p}asleep")), "yes");
    assert!(entries.contains_key("logi:c547:0:1"));
    // Past the grace: gone.
    let (entries, readings) = aggregate(&entries, &[], 1000 + 1800 * 1000 + 1000, &opts(&[]));
    assert!(!readings.contains_key(&format!("{p}percent")));
    assert!(!entries.contains_key("logi:c547:0:1"));
}

#[test]
fn a_device_without_grace_leaves_at_once() {
    let s = sample("glorious:1038:1234:1", 93); // grace_sec 0: a direct connection
    let (entries, _) = aggregate(&BTreeMap::new(), &[s], 1000, &opts(&[]));
    let (_, readings) = aggregate(&entries, &[], 2000, &opts(&[]));
    let id = device_id("glorious:1038:1234:1");
    assert!(!readings.contains_key(&format!("{NAMESPACE}{id}.percent")));
}

#[test]
fn a_hidden_device_is_polled_but_not_read_out() {
    let key = "glorious:1038:1234:1";
    let (_, readings) = aggregate(&BTreeMap::new(), &[sample(key, 93)], 1000, &opts(&[key]));
    let id = device_id(key);
    assert!(!readings.contains_key(&format!("{NAMESPACE}{id}.percent")));
    assert!(!readings.contains_key(&format!("{NAMESPACE}{id}.name")));
}

#[test]
fn a_rename_wins_over_the_device_name() {
    let mut o = opts(&[]);
    o.names.insert("glorious:1038:1234:1".into(), "Lounge mouse".into());
    let (_, readings) = aggregate(&BTreeMap::new(), &[sample("glorious:1038:1234:1", 93)], 1000, &o);
    let id = device_id("glorious:1038:1234:1");
    assert_eq!(text_of(&readings, &format!("{NAMESPACE}{id}.name")), "Lounge mouse");
}

#[test]
fn low_marks_at_or_below_the_threshold_unless_charging() {
    let (entries, _) = aggregate(&BTreeMap::new(), &[sample("glorious:1038:1234:1", 15)], 1000, &opts(&[]));
    let id = device_id("glorious:1038:1234:1");
    let p = format!("{NAMESPACE}{id}.");
    let (_, readings) = aggregate(&entries, &[sample("glorious:1038:1234:1", 15)], 2000, &opts(&[]));
    assert_eq!(text_of(&readings, &format!("{p}low")), "yes");
    let (_, readings) = aggregate(&entries, &[sample("glorious:1038:1234:1", 16)], 2000, &opts(&[]));
    assert_eq!(text_of(&readings, &format!("{p}low")), "no");
    let mut charging = sample("glorious:1038:1234:1", 10);
    charging.charging = true;
    let (_, readings) = aggregate(&entries, &[charging], 2000, &opts(&[]));
    assert_eq!(text_of(&readings, &format!("{p}low")), "no");
}

#[test]
fn the_interval_is_clamped_and_the_threshold_has_a_default() {
    assert_eq!(clamp_interval(0), INTERVAL_DEFAULT);
    assert_eq!(clamp_interval(10), INTERVAL_MIN);
    assert_eq!(clamp_interval(500), INTERVAL_MAX);
    assert_eq!(clamp_interval(90), 90);
    assert_eq!(Opts { interval_sec: 0, low_percent: 0, ..Opts::default() }.interval(), INTERVAL_DEFAULT);
    assert_eq!(Opts { interval_sec: 0, low_percent: 0, ..Opts::default() }.low(), LOW_DEFAULT);
}

#[test]
fn the_device_id_is_the_same_every_call() {
    let a = device_id("glorious:1038:1234:1");
    let b = device_id("glorious:1038:1234:1");
    assert_eq!(a, b);
    assert!(!a.is_empty());
    assert_ne!(a, device_id("razer:0084:0:0"));
}
