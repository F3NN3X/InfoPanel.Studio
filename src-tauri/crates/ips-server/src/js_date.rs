// The parts of JavaScript's Date the agent modules use: `Date.parse` of the ISO forms (what the transcripts and the
// statusline carry), and a time's local calendar day. Legacy date text ("Oct 15 2026") is not read: it parses to `None`.

use chrono::{Local, Offset, TimeZone};

use crate::ical::LocalZone;

const DAY_MS: i64 = 86_400_000;

/// Days since 1970-01-01 of a civil date (Howard Hinnant's algorithm); `d` may overflow its month.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The civil date (year, month 1-12, day) of a day count.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(month <= 2), month, day)
}

/// The local zone's offset from UTC at an instant, ms.
fn offset_ms(zone: LocalZone, utc_ms: i64) -> i64 {
    let Some(at) = chrono::DateTime::from_timestamp_millis(utc_ms) else { return 0 };
    let seconds = match zone {
        LocalZone::Pinned(tz) => tz.offset_from_utc_datetime(&at.naive_utc()).fix().local_minus_utc(),
        LocalZone::System => Local.offset_from_utc_datetime(&at.naive_utc()).fix().local_minus_utc(),
    };
    i64::from(seconds) * 1000
}

/// The instant of a local wall time as `new Date(y, m, d, ...)` reads it: the earlier of two instants when the clock
/// repeats, and moved on by the gap when it skips.
fn local_to_utc(wall: i64, zone: LocalZone) -> i64 {
    let before = offset_ms(zone, wall - DAY_MS);
    let after = offset_ms(zone, wall + DAY_MS);
    let valid = |candidate: i64| offset_ms(zone, candidate) == wall - candidate;
    match (valid(wall - before), valid(wall - after)) {
        (true, true) => (wall - before).min(wall - after),
        (true, false) => wall - before,
        (false, true) => wall - after,
        (false, false) => wall - before,
    }
}

/// `n` ASCII digits at the start of `s`, and the rest.
fn digits(s: &str, n: usize) -> Option<(i64, &str)> {
    let head = s.get(..n)?;
    if !head.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((head.parse().ok()?, &s[n..]))
}

/// The date part: `YYYY`, `YYYY-MM` or `YYYY-MM-DD` (or a signed six-digit year), as (year, month, day, rest).
fn date_part(s: &str) -> Option<(i64, i64, i64, &str)> {
    let (year, rest) = match s.as_bytes().first()? {
        b'+' | b'-' => {
            let (y, rest) = digits(&s[1..], 6)?;
            if s.starts_with('-') && y == 0 {
                return None;
            }
            (if s.starts_with('-') { -y } else { y }, rest)
        }
        _ => digits(s, 4)?,
    };
    let Some(rest) = rest.strip_prefix('-') else { return Some((year, 1, 1, rest)) };
    let (month, rest) = digits(rest, 2)?;
    if !(1..=12).contains(&month) {
        return None;
    }
    let Some(rest) = rest.strip_prefix('-') else { return Some((year, month, 1, rest)) };
    let (day, rest) = digits(rest, 2)?;
    // V8 takes any day up to 31 and lets it overflow into the next month.
    if !(1..=31).contains(&day) {
        return None;
    }
    Some((year, month, day, rest))
}

/// `HH:mm[:ss[.fff]]` as ms of the day, and the rest.
fn time_part(s: &str) -> Option<(i64, &str)> {
    let (hour, rest) = digits(s, 2)?;
    let (minute, rest) = digits(rest.strip_prefix(':')?, 2)?;
    let (second, mut rest) = match rest.strip_prefix(':') {
        Some(r) => digits(r, 2)?,
        None => (0, rest),
    };
    let mut millis = 0;
    if let Some(r) = rest.strip_prefix('.') {
        let n = r.bytes().take_while(u8::is_ascii_digit).count();
        if n == 0 {
            return None;
        }
        let head: String = r[..n.min(3)].to_string();
        millis = head.parse::<i64>().ok()? * 10_i64.pow(3 - head.len() as u32);
        rest = &r[n..];
    }
    if hour > 24 || minute > 59 || second > 59 || (hour == 24 && (minute, second, millis) != (0, 0, 0)) {
        return None;
    }
    Some((((hour * 60 + minute) * 60 + second) * 1000 + millis, rest))
}

/// `Z`, `+HH:mm` or `+HHmm` as an offset in ms; `None` for no zone, `Some(None)` for a malformed one.
fn zone_part(s: &str) -> Option<Option<i64>> {
    match s.as_bytes().first() {
        None => None,
        Some(b'Z' | b'z') if s.len() == 1 => Some(Some(0)),
        Some(sign @ (b'+' | b'-')) => {
            let body = &s[1..];
            let parsed = digits(body, 2).and_then(|(h, rest)| {
                let rest = rest.strip_prefix(':').unwrap_or(rest);
                let (m, end) = digits(rest, 2)?;
                end.is_empty().then_some((h, m))
            });
            Some(parsed.filter(|&(h, m)| h <= 23 && m <= 59).map(|(h, m)| (h * 60 + m) * 60_000 * if *sign == b'-' { -1 } else { 1 }))
        }
        Some(_) => Some(None),
    }
}

/// `Date.parse(text)` in `zone` for the ISO forms; a date alone is UTC, a time without a zone is local.
pub fn parse_date(text: &str, zone: LocalZone) -> Option<f64> {
    let (year, month, day, rest) = date_part(text)?;
    let date_ms = (days_from_civil(year, month, 1) + day - 1) * DAY_MS;
    if rest.is_empty() {
        return Some(date_ms as f64);
    }
    let rest = rest.strip_prefix(['T', 't', ' '])?;
    let (time_ms, rest) = time_part(rest)?;
    let wall = date_ms + time_ms;
    let utc = match zone_part(rest) {
        None => local_to_utc(wall, zone),
        Some(Some(offset)) => wall - offset,
        Some(None) => return None,
    };
    Some(utc as f64)
}

/// A time's local day, "YYYY-MM-DD".
pub fn day_key(ms: f64, zone: LocalZone) -> String {
    let at = ms as i64;
    let (year, month, day) = civil_from_days((at + offset_ms(zone, at)).div_euclid(DAY_MS));
    format!("{year:04}-{month:02}-{day:02}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono_tz::Europe::Oslo;

    const OSLO: LocalZone = LocalZone::Pinned(Oslo);

    #[test]
    fn reads_the_iso_forms_as_v8_does() {
        let at = |s: &str| parse_date(s, OSLO);
        assert_eq!(at("2026-10-15T10:00:00Z"), Some(1_792_058_400_000.0));
        assert_eq!(at("2026-10-15 10:00:00Z"), Some(1_792_058_400_000.0));
        assert_eq!(at("2026-10-15T10:00:00.1234Z"), Some(1_792_058_400_123.0));
        assert_eq!(at("2026-10-15T10:00:00+0200"), Some(1_792_051_200_000.0));
        assert_eq!(at("2026-10-15T10:00:00+02:00"), Some(1_792_051_200_000.0));
        // No zone: local for a date-time, UTC for a date.
        assert_eq!(at("2026-10-15T10:00"), Some(1_792_051_200_000.0));
        assert_eq!(at("2026-10"), Some(1_790_812_800_000.0));
        assert_eq!(at("2026"), Some(1_767_225_600_000.0));
        assert_eq!(at("+002026-01-01"), Some(1_767_225_600_000.0));
        // Days overflow into the next month; 24:00 is the next midnight.
        assert_eq!(at("2026-02-30"), Some(1_772_409_600_000.0));
        assert_eq!(at("2026-10-15T24:00:00Z"), Some(1_792_108_800_000.0));
        for bad in ["2026-10-15T24:00:01Z", "2026-13-01", "2026-10-15T10Z", "2026-10-15T10:00:60Z", "2026-10-15T1:00:00Z", "", "1760000000", "Oct 15 2026"] {
            assert_eq!(at(bad), None, "{bad}");
        }
    }

    #[test]
    fn names_the_local_day() {
        // 22:30 UTC on the 14th is already the 15th in Oslo (UTC+2).
        assert_eq!(day_key(1_792_017_000_000.0, OSLO), "2026-10-15");
        assert_eq!(day_key(1_792_017_000_000.0 - 3_600_000.0, OSLO), "2026-10-14");
        assert_eq!(day_key(0.0, LocalZone::Pinned(chrono_tz::UTC)), "1970-01-01");
    }
}
