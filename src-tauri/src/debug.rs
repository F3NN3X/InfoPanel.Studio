// Debug mode: process samples every 30 s merged with the server's /api/debug/stats and the
// studio's latest report_metrics sample, written to logs/metrics.csv and kept in memory for the
// settings page's leak check.

use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, VecDeque};
use std::io::Write;
use std::path::Path;

pub const SAMPLE_EVERY_SECS: u64 = 30;
/// Two hours of samples.
const KEEP_SECS: u64 = 2 * 3600;
/// "Growing" needs at least this many samples in the last hour (5 minutes at 30 s).
const MIN_GROWING_SAMPLES: usize = 10;

pub type Sample = BTreeMap<String, f64>;

/// Numeric leaves of `v` as `prefix.a.b` keys.
pub fn flatten(prefix: &str, v: &Value, out: &mut Sample) {
    match v {
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                out.insert(prefix.to_owned(), f);
            }
        }
        Value::Object(map) => {
            for (k, child) in map {
                flatten(&format!("{prefix}.{k}"), child, out);
            }
        }
        _ => {}
    }
}

/// The columns of metrics.csv. Rust process numbers first, then the server and studio series
/// the leak check cares about most; every flattened series is still in memory for the page.
pub const CSV_COLUMNS: &[&str] = &[
    "sidecar.rssMb",
    "sidecar.cpuPct",
    "webview.privateMb",
    "app.rssMb",
    "server.memory.rss",
    "server.memory.heapUsed",
    "server.memory.external",
    "server.sseClientsTotal",
    "server.resourcesTotal",
    "server.eventLoopDelayMs.p99",
    "studio.jsHeapUsed",
    "studio.domNodes",
    "studio.eventSources",
];

/// Server stats flattened, plus totals of the per-channel SSE clients and per-type resources.
pub fn server_series(stats: &Value) -> Sample {
    let mut out = Sample::new();
    flatten("server", stats, &mut out);
    for (key, total) in [
        ("sseClients", "server.sseClientsTotal"),
        ("resources", "server.resourcesTotal"),
    ] {
        if let Some(map) = stats.get(key).and_then(Value::as_object) {
            out.insert(total.into(), map.values().filter_map(Value::as_f64).sum());
        }
    }
    out.remove("server.uptimeSeconds");
    out
}

/// The studio sample without its timestamp.
pub fn studio_series(sample: &Value) -> Sample {
    let mut out = Sample::new();
    flatten("studio", sample, &mut out);
    out.remove("studio.ts");
    out
}

pub fn csv_header() -> String {
    format!("time,{}", CSV_COLUMNS.join(","))
}

pub fn csv_line(ts: u64, s: &Sample) -> String {
    let cells: Vec<String> = CSV_COLUMNS
        .iter()
        .map(|c| s.get(*c).map(|v| format!("{v}")).unwrap_or_default())
        .collect();
    format!("{ts},{}", cells.join(","))
}

pub fn append_csv(dir: &Path, ts: u64, s: &Sample) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join("metrics.csv");
    let fresh = !path.exists();
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    if fresh {
        writeln!(f, "{}", csv_header())?;
    }
    writeln!(f, "{}", csv_line(ts, s))
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Growth {
    pub from: f64,
    pub to: f64,
    pub pct: Option<f64>,
    /// Minutes the window actually covers (less than asked early in a run).
    pub minutes: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SeriesStats {
    pub name: String,
    pub latest: f64,
    pub growth30: Option<Growth>,
    pub growth60: Option<Growth>,
    pub growing: bool,
}

/// Rose in at least 80 % of the steps and by more than 20 % overall.
pub fn is_growing(values: &[f64]) -> bool {
    if values.len() < MIN_GROWING_SAMPLES {
        return false;
    }
    let steps = values.len() - 1;
    let rises = values.windows(2).filter(|w| w[1] > w[0]).count();
    let (first, last) = (values[0], values[steps]);
    rises * 5 >= steps * 4 && first > 0.0 && last > first * 1.2
}

#[derive(Default)]
pub struct History {
    samples: VecDeque<(u64, Sample)>,
}

impl History {
    pub fn push(&mut self, ts: u64, s: Sample) {
        self.samples.push_back((ts, s));
        while self
            .samples
            .front()
            .is_some_and(|(t, _)| ts.saturating_sub(*t) > KEEP_SECS)
        {
            self.samples.pop_front();
        }
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn latest(&self) -> Option<&(u64, Sample)> {
        self.samples.back()
    }

    /// `(ts, value)` of `name` in the samples no older than `secs` before the latest one.
    fn window(&self, name: &str, secs: u64) -> Vec<(u64, f64)> {
        let Some((now, _)) = self.samples.back() else {
            return Vec::new();
        };
        self.samples
            .iter()
            .filter(|(t, _)| now.saturating_sub(*t) <= secs)
            .filter_map(|(t, s)| s.get(name).map(|v| (*t, *v)))
            .collect()
    }

    fn growth(&self, name: &str, secs: u64) -> Option<Growth> {
        let w = self.window(name, secs);
        let (&(t0, from), &(t1, to)) = (w.first()?, w.last()?);
        if w.len() < 2 {
            return None;
        }
        Some(Growth {
            from,
            to,
            pct: (from != 0.0).then(|| (to - from) / from * 100.0),
            minutes: (t1 - t0) as f64 / 60.0,
        })
    }

    pub fn stats(&self) -> Vec<SeriesStats> {
        let Some((_, latest)) = self.samples.back() else {
            return Vec::new();
        };
        latest
            .iter()
            .map(|(name, value)| {
                let hour: Vec<f64> = self
                    .window(name, 3600)
                    .into_iter()
                    .map(|(_, v)| v)
                    .collect();
                SeriesStats {
                    name: name.clone(),
                    latest: *value,
                    growth30: self.growth(name, 1800),
                    growth60: self.growth(name, 3600),
                    growing: is_growing(&hour),
                }
            })
            .collect()
    }
}

/// Memory and CPU of the sidecar, the WebView2 processes under this app, and the app itself.
pub struct ProcessSampler {
    sys: sysinfo::System,
}

impl Default for ProcessSampler {
    fn default() -> Self {
        Self {
            sys: sysinfo::System::new(),
        }
    }
}

const MB: f64 = 1024.0 * 1024.0;

impl ProcessSampler {
    pub fn sample(&mut self, sidecar_pid: Option<u32>) -> Sample {
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate};
        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_memory().with_cpu(),
        );
        let mut out = Sample::new();
        let me = Pid::from_u32(std::process::id());
        if let Some(p) = self.sys.process(me) {
            out.insert("app.rssMb".into(), p.memory() as f64 / MB);
        }
        if let Some(p) = sidecar_pid.and_then(|pid| self.sys.process(Pid::from_u32(pid))) {
            out.insert("sidecar.rssMb".into(), p.memory() as f64 / MB);
            out.insert("sidecar.cpuPct".into(), p.cpu_usage() as f64);
        }
        // WebView2 processes descend from this app; sysinfo's virtual memory on Windows is the
        // private commit (PagefileUsage).
        let descends = |pid: Pid| {
            let mut cur = self.sys.process(pid).and_then(|p| p.parent());
            for _ in 0..8 {
                match cur {
                    Some(p) if p == me => return true,
                    Some(p) => cur = self.sys.process(p).and_then(|x| x.parent()),
                    None => return false,
                }
            }
            false
        };
        let webview: u64 = self
            .sys
            .processes()
            .iter()
            .filter(|(_, p)| {
                p.name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case("msedgewebview2.exe")
            })
            .filter(|(pid, _)| descends(**pid))
            .map(|(_, p)| p.virtual_memory())
            .sum();
        out.insert("webview.privateMb".into(), webview as f64 / MB);
        out
    }
}

/// The resident memory of process `pid` in bytes, outside debug mode too (the Server page's
/// Memory cell).
pub fn process_rss(pid: u32) -> Option<u64> {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
    let mut sys = System::new();
    let spid = Pid::from_u32(pid);
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[spid]),
        true,
        ProcessRefreshKind::nothing().with_memory(),
    );
    sys.process(spid).map(|p| p.memory())
}

/// The server's `GET /api/server/stats` as `(uptime ms, open SSE clients)`.
pub fn parse_server_stats(body: &str) -> Option<(u64, u64)> {
    let v: Value = serde_json::from_str(body).ok()?;
    let uptime = v.get("uptimeSeconds")?.as_f64()?;
    let clients = v.get("clients")?.as_u64()?;
    Some(((uptime * 1000.0).round() as u64, clients))
}

/// The studio pages on this machine from `GET /api/server/stats` (`studios`).
pub fn parse_server_studios(body: &str) -> Option<u64> {
    serde_json::from_str::<Value>(body).ok()?.get("studios")?.as_u64()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rss_of_this_process() {
        assert!(process_rss(std::process::id()).is_some_and(|b| b > 0));
    }

    #[test]
    fn server_studios_parse() {
        assert_eq!(parse_server_studios(r#"{"uptimeSeconds":12,"clients":3,"studios":1}"#), Some(1));
        // An older server that doesn't count them.
        assert_eq!(parse_server_studios(r#"{"uptimeSeconds":12,"clients":3}"#), None);
        assert_eq!(parse_server_studios("not json"), None);
    }

    #[test]
    fn server_stats_parse() {
        assert_eq!(
            parse_server_stats(r#"{"uptimeSeconds":12,"clients":3}"#),
            Some((12_000, 3))
        );
        assert_eq!(parse_server_stats(r#"{"clients":3}"#), None);
        assert_eq!(parse_server_stats("<html>"), None);
    }

    #[test]
    fn growing_needs_steady_and_large_growth() {
        let steady: Vec<f64> = (0..20).map(|i| 100.0 + i as f64 * 5.0).collect();
        assert!(is_growing(&steady));
        let small: Vec<f64> = (0..20).map(|i| 100.0 + i as f64).collect();
        assert!(!is_growing(&small), "rose under 20 %");
        let mut noisy = steady.clone();
        for i in (1..20).step_by(3) {
            noisy[i] = 50.0;
        }
        assert!(!is_growing(&noisy), "rose in under 80 % of steps");
        assert!(!is_growing(&steady[..5]), "too few samples");
        let flat = vec![100.0; 20];
        assert!(!is_growing(&flat));
    }

    #[test]
    fn eighty_percent_of_steps_is_enough() {
        // 11 samples, 10 steps: 8 rises and 2 flat steps.
        let v = [
            100.0, 110.0, 120.0, 120.0, 130.0, 140.0, 140.0, 150.0, 160.0, 170.0, 180.0,
        ];
        assert!(is_growing(&v));
    }

    #[test]
    fn growth_over_windows() {
        let mut h = History::default();
        for i in 0..=120u64 {
            let mut s = Sample::new();
            s.insert("x".into(), 100.0 + i as f64);
            h.push(i * 30, s);
        }
        let stats = h.stats();
        let x = stats.iter().find(|s| s.name == "x").unwrap();
        assert_eq!(x.latest, 220.0);
        let g30 = x.growth30.as_ref().unwrap();
        assert_eq!((g30.from, g30.to, g30.minutes), (160.0, 220.0, 30.0));
        let g60 = x.growth60.as_ref().unwrap();
        assert_eq!(g60.from, 100.0);
        assert_eq!(g60.pct, Some(120.0));
        assert!(x.growing);
    }

    #[test]
    fn history_keeps_two_hours() {
        let mut h = History::default();
        for i in 0..400u64 {
            h.push(i * 30, Sample::new());
        }
        assert_eq!(h.len(), 241);
    }

    #[test]
    fn single_sample_has_no_growth() {
        let mut h = History::default();
        h.push(0, Sample::from([("x".to_string(), 1.0)]));
        assert!(h.stats()[0].growth30.is_none());
    }

    #[test]
    fn server_stats_flatten_with_totals() {
        let stats = json!({
            "memory": { "rss": 50, "heapUsed": 10 },
            "uptimeSeconds": 99,
            "sseClients": { "config": 2, "control": 1 },
            "resources": { "Timeout": 4, "TCPSocketWrap": 3 },
            "eventLoopDelayMs": { "p50": 1.0, "p99": 2.5, "max": 9.0 }
        });
        let s = server_series(&stats);
        assert_eq!(s["server.memory.rss"], 50.0);
        assert_eq!(s["server.sseClientsTotal"], 3.0);
        assert_eq!(s["server.resourcesTotal"], 7.0);
        assert_eq!(s["server.eventLoopDelayMs.p99"], 2.5);
        assert!(!s.contains_key("server.uptimeSeconds"));
    }

    #[test]
    fn studio_sample_and_csv() {
        let s = studio_series(
            &json!({ "ts": 1, "jsHeapUsed": 2048, "domNodes": 900, "eventSources": 3, "jsHeapTotal": null, "url": "x" }),
        );
        assert_eq!(s.len(), 3);
        let line = csv_line(7, &s);
        assert!(line.starts_with("7,,,,,"));
        assert!(line.ends_with(",2048,900,3"));
        assert_eq!(csv_header().split(',').count(), line.split(',').count());
    }
}
