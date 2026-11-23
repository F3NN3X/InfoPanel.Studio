// Ping: which hosts are probed (only what a stored Ping placement names, and only a real host), the readings' key, the window's
// summary, and a probe against a local listener. Nothing here leaves this computer.

use tokio::net::TcpListener;

use super::*;

#[test]
fn the_id_is_the_host_and_port_as_words() {
    assert_eq!(target_id("1.1.1.1", 443), "1-1-1-1-443");
    assert_eq!(target_id("router.local", 80), "router-local-80");
    assert_eq!(target_id("fe80::1", 22), "fe80-1-22");
}

#[test]
fn only_a_host_a_person_could_mean_is_a_target() {
    let of = |host: &str| target_of(&json!({ "host": host }));
    assert_eq!(of("Example.COM").unwrap().host, "example.com", "case is folded");
    assert_eq!(of(" 192.168.1.1 ").unwrap().host, "192.168.1.1", "a router is a fair target");
    assert!(of("::1").is_some());
    for bad in ["", "http://example.com", "example.com/path", "example.com:80", "user@example.com", "exa mple.com", "-a.com", "a..com", "a.com.", "fe80::zz", "a;b"] {
        assert!(of(bad).is_none(), "{bad:?}");
    }
    assert!(of(&"a".repeat(64)).is_none(), "a label over 63");
    assert!(target_of(&json!({})).is_none() && target_of(&json!({ "host": 5 })).is_none());
}

#[test]
fn the_port_and_interval_are_read_and_bounded() {
    let t = target_of(&json!({ "host": "a.com" })).unwrap();
    assert_eq!((t.port, t.interval), (443, 5), "the defaults");
    let t = target_of(&json!({ "host": "a.com", "port": "8080", "interval": 1 })).unwrap();
    assert_eq!((t.port, t.interval), (8080, 2), "numeric text, and an interval under the floor");
    assert_eq!(target_of(&json!({ "host": "a.com", "interval": 600 })).unwrap().interval, 60);
    for port in [json!(0), json!(65536), json!(80.5), json!("x"), json!(-1)] {
        assert_eq!(target_of(&json!({ "host": "a.com", "port": port })).unwrap().port, 443);
    }
}

#[test]
fn polls_only_the_hosts_the_stored_placements_name() {
    let config = json!({ "profiles": [{ "placements": [
        { "module": "Ping", "settings": { "host": "one.test", "port": 22 } },
        { "module": "Ping", "settings": { "host": "ONE.test", "port": 22 } },
        { "module": "Ping", "settings": { "host": "one.test" } },
        { "module": "Ping", "settings": { "host": "not a host" } },
        { "module": "Ping" },
        { "module": "Weather", "settings": { "host": "other.test" } }
    ] }], "canvas": { "items": [{ "module": "Ping", "settings": { "host": "two.test" } }] } });
    let ids: Vec<String> = referenced_targets(&config, 8).into_iter().map(|t| t.id).collect();
    assert_eq!(ids, ["one-test-22", "one-test-443", "two-test-443"], "once each, wherever a placement sits");
    assert_eq!(referenced_targets(&config, 1).len(), 1, "at most the cap");
    assert!(referenced_targets(&json!({}), 8).is_empty());
}

#[test]
fn the_summary_reads_the_window() {
    let w = |v: &[Option<f64>]| -> Window { v.iter().copied().collect() };
    assert_eq!(summary(&w(&[])), (None, None, 0.0));
    assert_eq!(summary(&w(&[None, None])), (None, None, 100.0));
    let (avg, jitter, loss) = summary(&w(&[Some(10.0), Some(20.0), None, Some(20.0), Some(40.0)]));
    assert_eq!(avg, Some(22.5));
    // a lost probe breaks the run: only 10 to 20 and 20 to 40 count
    assert_eq!(jitter, Some(15.0));
    assert_eq!(loss, 20.0);
}

#[tokio::test]
async fn a_probe_times_an_open_port_and_misses_a_closed_one() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    assert!(probe("127.0.0.1", port).await.is_some_and(|ms| ms >= 0.0));
    drop(listener);
    assert_eq!(probe("127.0.0.1", port).await, None, "nothing listens now");
}

#[tokio::test]
async fn publishes_status_and_timing_then_drops_a_target_no_placement_names() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let wanted = Arc::new(Mutex::new(vec![target_of(&json!({ "host": "127.0.0.1", "port": port, "interval": 2 })).unwrap()]));
    let ping = Ping::new(true, {
        let wanted = Arc::clone(&wanted);
        move || wanted.lock().unwrap().clone()
    });
    let id = format!("{NAMESPACE}127-0-0-1-{port}.");
    ping.refresh(0);
    ping.publish();
    assert_eq!(ping.readings()[&format!("{id}status")]["text"], "waiting", "before the first probe");
    ping.poll_once(1_000).await;
    let seen = ping.readings();
    assert_eq!(seen[&format!("{id}status")]["text"], "ok");
    assert!(seen.contains_key(&format!("{id}ms")) && seen.contains_key(&format!("{id}avg")));
    assert_eq!(seen[&format!("{id}loss")]["value"], 0.0);
    // not due again before its interval: one probe per interval
    ping.poll_once(2_000).await;
    assert_eq!(ping.lock().entries.values().next().unwrap().window.len(), 1);
    ping.poll_once(3_000).await;
    assert_eq!(ping.lock().entries.values().next().unwrap().window.len(), 2);
    // the host stops answering
    drop(listener);
    ping.poll_once(5_000).await;
    let seen = ping.readings();
    assert_eq!(seen[&format!("{id}status")]["text"], "down");
    assert!(!seen.contains_key(&format!("{id}ms")), "no time for a probe that failed");
    assert_eq!(seen[&format!("{id}loss")]["value"], 33.3);
    // the placement goes
    wanted.lock().unwrap().clear();
    ping.refresh(6_000);
    ping.publish();
    assert!(ping.readings().is_empty());
}

#[tokio::test]
async fn the_global_cap_holds_probes_back() {
    let wanted: Vec<Target> = (0..TARGETS_MAX).map(|n| target_of(&json!({ "host": "127.0.0.1", "port": 40_000 + n })).unwrap()).collect();
    let ping = Ping::new(true, move || wanted.clone());
    ping.refresh(0);
    ping.lock().probes = RateCap::new(Duration::from_secs(60), 3);
    ping.poll_once(1_000).await;
    let probed = ping.lock().entries.values().filter(|e| !e.window.is_empty()).count();
    assert_eq!(probed, 3, "three slots, three probes");
}

#[tokio::test]
async fn an_off_source_probes_nothing() {
    let ping = Ping::new(false, || vec![target_of(&json!({ "host": "127.0.0.1" })).unwrap()]);
    ping.refresh(0);
    ping.poll_once(1_000).await;
    assert!(ping.readings().is_empty());
}
