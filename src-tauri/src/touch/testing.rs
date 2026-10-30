// Testing mode's recordings: what a virtual panel plays (touch.json `testing.replay`). The captures were recorded on
// an ILITEK 1920×550 panel with `touchprobe record` (touch-kit's captures/).

use touch_core::Recording;

/// The captures built into the app, by name; `all` plays them one after another.
pub const BUILT_IN: [&str; 5] = ["all", "tap", "swipes", "two-finger", "hold"];

const CAPTURES: [(&str, &str); 4] = [
    ("tap", include_str!("captures/tap.jsonl")),
    ("swipes", include_str!("captures/swipes.jsonl")),
    ("two-finger", include_str!("captures/two-finger.jsonl")),
    ("hold", include_str!("captures/hold.jsonl")),
];

/// Pause between two captures in `all`.
const GAP_MS: u64 = 1500;

/// The recording `replay` names. `none` is the panel's descriptor without reports: connected, idle.
pub fn recording(replay: &str) -> Result<Recording, String> {
    let built_in = |name: &str| {
        let (_, text) = CAPTURES
            .iter()
            .find(|(n, _)| *n == name)
            .expect("a known capture");
        Recording::parse(text, name).map_err(|e| e.to_string())
    };
    match replay {
        "none" => Ok(Recording {
            reports: Vec::new(),
            ..built_in("tap")?
        }),
        "all" => {
            let mut all = Recording {
                reports: Vec::new(),
                ..built_in("tap")?
            };
            for (name, _) in CAPTURES {
                let offset = all.reports.last().map_or(0, |(t, _)| t + GAP_MS);
                all.reports.extend(
                    built_in(name)?
                        .reports
                        .into_iter()
                        .map(|(t, r)| (t + offset, r)),
                );
            }
            Ok(all)
        }
        name if BUILT_IN.contains(&name) => built_in(name),
        path => Recording::load(path.as_ref()).map_err(|e| e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_replay_name_loads() {
        for name in BUILT_IN.iter().chain(&["none"]) {
            recording(name).unwrap_or_else(|e| panic!("{name}: {e}"));
        }
        let all = recording("all").unwrap();
        assert!(
            all.reports.windows(2).all(|w| w[0].0 <= w[1].0),
            "`all` keeps time order"
        );
        assert!(recording("none").unwrap().reports.is_empty());
        assert!(recording("no/such/file.jsonl").is_err());
    }
}
