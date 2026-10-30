// A small iCalendar (RFC 5545) reader for the calendar links (server/ical.mjs): the VEVENTs of a feed expanded to the
// occurrences in a time window. UTC, floating, TZID (IANA and the common Windows names) and all-day times; RRULE with
// FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY and BYMONTH; EXDATE; RECURRENCE-ID overrides. Cancelled events are
// left out, and anything unreadable is skipped rather than failing the feed.
//
// Times are unix milliseconds, and a "wall" is a wall-clock time kept as if it were UTC, as the Node code keeps them.
// Floating times and all-day dates are in the server's local zone; `LocalZone` lets a test pin that zone.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::OnceLock;

use chrono::{Local, Offset, TimeZone};
use chrono_tz::{Tz, TZ_VARIANTS};
use serde_json::{json, Map, Value};

use crate::js;

/// Windows time zone names Outlook writes as TZID, to IANA.
const WINDOWS_TZ: [(&str, &str); 34] = [
    ("UTC", "UTC"),
    ("Coordinated Universal Time", "UTC"),
    ("GMT Standard Time", "Europe/London"),
    ("Greenwich Standard Time", "Atlantic/Reykjavik"),
    ("W. Europe Standard Time", "Europe/Berlin"),
    ("Central Europe Standard Time", "Europe/Budapest"),
    ("Central European Standard Time", "Europe/Warsaw"),
    ("Romance Standard Time", "Europe/Paris"),
    ("FLE Standard Time", "Europe/Kiev"),
    ("GTB Standard Time", "Europe/Bucharest"),
    ("E. Europe Standard Time", "Europe/Chisinau"),
    ("Russian Standard Time", "Europe/Moscow"),
    ("Turkey Standard Time", "Europe/Istanbul"),
    ("Israel Standard Time", "Asia/Jerusalem"),
    ("Arabian Standard Time", "Asia/Dubai"),
    ("India Standard Time", "Asia/Kolkata"),
    ("China Standard Time", "Asia/Shanghai"),
    ("Singapore Standard Time", "Asia/Singapore"),
    ("Tokyo Standard Time", "Asia/Tokyo"),
    ("Korea Standard Time", "Asia/Seoul"),
    ("AUS Eastern Standard Time", "Australia/Sydney"),
    ("E. Australia Standard Time", "Australia/Brisbane"),
    ("New Zealand Standard Time", "Pacific/Auckland"),
    ("Eastern Standard Time", "America/New_York"),
    ("Central Standard Time", "America/Chicago"),
    ("Mountain Standard Time", "America/Denver"),
    ("US Mountain Standard Time", "America/Phoenix"),
    ("Pacific Standard Time", "America/Los_Angeles"),
    ("Alaskan Standard Time", "America/Anchorage"),
    ("Hawaiian Standard Time", "Pacific/Honolulu"),
    ("Atlantic Standard Time", "America/Halifax"),
    ("E. South America Standard Time", "America/Sao_Paulo"),
    ("SA Pacific Standard Time", "America/Bogota"),
    ("South Africa Standard Time", "Africa/Johannesburg"),
];

pub const DAY_MS: i64 = 86_400_000;
/// Occurrences tried per event before giving up (a daily rule over 50 years).
const MAX_STEPS: usize = 20_000;
/// The largest INTERVAL taken as written (anything above is clamped, which keeps the date arithmetic in range).
const MAX_INTERVAL: f64 = 100_000.0;

/// The zone floating times and all-day dates are read in: the server's own, or a pinned one for tests.
#[derive(Debug, Clone, Copy)]
pub enum LocalZone {
    System,
    Pinned(Tz),
}

#[derive(Debug, Clone, PartialEq)]
enum ZoneKind {
    /// The literal "UTC": the wall time as it is.
    Utc,
    Named(Tz),
    /// A UTC offset written as the zone (`+01:00`), in seconds.
    Offset(i64),
}

/// A TZID that resolved to a zone, with the name as it was written.
#[derive(Debug, Clone, PartialEq)]
pub struct Zone {
    pub name: String,
    kind: ZoneKind,
}

/// A parsed date or date-time: `wall` in `zone` (`None` = the server's local time).
#[derive(Debug, Clone, PartialEq)]
pub struct Time {
    pub wall: i64,
    pub zone: Option<Zone>,
    pub all_day: bool,
}

impl Time {
    fn with_wall(&self, wall: i64) -> Self {
        Self {
            wall,
            zone: self.zone.clone(),
            all_day: self.all_day,
        }
    }

    pub fn to_json(&self) -> Value {
        json!({ "wall": self.wall, "zone": self.zone.as_ref().map(|z| z.name.as_str()), "allDay": self.all_day })
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Freq {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

#[derive(Debug, Clone, PartialEq)]
struct ByDay {
    n: f64,
    day: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Rule {
    freq: Freq,
    interval: i64,
    count: Option<f64>,
    /// `None`: no UNTIL; `Some(None)`: one that does not parse.
    until: Option<Option<Time>>,
    by_day: Vec<ByDay>,
    by_month_day: Vec<f64>,
    by_month: Vec<f64>,
    week_start: i64,
}

/// One VEVENT.
#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    pub uid: String,
    pub title: String,
    pub location: String,
    pub start: Time,
    pub end: Time,
    pub rule: Option<Rule>,
    pub exdates: Vec<Time>,
    pub recurrence_id: Option<Time>,
}

/// One occurrence in a window.
#[derive(Debug, Clone, PartialEq)]
pub struct Occurrence {
    pub id: String,
    pub title: String,
    pub location: Option<String>,
    pub start: i64,
    pub end: i64,
    pub all_day: bool,
}

impl Occurrence {
    pub fn to_json(&self) -> Value {
        let mut m = Map::new();
        m.insert("id".into(), json!(self.id));
        m.insert("title".into(), json!(self.title));
        if let Some(location) = &self.location {
            m.insert("location".into(), json!(location));
        }
        m.insert("start".into(), json!(self.start));
        m.insert("end".into(), json!(self.end));
        m.insert("allDay".into(), json!(self.all_day));
        Value::Object(m)
    }
}

impl Rule {
    fn to_json(&self) -> Value {
        let mut m = Map::new();
        let freq = match self.freq {
            Freq::Daily => "DAILY",
            Freq::Weekly => "WEEKLY",
            Freq::Monthly => "MONTHLY",
            Freq::Yearly => "YEARLY",
        };
        m.insert("freq".into(), json!(freq));
        m.insert("interval".into(), json!(self.interval));
        if let Some(count) = self.count {
            m.insert(
                "count".into(),
                if count.is_finite() {
                    json!(count)
                } else {
                    Value::Null
                },
            );
        }
        if let Some(until) = &self.until {
            m.insert(
                "until".into(),
                until.as_ref().map_or(Value::Null, Time::to_json),
            );
        }
        m.insert(
            "byDay".into(),
            Value::Array(
                self.by_day
                    .iter()
                    .map(|b| json!({ "n": b.n, "day": b.day }))
                    .collect(),
            ),
        );
        m.insert("byMonthDay".into(), json!(self.by_month_day));
        m.insert("byMonth".into(), json!(self.by_month));
        m.insert("weekStart".into(), json!(self.week_start));
        Value::Object(m)
    }
}

impl Event {
    pub fn to_json(&self) -> Value {
        json!({
            "uid": self.uid,
            "title": self.title,
            "location": self.location,
            "start": self.start.to_json(),
            "end": self.end.to_json(),
            "rule": self.rule.as_ref().map_or(Value::Null, Rule::to_json),
            "exdates": self.exdates.iter().map(Time::to_json).collect::<Vec<_>>(),
            "recurrenceId": self.recurrence_id.as_ref().map_or(Value::Null, Time::to_json),
        })
    }
}

/* ---------------- dates ---------------- */

/// Days since 1970-01-01 of a civil date (`month` 1-12).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The civil date (year, month 1-12, day) of days since 1970-01-01.
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(month <= 2), month, day)
}

/// `Date.UTC(year, month, day)` for whole numbers: a month or day out of range carries over, and years 0-99 mean 1900-1999.
fn date_utc(year: i64, month0: i64, day: i64) -> i64 {
    let year = if (0..=99).contains(&year) {
        year + 1900
    } else {
        year
    };
    let total = year.saturating_mul(12).saturating_add(month0);
    let (y, m) = (total.div_euclid(12), total.rem_euclid(12));
    days_from_civil(y, m + 1, 1)
        .saturating_add(day - 1)
        .saturating_mul(DAY_MS)
}

/// `Date.UTC(year, month, day)` for numbers that may have a fraction (which is dropped).
fn date_utc_f(year: f64, month0: f64, day: f64) -> i64 {
    date_utc(
        year.trunc() as i64,
        month0.trunc() as i64,
        day.trunc() as i64,
    )
}

struct Civil {
    year: i64,
    month: i64,
    date: i64,
    weekday: i64,
}

/// The UTC fields of a time (`getUTCFullYear`, `getUTCMonth` (0-11), `getUTCDate`, `getUTCDay`).
fn civil(ms: i64) -> Civil {
    let days = ms.div_euclid(DAY_MS);
    let (year, month, date) = civil_from_days(days);
    Civil {
        year,
        month: month - 1,
        date,
        weekday: (days + 4).rem_euclid(7),
    }
}

/// The offset from UTC of a named zone at an instant, ms.
fn named_offset_ms(tz: Tz, utc_ms: i64) -> i64 {
    let Some(at) = chrono::DateTime::from_timestamp_millis(utc_ms) else {
        return 0;
    };
    i64::from(
        tz.offset_from_utc_datetime(&at.naive_utc())
            .fix()
            .local_minus_utc(),
    ) * 1000
}

fn local_offset_ms(local: LocalZone, utc_ms: i64) -> i64 {
    match local {
        LocalZone::Pinned(tz) => named_offset_ms(tz, utc_ms),
        LocalZone::System => {
            let Some(at) = chrono::DateTime::from_timestamp_millis(utc_ms) else {
                return 0;
            };
            i64::from(
                Local
                    .offset_from_utc_datetime(&at.naive_utc())
                    .fix()
                    .local_minus_utc(),
            ) * 1000
        }
    }
}

/// The instant of a local wall time as JavaScript's `new Date(y, m, d, ...)` reads it: the earlier of two instants
/// when the clock repeats, and moved on by the gap when the clock skips.
fn local_to_utc(wall: i64, offset_at: impl Fn(i64) -> i64) -> i64 {
    let before = offset_at(wall - DAY_MS);
    let after = offset_at(wall + DAY_MS);
    let valid = |candidate: i64| offset_at(candidate) == wall - candidate;
    match (valid(wall - before), valid(wall - after)) {
        (true, true) => (wall - before).min(wall - after),
        (true, false) => wall - before,
        (false, true) => wall - after,
        (false, false) => wall - before,
    }
}

/* ---------------- zones ---------------- */

fn tz_names() -> &'static HashMap<String, Tz> {
    static NAMES: OnceLock<HashMap<String, Tz>> = OnceLock::new();
    NAMES.get_or_init(|| {
        TZ_VARIANTS
            .iter()
            .map(|tz| (tz.name().to_ascii_lowercase(), *tz))
            .collect()
    })
}

/// `[+-]HH`, `[+-]HHMM` or `[+-]HH:MM` as a UTC offset in seconds.
fn parse_offset_zone(name: &str) -> Option<i64> {
    let bytes = name.as_bytes();
    let sign = match bytes.first()? {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    let digits: Vec<u8> = bytes[1..].iter().copied().filter(|b| *b != b':').collect();
    let colon_ok = bytes.len() == 6 && bytes[3] == b':' || !bytes.contains(&b':');
    if !colon_ok
        || !digits.iter().all(u8::is_ascii_digit)
        || (digits.len() != 2 && digits.len() != 4)
    {
        return None;
    }
    let num = |from: usize| i64::from((digits[from] - b'0') * 10 + (digits[from + 1] - b'0'));
    let (hours, minutes) = (num(0), if digits.len() == 4 { num(2) } else { 0 });
    (hours <= 23 && minutes <= 59).then_some(sign * (hours * 3600 + minutes * 60))
}

/// A zone name the way `Intl.DateTimeFormat` takes it: an IANA name in any letter case, or a UTC offset.
fn resolve_zone(name: &str) -> Option<ZoneKind> {
    if name == "UTC" {
        return Some(ZoneKind::Utc);
    }
    if let Some(offset) = parse_offset_zone(name) {
        return Some(ZoneKind::Offset(offset));
    }
    tz_names()
        .get(&name.to_ascii_lowercase())
        .map(|tz| ZoneKind::Named(*tz))
}

/// A TZID as a zone, or `None` (then the time is read as the server's local time).
pub fn zone_of(tzid: &str) -> Option<Zone> {
    if tzid.is_empty() {
        return None;
    }
    let name = match WINDOWS_TZ.iter().find(|(windows, _)| *windows == tzid) {
        Some((_, iana)) => (*iana).to_string(),
        None => strip_path_prefix(tzid).to_string(),
    };
    let kind = resolve_zone(&name)?;
    Some(Zone { name, kind })
}

/// `tzid.replace(/^\/[^/]+\/[^/]+\//, "")`: a feed's own `/mozilla.org/20050126_1/` prefix.
fn strip_path_prefix(tzid: &str) -> &str {
    let Some(rest) = tzid.strip_prefix('/') else {
        return tzid;
    };
    let Some((first, rest)) = rest.split_once('/') else {
        return tzid;
    };
    let Some((second, rest)) = rest.split_once('/') else {
        return tzid;
    };
    if first.is_empty() || second.is_empty() {
        return tzid;
    }
    rest
}

/// A wall-clock time (as if it were UTC) in `zone` as a real instant. `None` = the server's local time.
pub fn to_instant(wall: i64, zone: Option<&Zone>, local: LocalZone) -> i64 {
    let Some(zone) = zone else {
        return local_to_utc(wall, |utc| local_offset_ms(local, utc));
    };
    let offset = |utc: i64| match &zone.kind {
        ZoneKind::Utc => 0,
        ZoneKind::Named(tz) => named_offset_ms(*tz, utc),
        ZoneKind::Offset(seconds) => seconds * 1000,
    };
    if zone.kind == ZoneKind::Utc {
        return wall;
    }
    // Two passes settle the offset across a DST change.
    let first = wall - offset(wall);
    wall - offset(first)
}

fn instant(t: &Time, local: LocalZone) -> i64 {
    instant_at(t, t.wall, local)
}

/// The instant of `t`'s zone for another wall time.
fn instant_at(t: &Time, wall: i64, local: LocalZone) -> i64 {
    if t.all_day {
        to_instant(wall, None, local)
    } else {
        to_instant(wall, t.zone.as_ref(), local)
    }
}

/* ---------------- parsing ---------------- */

/// The content lines, unfolded (a line starting with a space or tab continues the one before).
fn lines(text: &str) -> Vec<String> {
    let mut unfolded = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(c) = rest.chars().next() {
        let skip = if rest.starts_with("\r\n") && rest[2..].starts_with([' ', '\t']) {
            3
        } else if rest.starts_with('\n') && rest[1..].starts_with([' ', '\t']) {
            2
        } else {
            unfolded.push(c);
            c.len_utf8()
        };
        rest = &rest[skip..];
    }
    unfolded
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l).to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

pub type Params = BTreeMap<String, String>;

struct Property {
    name: String,
    params: Params,
    value: String,
}

/// "DTSTART;TZID=Europe/Oslo:20261015T090000" as name, parameters and value.
fn property(line: &str) -> Option<Property> {
    // The value starts at the first colon outside a quoted parameter.
    let mut quoted = false;
    let mut at = None;
    for (i, ch) in line.char_indices() {
        if ch == '"' {
            quoted = !quoted;
        } else if ch == ':' && !quoted {
            at = Some(i);
            break;
        }
    }
    let at = at?;
    let mut parts = line[..at].split(';');
    let name = parts.next().unwrap_or("").to_uppercase();
    let mut params = Params::new();
    for p in parts {
        if let Some(eq) = p.find('=').filter(|eq| *eq > 0) {
            let value = &p[eq + 1..];
            let value = value.strip_prefix('"').unwrap_or(value);
            let value = value.strip_suffix('"').unwrap_or(value);
            params.insert(p[..eq].to_uppercase(), value.to_string());
        }
    }
    Some(Property {
        name,
        params,
        value: line[at + 1..].to_string(),
    })
}

/// A text value: `\n` is a line break, `\,` `\;` `\\` are the character, then trimmed.
fn unescape(value: &str) -> String {
    let broken = value.replace("\\n", "\n").replace("\\N", "\n");
    let mut out = String::with_capacity(broken.len());
    let mut chars = broken.chars().peekable();
    while let Some(c) = chars.next() {
        match (c, chars.peek()) {
            ('\\', Some(&next)) if matches!(next, ',' | ';' | '\\') => {
                out.push(next);
                chars.next();
            }
            _ => out.push(c),
        }
    }
    js::trim(&out).to_string()
}

fn digits(s: &[u8]) -> Option<i64> {
    s.iter()
        .all(u8::is_ascii_digit)
        .then(|| s.iter().fold(0, |n, b| n * 10 + i64::from(b - b'0')))
}

/// "20261015T090000Z" / "20261015T090000" / "20261015" as a time, or `None`.
pub fn parse_time(value: &str, params: &Params) -> Option<Time> {
    let b = js::trim(value).as_bytes();
    let (y, mo, d) = (
        digits(b.get(0..4)?)?,
        digits(b.get(4..6)?)?,
        digits(b.get(6..8)?)?,
    );
    let (mut h, mut mi, mut s, mut z) = (None, 0, 0, false);
    match &b[8..] {
        [] => {}
        [b'T', rest @ ..] => {
            h = Some(digits(rest.get(0..2)?)?);
            mi = digits(rest.get(2..4)?)?;
            let mut tail = &rest[4..];
            if tail.len() >= 2 && tail[0].is_ascii_digit() {
                s = digits(&tail[..2])?;
                tail = &tail[2..];
            }
            match tail {
                [] => {}
                [b'Z'] => z = true,
                _ => return None,
            }
        }
        _ => return None,
    }
    let all_day = h.is_none() || params.get("VALUE").is_some_and(|v| v == "DATE");
    let wall = date_utc(y, mo - 1, d) + (h.unwrap_or(0) * 3600 + mi * 60 + s) * 1000;
    let zone = if z {
        Some(Zone {
            name: "UTC".into(),
            kind: ZoneKind::Utc,
        })
    } else if all_day {
        None
    } else {
        params.get("TZID").and_then(|tzid| zone_of(tzid))
    };
    Some(Time {
        wall,
        zone,
        all_day,
    })
}

/// "PT1H30M" / "P1D" as ms, or 0.
fn duration(value: &str) -> i64 {
    let t = js::trim(value);
    let (negative, rest) = match t.as_bytes().first() {
        Some(b'+') => (false, &t[1..]),
        Some(b'-') => (true, &t[1..]),
        _ => (false, t),
    };
    let Some(mut rest) = rest.strip_prefix('P') else {
        return 0;
    };
    let take = |rest: &mut &str, unit: char| -> Option<f64> {
        let end = rest.find(|c: char| !c.is_ascii_digit())?;
        if end == 0 || !rest[end..].starts_with(unit) {
            return None;
        }
        let n = rest[..end].parse::<f64>().ok()?;
        *rest = &rest[end + 1..];
        Some(n)
    };
    let weeks = take(&mut rest, 'W');
    let days = take(&mut rest, 'D');
    let (mut hours, mut minutes, mut seconds) = (None, None, None);
    if let Some(time) = rest.strip_prefix('T') {
        rest = time;
        hours = take(&mut rest, 'H');
        minutes = take(&mut rest, 'M');
        seconds = take(&mut rest, 'S');
    }
    if !rest.is_empty() {
        return 0;
    }
    let ms = ((weeks.unwrap_or(0.0) * 7.0 + days.unwrap_or(0.0)) * 24.0 * 3600.0
        + hours.unwrap_or(0.0) * 3600.0
        + minutes.unwrap_or(0.0) * 60.0
        + seconds.unwrap_or(0.0))
        * 1000.0;
    if negative {
        -(ms as i64)
    } else {
        ms as i64
    }
}

const WEEKDAYS: [&str; 7] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

fn parse_by_day(item: &str) -> Option<ByDay> {
    let day = WEEKDAYS.iter().position(|d| item.ends_with(d))?;
    let n = &item[..item.len() - 2];
    let digits_part = n.strip_prefix(['+', '-']).unwrap_or(n);
    if !n.is_empty() && (digits_part.is_empty() || !digits_part.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    // "0MO" counts as every Monday, like no number.
    Some(ByDay {
        n: if n.is_empty() {
            0.0
        } else {
            n.parse().unwrap_or(0.0)
        },
        day: day as i64,
    })
}

fn parse_rule(value: &str) -> Option<Rule> {
    let mut parts: HashMap<String, &str> = HashMap::new();
    for p in value.split(';') {
        let mut kv = p.split('=');
        if let (Some(k), Some(v), None) = (kv.next(), kv.next(), kv.next()) {
            parts.insert(k.to_uppercase(), v);
        }
    }
    let freq = match *parts.get("FREQ")? {
        "DAILY" => Freq::Daily,
        "WEEKLY" => Freq::Weekly,
        "MONTHLY" => Freq::Monthly,
        "YEARLY" => Freq::Yearly,
        _ => return None,
    };
    let list = |key: &str| -> Vec<&str> {
        parts
            .get(key)
            .map_or(vec![], |v| v.split(',').filter(|s| !s.is_empty()).collect())
    };
    let numbers = |key: &str| -> Vec<f64> {
        list(key)
            .into_iter()
            .map(js::string_to_number)
            .filter(|n| n.is_finite())
            .collect()
    };
    let interval = js::string_to_number(parts.get("INTERVAL").copied().unwrap_or(""));
    let interval = if interval.is_nan() || interval == 0.0 {
        1.0
    } else {
        interval
    };
    Some(Rule {
        freq,
        interval: interval.clamp(1.0, MAX_INTERVAL) as i64,
        count: parts
            .get("COUNT")
            .filter(|v| !v.is_empty())
            .map(|v| js::string_to_number(v)),
        until: parts
            .get("UNTIL")
            .filter(|v| !v.is_empty())
            .map(|v| parse_time(v, &Params::new())),
        by_day: list("BYDAY").into_iter().filter_map(parse_by_day).collect(),
        by_month_day: numbers("BYMONTHDAY"),
        by_month: numbers("BYMONTH"),
        week_start: WEEKDAYS
            .iter()
            .position(|d| *d == parts.get("WKST").copied().unwrap_or("MO"))
            .map_or(-1, |i| i as i64),
    })
}

#[derive(Default)]
struct Draft {
    uid: Option<String>,
    title: Option<String>,
    location: Option<String>,
    status: Option<String>,
    start: Option<Time>,
    end: Option<Time>,
    duration: Option<i64>,
    rule: Option<Rule>,
    exdates: Vec<Time>,
    recurrence_id: Option<Time>,
}

impl Draft {
    fn finish(self) -> Option<Event> {
        let start = self.start?;
        if self.status.as_deref() == Some("CANCELLED") {
            return None;
        }
        let end = self
            .end
            .unwrap_or_else(|| match self.duration.filter(|d| *d != 0) {
                Some(d) => start.with_wall(start.wall + d),
                None => start.with_wall(start.wall + if start.all_day { DAY_MS } else { 0 }),
            });
        let title = self.title.unwrap_or_default();
        Some(Event {
            uid: self
                .uid
                .unwrap_or_else(|| format!("{}:{title}", start.wall)),
            title,
            location: self.location.unwrap_or_default(),
            start,
            end,
            rule: self.rule,
            exdates: self.exdates,
            recurrence_id: self.recurrence_id,
        })
    }

    fn set(&mut self, p: Property) {
        match p.name.as_str() {
            "UID" => self.uid = Some(js::trim(&p.value).to_string()),
            "SUMMARY" => self.title = Some(unescape(&p.value)),
            "LOCATION" => self.location = Some(unescape(&p.value)),
            "STATUS" => self.status = Some(js::trim(&p.value).to_uppercase()),
            "DTSTART" => self.start = parse_time(&p.value, &p.params).or(self.start.take()),
            "DTEND" => self.end = parse_time(&p.value, &p.params).or(self.end.take()),
            "DURATION" => self.duration = Some(duration(&p.value)),
            "RRULE" => self.rule = parse_rule(&p.value),
            "EXDATE" => self
                .exdates
                .extend(p.value.split(',').filter_map(|v| parse_time(v, &p.params))),
            "RECURRENCE-ID" => {
                self.recurrence_id = parse_time(&p.value, &p.params).or(self.recurrence_id.take())
            }
            _ => {}
        }
    }
}

/// The VEVENTs of a feed.
pub fn parse_ics(text: &str) -> Vec<Event> {
    let mut events = Vec::new();
    let mut cur: Option<Draft> = None;
    for line in lines(text) {
        let Some(p) = property(&line) else { continue };
        if p.name == "BEGIN" && p.value.to_uppercase() == "VEVENT" {
            cur = Some(Draft::default());
        } else if let Some(draft) = cur.as_mut() {
            if p.name == "END" && p.value.to_uppercase() == "VEVENT" {
                events.extend(cur.take().and_then(Draft::finish));
            } else {
                draft.set(p);
            }
        }
    }
    events
}

/* ---------------- expansion ---------------- */

/// The day-of-month of each `weekday` in a month: [first, second, ...].
fn weekdays_of_month(year: f64, month0: f64, weekday: i64) -> Vec<f64> {
    let mut out = Vec::new();
    for d in 1..=31 {
        let c = civil(date_utc_f(year, month0, f64::from(d)));
        if c.month as f64 != month0 {
            break;
        }
        if c.weekday == weekday {
            out.push(f64::from(d));
        }
    }
    out
}

/// The candidate starts (walls) of one period of the rule, ascending.
fn period_starts(rule: &Rule, start: i64, period: i64) -> Vec<i64> {
    let s = civil(start);
    let time = start - date_utc(s.year, s.month, s.date);
    let at = |y: f64, m: f64, d: f64| date_utc_f(y, m, d).saturating_add(time);
    let shift = period.saturating_mul(rule.interval);
    match rule.freq {
        Freq::Daily => {
            let t = start.saturating_add(shift.saturating_mul(DAY_MS));
            // BYDAY on a daily rule keeps only those weekdays (FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR).
            if !rule.by_day.is_empty() && !rule.by_day.iter().any(|b| b.day == civil(t).weekday) {
                vec![]
            } else {
                vec![t]
            }
        }
        Freq::Weekly => {
            // The week (from WKST) holding the start, moved `period` intervals on.
            let base = start - (s.weekday - rule.week_start + 7) % 7 * DAY_MS
                + shift.saturating_mul(7 * DAY_MS);
            let days: Vec<i64> = if rule.by_day.is_empty() {
                vec![s.weekday]
            } else {
                rule.by_day.iter().map(|b| b.day).collect()
            };
            let mut out: Vec<i64> = days
                .iter()
                .map(|day| base + (day - rule.week_start + 7) % 7 * DAY_MS)
                .collect();
            out.sort_unstable();
            out
        }
        Freq::Monthly | Freq::Yearly => {
            let months: Vec<f64> = if rule.freq == Freq::Monthly {
                vec![s.month as f64 + shift as f64]
            } else {
                let base: Vec<f64> = if rule.by_month.is_empty() {
                    vec![s.month as f64]
                } else {
                    rule.by_month.iter().map(|m| m - 1.0).collect()
                };
                base.into_iter().map(|m| m + 12.0 * shift as f64).collect()
            };
            let mut out = Vec::new();
            for mm in months {
                let y = s.year as f64 + (mm / 12.0).floor();
                let m = ((mm % 12.0) + 12.0) % 12.0;
                if rule.by_day.is_empty() {
                    let days = if rule.by_month_day.is_empty() {
                        vec![s.date as f64]
                    } else {
                        rule.by_month_day.clone()
                    };
                    for d in days {
                        let last = civil(date_utc_f(y, m + 1.0, 0.0)).date as f64;
                        let day = if d < 0.0 { last + d + 1.0 } else { d };
                        // A day the month does not have (the 31st) is skipped, as RFC 5545 says.
                        if day >= 1.0 && day <= last {
                            out.push(at(y, m, day));
                        }
                    }
                    continue;
                }
                for b in &rule.by_day {
                    let all = weekdays_of_month(y, m, b.day);
                    let picked: Vec<f64> = if b.n == 0.0 {
                        all
                    } else {
                        let index = if b.n > 0.0 {
                            b.n - 1.0
                        } else {
                            all.len() as f64 + b.n
                        };
                        (index >= 0.0 && index.fract() == 0.0)
                            .then(|| all.get(index as usize).copied())
                            .flatten()
                            .into_iter()
                            .collect()
                    };
                    out.extend(picked.into_iter().map(|d| at(y, m, d)));
                }
            }
            out.sort_unstable();
            out
        }
    }
}

/// The earliest wall a period of a monthly or yearly rule can hold: the first of its first month.
fn period_begin(rule: &Rule, start: i64, period: i64) -> i64 {
    let s = civil(start);
    let shift = period.saturating_mul(rule.interval);
    let mm = if rule.freq == Freq::Monthly {
        s.month.saturating_add(shift)
    } else {
        shift.saturating_mul(12)
    };
    date_utc(
        s.year.saturating_add(mm.div_euclid(12)),
        mm.rem_euclid(12),
        1,
    )
}

/// The start walls of a recurring event up to `to_wall`, from its start (so COUNT is right) and until UNTIL (an
/// instant). A period with no match (a daily rule's weekend) still counts as a step.
fn expand(ev: &Event, rule: &Rule, to_wall: i64, local: LocalZone) -> Vec<i64> {
    let mut out = Vec::new();
    // A date-only UNTIL includes that whole day.
    let until = match &rule.until {
        Some(Some(u)) => instant(u, local) + if u.all_day { DAY_MS - 1 } else { 0 },
        _ => i64::MAX,
    };
    let mut n = 0.0;
    for period in 0..MAX_STEPS as i64 {
        let starts = period_starts(rule, ev.start.wall, period);
        // A period with no match (a month without the 31st) is skipped, not the end of the rule.
        let first = if rule.freq == Freq::Daily {
            ev.start
                .wall
                .saturating_add(period.saturating_mul(rule.interval).saturating_mul(DAY_MS))
        } else {
            starts
                .first()
                .copied()
                .unwrap_or_else(|| period_begin(rule, ev.start.wall, period))
        };
        if first > to_wall {
            break;
        }
        for t in starts {
            if t < ev.start.wall {
                continue;
            }
            if t > to_wall || instant_at(&ev.start, t, local) > until {
                return out;
            }
            n += 1.0;
            if rule.count.is_some_and(|count| n > count) {
                return out;
            }
            out.push(t);
        }
    }
    out
}

/// The occurrences overlapping [from, to] (unix ms), soonest first.
pub fn occurrences(events: &[Event], from: i64, to: i64, local: LocalZone) -> Vec<Occurrence> {
    // Overrides and EXDATEs may be written in UTC against a zoned start: compare instants.
    let overrides: HashSet<(&str, i64)> = events
        .iter()
        .filter_map(|ev| {
            ev.recurrence_id
                .as_ref()
                .map(|r| (ev.uid.as_str(), instant(r, local)))
        })
        .collect();
    let mut out = Vec::new();
    let mut push = |ev: &Event, start: i64, end: i64| {
        if end <= from || start > to {
            return;
        }
        out.push(Occurrence {
            id: format!("{}|{start}", ev.uid),
            title: if ev.title.is_empty() {
                "Event".into()
            } else {
                ev.title.clone()
            },
            location: (!ev.location.is_empty()).then(|| ev.location.clone()),
            start,
            end,
            all_day: ev.start.all_day,
        });
    };
    for ev in events {
        let rule = match (&ev.rule, &ev.recurrence_id) {
            (Some(rule), None) => rule,
            _ => {
                push(ev, instant(&ev.start, local), instant(&ev.end, local));
                continue;
            }
        };
        let length = ev.end.wall - ev.start.wall;
        // Expand in wall time a day past `to` (zones), then convert each start.
        let skip: HashSet<i64> = ev.exdates.iter().map(|t| instant(t, local)).collect();
        for wall in expand(ev, rule, to.saturating_add(2 * DAY_MS), local) {
            let start = instant_at(&ev.start, wall, local);
            if skip.contains(&start) || overrides.contains(&(ev.uid.as_str(), start)) {
                continue;
            }
            push(ev, start, instant_at(&ev.end, wall + length, local));
        }
    }
    out.sort_by_key(|o| o.start);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const OSLO: LocalZone = LocalZone::Pinned(chrono_tz::Europe::Oslo);

    fn feed(events: &[&[&str]]) -> String {
        let mut lines = vec!["BEGIN:VCALENDAR".to_string(), "VERSION:2.0".to_string()];
        for e in events {
            lines.push("BEGIN:VEVENT".into());
            lines.extend(e.iter().map(|l| l.to_string()));
            lines.push("END:VEVENT".into());
        }
        lines.push("END:VCALENDAR".into());
        lines.join("\r\n")
    }

    fn at(iso: &str) -> i64 {
        chrono::DateTime::parse_from_rfc3339(iso)
            .unwrap()
            .timestamp_millis()
    }

    fn days(list: &[Occurrence]) -> Vec<String> {
        list.iter()
            .map(|o| js::iso_string(o.start)[..10].to_string())
            .collect()
    }

    #[test]
    fn date_arithmetic_matches_date_utc() {
        assert_eq!(date_utc(2026, 9, 15), at("2026-10-15T00:00:00Z"));
        // A month and a day out of range carry over; years 0-99 are 1900-1999.
        assert_eq!(date_utc(2026, 13, 1), at("2027-02-01T00:00:00Z"));
        assert_eq!(date_utc(2026, 0, 0), at("2025-12-31T00:00:00Z"));
        assert_eq!(date_utc(50, 0, 1), at("1950-01-01T00:00:00Z"));
        assert_eq!(civil(at("2026-10-15T08:00:00Z")).weekday, 4);
    }

    #[test]
    fn converts_wall_times_across_dst_and_resolves_zone_names() {
        let oslo = zone_of("Europe/Oslo");
        assert_eq!(
            to_instant(at("2026-07-01T09:00:00Z"), oslo.as_ref(), OSLO),
            at("2026-07-01T07:00:00Z")
        );
        assert_eq!(
            to_instant(at("2026-12-01T09:00:00Z"), oslo.as_ref(), OSLO),
            at("2026-12-01T08:00:00Z")
        );
        assert_eq!(
            zone_of("W. Europe Standard Time").unwrap().name,
            "Europe/Berlin"
        );
        assert_eq!(zone_of("europe/oslo").unwrap().name, "europe/oslo");
        assert_eq!(
            zone_of("/mozilla.org/20050126_1/Europe/Berlin")
                .unwrap()
                .name,
            "Europe/Berlin"
        );
        assert!(zone_of("Not/AZone").is_none());
        assert_eq!(
            to_instant(at("2026-07-01T09:00:00Z"), zone_of("+02:00").as_ref(), OSLO),
            at("2026-07-01T07:00:00Z")
        );
    }

    #[test]
    fn reads_local_times_like_a_javascript_date() {
        // Oslo skips 02:00-03:00 on 29 March (moved on by the gap) and repeats 02:00-03:00 on 25 October (the first).
        assert_eq!(
            to_instant(at("2026-03-29T02:30:00Z"), None, OSLO),
            at("2026-03-29T01:30:00Z")
        );
        assert_eq!(
            to_instant(at("2026-10-25T02:30:00Z"), None, OSLO),
            at("2026-10-25T00:30:00Z")
        );
        assert_eq!(
            to_instant(at("2026-07-01T12:00:00Z"), None, OSLO),
            at("2026-07-01T10:00:00Z")
        );
    }

    #[test]
    fn parses_times() {
        let none = Params::new();
        let t = parse_time("20261015T090000Z", &none).unwrap();
        assert_eq!(
            (t.wall, t.zone.as_ref().map(|z| z.name.as_str()), t.all_day),
            (at("2026-10-15T09:00:00Z"), Some("UTC"), false)
        );
        let zoned = Params::from([("TZID".to_string(), "Europe/Oslo".to_string())]);
        assert_eq!(
            parse_time("20261015T090000", &zoned)
                .unwrap()
                .zone
                .unwrap()
                .name,
            "Europe/Oslo"
        );
        let date = Params::from([("VALUE".to_string(), "DATE".to_string())]);
        assert!(parse_time("20261015", &date).unwrap().all_day);
        assert!(parse_time("garbage", &none).is_none());
        assert!(parse_time("20261015T09", &none).is_none());
        assert_eq!(
            parse_time("20261015T0900", &none).unwrap().wall,
            at("2026-10-15T09:00:00Z")
        );
    }

    #[test]
    fn lists_single_events_soonest_first_and_skips_cancelled_ones() {
        let events = parse_ics(&feed(&[
            &[
                "UID:b",
                "SUMMARY:Later",
                "DTSTART:20261016T120000Z",
                "DTEND:20261016T130000Z",
            ],
            &[
                "UID:a",
                "SUMMARY:Standup\\, daily",
                "LOCATION:Room 1",
                "DTSTART:20261015T090000Z",
                "DURATION:PT15M",
            ],
            &[
                "UID:c",
                "SUMMARY:Gone",
                "STATUS:CANCELLED",
                "DTSTART:20261015T100000Z",
            ],
            &[
                "UID:d",
                "SUMMARY:Past",
                "DTSTART:20261001T100000Z",
                "DTEND:20261001T110000Z",
            ],
        ]));
        let from = at("2026-10-15T00:00:00Z");
        let list = occurrences(&events, from, from + 3 * DAY_MS, OSLO);
        assert_eq!(
            list.iter().map(|o| o.title.as_str()).collect::<Vec<_>>(),
            ["Standup, daily", "Later"]
        );
        assert_eq!(
            (list[0].end, list[0].location.as_deref()),
            (at("2026-10-15T09:15:00Z"), Some("Room 1"))
        );
    }

    #[test]
    fn expands_a_weekly_rule_with_byday_exdate_and_an_override() {
        let events = parse_ics(&feed(&[
            &[
                "UID:w",
                "SUMMARY:Sync",
                "DTSTART;TZID=Europe/Oslo:20261005T100000",
                "DTEND;TZID=Europe/Oslo:20261005T103000",
                "RRULE:FREQ=WEEKLY;BYDAY=MO,TH",
                "EXDATE;TZID=Europe/Oslo:20261019T100000",
            ],
            &[
                "UID:w",
                "SUMMARY:Sync (moved)",
                "RECURRENCE-ID;TZID=Europe/Oslo:20261015T100000",
                "DTSTART;TZID=Europe/Oslo:20261015T140000",
                "DTEND;TZID=Europe/Oslo:20261015T143000",
            ],
        ]));
        let from = at("2026-10-15T00:00:00Z");
        let list = occurrences(&events, from, from + 8 * DAY_MS, OSLO);
        let seen: Vec<_> = list
            .iter()
            .map(|o| (o.title.as_str(), js::iso_string(o.start)))
            .collect();
        assert_eq!(
            seen,
            [
                ("Sync (moved)", "2026-10-15T12:00:00.000Z".to_string()),
                ("Sync", "2026-10-22T08:00:00.000Z".to_string())
            ]
        );
    }

    #[test]
    fn honours_count_until_and_interval() {
        let from = at("2026-10-15T00:00:00Z");
        let to = from + 3 * DAY_MS;
        let run = |rule: &str, start: &str| {
            days(&occurrences(
                &parse_ics(&feed(&[&["UID:x", "SUMMARY:X", start, rule]])),
                from,
                to,
                OSLO,
            ))
        };
        assert_eq!(
            run("RRULE:FREQ=DAILY;COUNT=3", "DTSTART:20261014T080000Z"),
            ["2026-10-15", "2026-10-16"]
        );
        assert_eq!(
            run(
                "RRULE:FREQ=DAILY;UNTIL=20261016",
                "DTSTART:20261015T080000Z"
            ),
            ["2026-10-15", "2026-10-16"]
        );
        assert_eq!(
            run("RRULE:FREQ=DAILY;INTERVAL=2", "DTSTART:20261015T080000Z"),
            ["2026-10-15", "2026-10-17"]
        );
    }

    #[test]
    fn skips_a_month_without_the_day_and_waits_for_a_leap_year() {
        let thirty_first = parse_ics(&feed(&[&[
            "UID:31",
            "SUMMARY:31",
            "DTSTART:20261031T080000Z",
            "RRULE:FREQ=MONTHLY;BYMONTHDAY=31",
        ]]));
        let list = occurrences(
            &thirty_first,
            at("2026-11-01T00:00:00Z"),
            at("2027-01-31T23:00:00Z"),
            OSLO,
        );
        assert_eq!(days(&list), ["2026-12-31", "2027-01-31"]);
        let leap = parse_ics(&feed(&[&[
            "UID:29",
            "SUMMARY:29",
            "DTSTART:20240229T080000Z",
            "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
        ]]));
        assert_eq!(
            days(&occurrences(
                &leap,
                at("2025-01-01T00:00:00Z"),
                at("2028-12-31T00:00:00Z"),
                OSLO
            )),
            ["2028-02-29"]
        );
    }

    #[test]
    fn expands_weekday_only_daily_and_monthly_nth_weekday_rules() {
        let weekdays = parse_ics(&feed(&[&[
            "UID:d",
            "SUMMARY:D",
            "DTSTART:20261016T080000Z",
            "RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
        ]]));
        let from = at("2026-10-15T00:00:00Z");
        assert_eq!(
            days(&occurrences(&weekdays, from, from + 5 * DAY_MS, OSLO)),
            ["2026-10-16", "2026-10-19"]
        );
        let last_friday = parse_ics(&feed(&[&[
            "UID:m",
            "SUMMARY:M",
            "DTSTART:20260925T080000Z",
            "RRULE:FREQ=MONTHLY;BYDAY=-1FR",
        ]]));
        assert_eq!(
            days(&occurrences(&last_friday, from, from + 20 * DAY_MS, OSLO)),
            ["2026-10-30"]
        );
    }

    #[test]
    fn unfolds_lines_and_marks_all_day_events() {
        let from = at("2026-10-15T00:00:00Z");
        let folded = parse_ics(&feed(&[&[
            "UID:x",
            "SUMMARY:A very",
            "  long title",
            "DTSTART:20261015T090000Z",
        ]]));
        assert_eq!(
            occurrences(&folded, from, from + 3 * DAY_MS, OSLO)[0].title,
            "A very long title"
        );
        let holiday = parse_ics(&feed(&[&[
            "UID:h",
            "SUMMARY:Holiday",
            "DTSTART;VALUE=DATE:20261016",
            "DTEND;VALUE=DATE:20261017",
        ]]));
        let list = occurrences(&holiday, from, from + 3 * DAY_MS, OSLO);
        assert_eq!(
            (list.len(), list[0].all_day, list[0].start),
            (1, true, at("2026-10-15T22:00:00Z"))
        );
    }
}
