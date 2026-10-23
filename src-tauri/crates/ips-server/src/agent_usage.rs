// Token use of the coding agents, from their own session files, for the Agents widget (server/agent-usage.mjs):
//   Claude Code  ~/.claude/projects/<project>/<session>.jsonl   assistant lines' `message.usage`
//                (one request's usage repeats on several lines: counted once per `requestId`)
//   Codex        ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl   `event_msg` `token_count` lines:
//                `info.total_token_usage` (cumulative per session) and `rate_limits`
//
// Tokens are also split by project and by model. A session's project is its first cwd (a later `cd` into a subfolder does
// not move it), and a worktree counts as its repo. Only the project folder's name and the short model id are kept, never
// the path; only numbers and timestamps are kept, the text of a line is parsed and dropped. Files are read from where the
// last scan stopped, so an active session costs only its new lines. Files untouched for longer than the history are skipped.

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use std::time::{Duration, SystemTime};

use serde_json::{json, Map, Value};

use crate::agents::{num, project_of, slice16};
use crate::ical::LocalZone;
use crate::js_date::{day_key, parse_date};
use crate::json::parse as parse_json;

/// Days of history kept (the widget's graph).
pub const HISTORY_DAYS: f64 = 35.0;
/// The time between scans.
pub const SCAN: Duration = Duration::from_secs(60);
/// Bytes read at a time; a long file is read in steps.
pub const CHUNK: usize = 8 * 1024 * 1024;
const DAY_MS: f64 = 86_400_000.0;

fn n(v: Option<&Value>) -> f64 {
    v.and_then(Value::as_f64).filter(|x| *x > 0.0).unwrap_or(0.0)
}

/// A model's short id: no `claude-` prefix or `-YYYYMMDD` date ("claude-opus-5-5" is "opus-5-5"); "" if unknown.
pub fn model_of(id: Option<&Value>) -> String {
    let Some(id) = id.and_then(Value::as_str).filter(|s| *s != "<synthetic>") else { return String::new() };
    let id = id.strip_prefix("claude-").unwrap_or(id);
    let bytes = id.as_bytes();
    let dated = bytes.len() >= 9 && bytes[bytes.len() - 9] == b'-' && bytes[bytes.len() - 8..].iter().all(u8::is_ascii_digit);
    slice16(if dated { &id[..id.len() - 9] } else { id }, 40)
}

/// A cwd with an agent worktree (`<repo>/.claude/worktrees/<name>`) as its repo.
pub fn root_of(cwd: Option<&Value>) -> Option<Value> {
    let Some(Value::String(path)) = cwd else { return cwd.cloned() };
    const MARK: &str = "/.claude/worktrees/";
    let slashes: Vec<usize> = path.char_indices().filter(|(_, c)| matches!(c, '\\' | '/')).map(|(i, _)| i).collect();
    // `[\\/]\.claude[\\/]worktrees[\\/].*$`: the first spot whose rest holds no line break.
    let cut = slashes.into_iter().find(|&i| {
        let Some(rest) = path.get(i..i + MARK.len()) else { return false };
        let normal = rest.replace('\\', "/");
        normal == MARK && !path[i + MARK.len()..].contains(['\n', '\r', '\u{2028}', '\u{2029}'])
    });
    Some(Value::String(cut.map_or_else(|| path.clone(), |i| path[..i].to_string())))
}

/// Tokens by kind.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Tokens {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
    pub cache_write: f64,
}

impl Tokens {
    fn add(self, b: Self) -> Self {
        Self { input: self.input + b.input, output: self.output + b.output, cache_read: self.cache_read + b.cache_read, cache_write: self.cache_write + b.cache_write }
    }

    fn sub(self, b: Self) -> Self {
        Self { input: (self.input - b.input).max(0.0), output: (self.output - b.output).max(0.0), cache_read: (self.cache_read - b.cache_read).max(0.0), cache_write: (self.cache_write - b.cache_write).max(0.0) }
    }

    fn total(self) -> f64 {
        self.input + self.output + self.cache_read + self.cache_write
    }

    pub fn to_json(self) -> Value {
        json!({ "input": num(self.input), "output": num(self.output), "cacheRead": num(self.cache_read), "cacheWrite": num(self.cache_write) })
    }
}

/// A Claude transcript line: request id, time, tokens, project and model.
#[derive(Debug, Clone, PartialEq)]
pub struct ClaudeLine {
    pub id: Option<String>,
    pub at: f64,
    pub tokens: Tokens,
    pub project: String,
    pub model: String,
}

impl ClaudeLine {
    pub fn to_json(&self) -> Value {
        let t = self.tokens;
        json!({ "id": self.id, "at": num(self.at), "input": num(t.input), "output": num(t.output), "cacheRead": num(t.cache_read), "cacheWrite": num(t.cache_write), "project": self.project, "model": self.model })
    }
}

/// A Claude transcript line's request id, day, tokens, project and model, or `None`.
pub fn claude_line(line: &str, zone: LocalZone) -> Option<ClaudeLine> {
    let j = parse_json(line)?;
    let message = j.get("message")?;
    let u = message.get("usage").filter(|u| u.is_object() || u.is_array())?;
    if j.get("type").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    let at = parse_date(j.get("timestamp")?.as_str()?, zone)?;
    let id = j.get("requestId").and_then(Value::as_str).or_else(|| message.get("id").and_then(Value::as_str)).map(String::from);
    Some(ClaudeLine {
        id,
        at,
        tokens: Tokens { input: n(u.get("input_tokens")), output: n(u.get("output_tokens")), cache_read: n(u.get("cache_read_input_tokens")), cache_write: n(u.get("cache_creation_input_tokens")) },
        project: project_of(root_of(j.get("cwd")).as_ref()),
        model: model_of(message.get("model")),
    })
}

/// A Codex rollout's project (`session_meta`) or project and model (`turn_context`), or `None`.
pub fn codex_context(line: &str) -> Option<(String, String)> {
    let j = parse_json(line)?;
    let kind = j.get("type").and_then(Value::as_str).filter(|t| matches!(*t, "session_meta" | "turn_context"))?;
    let payload = j.get("payload");
    let project = project_of(root_of(payload.and_then(|p| p.get("cwd"))).as_ref());
    let model = if kind == "turn_context" { model_of(payload.and_then(|p| p.get("model"))) } else { String::new() };
    Some((project, model))
}

/// A Codex rollout line's time, cumulative tokens and rate limits.
#[derive(Debug, Clone, PartialEq)]
pub struct CodexLine {
    pub at: f64,
    pub total: Option<Tokens>,
    pub limits: Value,
}

impl CodexLine {
    pub fn to_json(&self) -> Value {
        json!({ "at": num(self.at), "total": self.total.map(Tokens::to_json), "limits": self.limits })
    }
}

fn truthy(v: &Value) -> bool {
    match v {
        Value::Null | Value::Bool(false) => false,
        Value::Number(x) => x.as_f64().is_some_and(|x| x != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}

/// A Codex rollout line's cumulative tokens and rate limits (a `token_count` event), or `None`.
pub fn codex_line(line: &str, zone: LocalZone) -> Option<CodexLine> {
    let j = parse_json(line)?;
    let payload = j.get("payload")?;
    if j.get("type").and_then(Value::as_str) != Some("event_msg") || payload.get("type").and_then(Value::as_str) != Some("token_count") {
        return None;
    }
    let at = parse_date(j.get("timestamp")?.as_str()?, zone)?;
    let total = payload.get("info").and_then(|i| i.get("total_token_usage")).filter(|t| truthy(t)).map(|t| Tokens {
        input: n(t.get("input_tokens")) - n(t.get("cached_input_tokens")),
        output: n(t.get("output_tokens")),
        cache_read: n(t.get("cached_input_tokens")),
        cache_write: n(t.get("cache_write_input_tokens")),
    });
    Some(CodexLine { at, total, limits: payload.get("rate_limits").filter(|l| !l.is_null()).cloned().unwrap_or(Value::Null) })
}

/// `a.localeCompare(b)` for the names shown: punctuation, then digits, then letters, case apart only when all else is equal.
pub fn locale_compare(a: &str, b: &str) -> Ordering {
    const PUNCT: &str = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$";
    let primary = |c: char| -> (u8, u32) {
        if let Some(i) = PUNCT.find(c) {
            (0, i as u32)
        } else if c.is_ascii_digit() {
            (1, c as u32)
        } else if c.is_alphabetic() {
            (2, c.to_lowercase().next().map_or(c as u32, |l| l as u32))
        } else {
            (0, 1000 + c as u32)
        }
    };
    let keys = |s: &str| s.chars().map(primary).collect::<Vec<_>>();
    keys(a).cmp(&keys(b)).then_with(|| {
        // Tertiary: lowercase before uppercase at the first difference.
        a.chars().zip(b.chars()).find(|(x, y)| x != y).map_or(Ordering::Equal, |(x, y)| if x.is_lowercase() && y.is_uppercase() { Ordering::Less } else { Ordering::Greater })
    })
}

type Split = (HashMap<String, f64>, HashMap<String, f64>);

/// What one transcript file has added up to.
#[derive(Default)]
struct FileUsage {
    offset: u64,
    days: BTreeMap<String, Tokens>,
    split: BTreeMap<String, Split>,
    /// Claude: the requests counted.
    seen: HashSet<String>,
    /// Codex: the last cumulative total.
    last: Tokens,
    project: String,
    model: String,
}

fn bump(split: &mut Split, project: &str, model: &str, amount: f64) {
    *split.0.entry(project.into()).or_default() += amount;
    *split.1.entry(model.into()).or_default() += amount;
}

/// The new complete lines of a file since `offset` (read at most `chunk` bytes), and the offset after them.
fn new_lines(file: &Path, offset: u64, size: u64, chunk: usize) -> std::io::Result<(Vec<String>, u64)> {
    let length = size.saturating_sub(offset).min(chunk as u64) as usize;
    if length == 0 {
        return Ok((Vec::new(), offset));
    }
    let mut buf = vec![0u8; length];
    let mut f = std::fs::File::open(file)?;
    f.seek(SeekFrom::Start(offset))?;
    let read = f.read(&mut buf)?;
    buf.truncate(read);
    let Some(end) = buf.iter().rposition(|b| *b == b'\n') else { return Ok((Vec::new(), offset)) };
    let lines = buf[..end].split(|b| *b == b'\n').map(|l| String::from_utf8_lossy(l).into_owned()).collect();
    Ok((lines, offset + end as u64 + 1))
}

/// Every .jsonl under `dir` changed since `since` (ms), recursively, as (path, size, mtime ms).
fn jsonl_files(dir: &Path, since: f64, depth: u32) -> Vec<(PathBuf, u64, f64)> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .filter_map(Result::ok)
        .flat_map(|e| {
            let path = e.path();
            if e.file_type().is_ok_and(|t| t.is_dir()) {
                return if depth > 0 { jsonl_files(&path, since, depth - 1) } else { Vec::new() };
            }
            if !e.file_name().to_string_lossy().ends_with(".jsonl") {
                return Vec::new();
            }
            let Ok(meta) = std::fs::metadata(&path) else { return Vec::new() };
            let mtime = meta.modified().ok().and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok()).map_or(0.0, |d| d.as_secs_f64() * 1000.0);
            if mtime >= since { vec![(path, meta.len(), mtime)] } else { Vec::new() }
        })
        .collect()
}

/// What a scan keeps between runs.
#[derive(Default)]
struct Scanner {
    files: HashMap<String, FileUsage>,
    limits: Option<Value>,
    limits_at: f64,
}

#[derive(Default)]
struct Published {
    totals: Option<Value>,
    limits: Option<Value>,
    limits_at: f64,
}

/// The usage reader. `totals()` is the last scan's result (cheap, for every publish): per agent the tokens today, over the
/// history, and per day; `codex_limits()` Codex's newest rate limits.
pub struct AgentUsage {
    claude_dir: PathBuf,
    codex_dir: PathBuf,
    now: Box<dyn Fn() -> f64 + Send + Sync>,
    zone: LocalZone,
    chunk: usize,
    scanner: Mutex<Scanner>,
    published: Mutex<Published>,
}

fn clock() -> f64 {
    SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map_or(0.0, |d| d.as_millis() as f64)
}

impl AgentUsage {
    /// The reader of the agents' folders under `home`.
    pub fn new(home: &Path) -> Self {
        Self::with(home, Box::new(clock), LocalZone::System, CHUNK)
    }

    /// The same with a clock, a local zone and a read size of the caller's choosing (tests).
    pub fn with(home: &Path, now: Box<dyn Fn() -> f64 + Send + Sync>, zone: LocalZone, chunk: usize) -> Self {
        Self {
            claude_dir: home.join(".claude").join("projects"),
            codex_dir: home.join(".codex").join("sessions"),
            now,
            zone,
            chunk,
            scanner: Mutex::new(Scanner::default()),
            published: Mutex::new(Published::default()),
        }
    }

    pub fn totals(&self) -> Value {
        self.published.lock().unwrap_or_else(PoisonError::into_inner).totals.clone().unwrap_or_else(|| json!({}))
    }

    pub fn codex_limits(&self) -> Option<Value> {
        self.published.lock().unwrap_or_else(PoisonError::into_inner).limits.clone()
    }

    /// When Codex reported `codex_limits()`, ms (`None` before any).
    pub fn codex_limits_at(&self) -> Option<f64> {
        let at = self.published.lock().unwrap_or_else(PoisonError::into_inner).limits_at;
        (at != 0.0).then_some(at)
    }

    /// Reads what the files gained and rebuilds the totals. `false` when a scan is already running.
    pub fn scan(&self) -> bool {
        let Ok(mut scanner) = self.scanner.try_lock() else { return false };
        let since = (self.now)() - HISTORY_DAYS * DAY_MS;
        for (file, size, _) in jsonl_files(&self.claude_dir, since, 4) {
            // A file being written or removed is read on the next scan.
            let _ = self.read_claude(&mut scanner, &file, size);
        }
        for (file, size, _) in jsonl_files(&self.codex_dir, since, 4) {
            let _ = self.read_codex(&mut scanner, &file, size);
        }
        let claude = self.summarize(&scanner, &self.claude_dir);
        let codex = self.summarize(&scanner, &self.codex_dir);
        let mut result = Map::new();
        result.extend(claude.map(|c| ("claude".to_string(), c)));
        result.extend(codex.map(|c| ("codex".to_string(), c)));
        let mut published = self.published.lock().unwrap_or_else(PoisonError::into_inner);
        *published = Published { totals: Some(Value::Object(result)), limits: scanner.limits.clone(), limits_at: scanner.limits_at };
        true
    }

    fn read_claude(&self, scanner: &mut Scanner, file: &Path, size: u64) -> std::io::Result<()> {
        let key = file.to_string_lossy().into_owned();
        let mut f = scanner.files.remove(&key).filter(|f| size >= f.offset).unwrap_or_default();
        loop {
            let (lines, offset) = match new_lines(file, f.offset, size, self.chunk) {
                Ok(read) => read,
                Err(e) => {
                    scanner.files.insert(key, f);
                    return Err(e);
                }
            };
            for line in lines {
                let Some(u) = claude_line(&line, self.zone) else { continue };
                // An empty id counts as none, as `u.id &&` does.
                let id = u.id.filter(|id| !id.is_empty());
                if id.as_ref().is_some_and(|id| f.seen.contains(id)) {
                    continue;
                }
                if let Some(id) = id {
                    f.seen.insert(id);
                }
                let day = day_key(u.at, self.zone);
                let day_total = f.days.entry(day.clone()).or_default();
                *day_total = day_total.add(u.tokens);
                if f.project.is_empty() {
                    f.project = u.project;
                }
                let project = f.project.clone();
                bump(f.split.entry(day).or_default(), &project, &u.model, u.tokens.total());
            }
            let moved = offset > f.offset;
            f.offset = offset;
            if !moved || offset >= size {
                break;
            }
        }
        scanner.files.insert(key, f);
        Ok(())
    }

    fn read_codex(&self, scanner: &mut Scanner, file: &Path, size: u64) -> std::io::Result<()> {
        let key = file.to_string_lossy().into_owned();
        let mut f = scanner.files.remove(&key).filter(|f| size >= f.offset).unwrap_or_default();
        loop {
            let (lines, offset) = match new_lines(file, f.offset, size, self.chunk) {
                Ok(read) => read,
                Err(e) => {
                    scanner.files.insert(key, f);
                    return Err(e);
                }
            };
            for line in lines {
                if line.contains("\"session_meta\"") || line.contains("\"turn_context\"") {
                    if let Some((project, model)) = codex_context(&line) {
                        if f.project.is_empty() {
                            f.project = project;
                        }
                        if !model.is_empty() {
                            f.model = model;
                        }
                    }
                    continue;
                }
                let Some(c) = codex_line(&line, self.zone) else { continue };
                if let Some(total) = c.total {
                    let day = day_key(c.at, self.zone);
                    let delta = total.sub(f.last);
                    let day_total = f.days.entry(day.clone()).or_default();
                    *day_total = day_total.add(delta);
                    let (project, model) = (f.project.clone(), f.model.clone());
                    bump(f.split.entry(day).or_default(), &project, &model, delta.total());
                    f.last = total;
                }
                if truthy(&c.limits) && c.at >= scanner.limits_at {
                    scanner.limits = Some(c.limits);
                    scanner.limits_at = c.at;
                }
            }
            let moved = offset > f.offset;
            f.offset = offset;
            if !moved || offset >= size {
                break;
            }
        }
        scanner.files.insert(key, f);
        Ok(())
    }

    /// One agent's totals, or `None` without data in the history.
    fn summarize(&self, scanner: &Scanner, dir: &Path) -> Option<Value> {
        let prefix = dir.to_string_lossy().into_owned();
        let mine: Vec<&FileUsage> = scanner.files.iter().filter(|(file, _)| file.starts_with(&prefix)).map(|(_, f)| f).collect();
        let now = (self.now)();
        let today = day_key(now, self.zone);
        let from = now - HISTORY_DAYS * DAY_MS;
        let mut days: BTreeMap<String, Tokens> = BTreeMap::new();
        for f in &mine {
            for (day, t) in &f.days {
                if parse_date(&format!("{day}T12:00:00"), self.zone).is_some_and(|noon| noon >= from) {
                    let slot = days.entry(day.clone()).or_default();
                    *slot = slot.add(*t);
                }
            }
        }
        if days.is_empty() {
            return None;
        }
        let split = |wanted: &[String]| -> Option<Value> {
            let (mut projects, mut models): Split = Default::default();
            for f in &mine {
                for (day, (p, m)) in &f.split {
                    if wanted.contains(day) {
                        p.iter().for_each(|(k, v)| *projects.entry(k.clone()).or_default() += v);
                        m.iter().for_each(|(k, v)| *models.entry(k.clone()).or_default() += v);
                    }
                }
            }
            let ranked = |m: HashMap<String, f64>| {
                let mut list: Vec<(String, f64)> = m.into_iter().filter(|(name, t)| !name.is_empty() && *t > 0.0).collect();
                list.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| locale_compare(&a.0, &b.0)));
                list.into_iter().map(|(name, total)| json!({ "name": name, "total": num(total) })).collect::<Vec<_>>()
            };
            let (mut p, m) = (ranked(projects), ranked(models));
            p.truncate(5);
            (!p.is_empty() || !m.is_empty()).then(|| json!({ "projects": p, "models": m }))
        };
        let last_days: Vec<String> = (0..7).map(|i| day_key(now - f64::from(i) * DAY_MS, self.zone)).collect();
        let (today_split, week_split) = (split(std::slice::from_ref(&today)), split(&last_days));
        let list: Vec<Value> = days.iter().map(|(day, t)| {
            let mut entry = Map::new();
            entry.insert("day".into(), day.clone().into());
            entry.extend(t.to_json().as_object().cloned().unwrap_or_default());
            entry.insert("total".into(), num(t.total()));
            Value::Object(entry)
        }).collect();
        let history: f64 = days.values().map(|t| t.total()).sum();
        let mut out = Map::new();
        out.insert("today".into(), num(days.get(&today).map_or(0.0, |t| t.total())));
        out.insert("history".into(), num(history));
        out.insert("days".into(), Value::Array(list));
        if week_split.is_some() {
            let mut breakdown = Map::new();
            breakdown.extend(today_split.map(|t| ("today".to_string(), t)));
            breakdown.extend(week_split.map(|w| ("week".to_string(), w)));
            out.insert("breakdown".into(), Value::Object(breakdown));
        }
        Some(Value::Object(out))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::stringify;
    use chrono_tz::Europe::Oslo;

    const ZONE: LocalZone = LocalZone::Pinned(Oslo);
    /// 2026-10-15 12:00 in Oslo.
    const NOW: f64 = 1_792_058_400_000.0;

    fn assistant(id: &str, ts: &str, usage: Value) -> String {
        json!({ "type": "assistant", "requestId": id, "timestamp": ts, "message": { "model": "m", "content": [{ "type": "text", "text": "secret" }], "usage": usage } }).to_string()
    }

    fn token_count(ts: &str, total: Value, limits: Value) -> String {
        json!({ "timestamp": ts, "type": "event_msg", "payload": { "type": "token_count", "info": if total.is_null() { Value::Null } else { json!({ "total_token_usage": total }) }, "rate_limits": limits } }).to_string()
    }

    fn at(days_ago: i64) -> String {
        crate::js::iso_string(NOW as i64 - days_ago * 86_400_000)
    }

    fn reader(home: &Path, chunk: usize) -> AgentUsage {
        AgentUsage::with(home, Box::new(|| NOW), ZONE, chunk)
    }

    fn write(path: &Path, lines: &[String]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, lines.join("\n") + "\n").unwrap();
    }

    #[test]
    fn reads_an_assistant_line_and_skips_everything_else() {
        let u = claude_line(&assistant("r1", "2026-10-15T10:00:00Z", json!({ "input_tokens": 10, "output_tokens": 5, "cache_read_input_tokens": 100, "cache_creation_input_tokens": 20 })), ZONE).unwrap();
        assert_eq!(u.to_json(), json!({ "id": "r1", "at": 1_792_058_400_000_i64, "input": 10, "output": 5, "cacheRead": 100, "cacheWrite": 20, "project": "", "model": "m" }));
        assert_eq!(claude_line(r#"{"type":"user","timestamp":"2026-10-15T10:00:00Z","message":{"content":"hi"}}"#, ZONE), None);
        assert_eq!(claude_line("{not json", ZONE), None);
        assert_eq!(claude_line(&assistant("r", "not a date", json!({})), ZONE), None);
        // Negative, non-numeric and fractional counts.
        let t = claude_line(&assistant("r", "2026-10-15T10:00:00Z", json!({ "input_tokens": -3, "output_tokens": "9", "cache_read_input_tokens": 1.5 })), ZONE).unwrap().tokens;
        assert_eq!(t, Tokens { input: 0.0, output: 0.0, cache_read: 1.5, cache_write: 0.0 });
    }

    #[test]
    fn falls_back_to_the_message_id_for_the_request_id() {
        let line = json!({ "type": "assistant", "timestamp": "2026-10-15T10:00:00Z", "message": { "id": "m1", "usage": {} } }).to_string();
        assert_eq!(claude_line(&line, ZONE).unwrap().id.as_deref(), Some("m1"));
    }

    #[test]
    fn reads_a_codex_token_count_with_the_cached_tokens_split_out() {
        let c = codex_line(&token_count("2026-10-15T10:00:00Z", json!({ "input_tokens": 100, "cached_input_tokens": 60, "output_tokens": 7 }), json!({ "primary": { "used_percent": 3 } })), ZONE).unwrap();
        assert_eq!(c.total, Some(Tokens { input: 40.0, output: 7.0, cache_read: 60.0, cache_write: 0.0 }));
        assert_eq!(c.limits, json!({ "primary": { "used_percent": 3 } }));
        assert_eq!(codex_line(r#"{"type":"event_msg","payload":{"type":"agent_message"}}"#, ZONE), None);
        assert_eq!(codex_line(&token_count("2026-10-15T10:00:00Z", Value::Null, Value::Null), ZONE).unwrap().total, None);
    }

    #[test]
    fn shortens_model_ids_and_finds_a_worktrees_repo() {
        let m = |s: &str| model_of(Some(&json!(s)));
        assert_eq!([m("claude-opus-5-5"), m("claude-sonnet-5-5-20260901"), m("gpt-5.5"), m("<synthetic>"), model_of(None)], ["opus-5-5", "sonnet-5-5", "gpt-5.5", "", ""]);
        assert_eq!(m(&"x".repeat(60)).len(), 40);
        let root = |s: &str| root_of(Some(&json!(s))).unwrap();
        assert_eq!(root("E:\\GitHub\\repo\\.claude\\worktrees\\agent-a1"), json!("E:\\GitHub\\repo"));
        assert_eq!(root("/w/repo/.claude/worktrees/x/y"), json!("/w/repo"));
        assert_eq!(root("/w/repo/.claude/worktrees"), json!("/w/repo/.claude/worktrees"));
        assert_eq!(root("/w/repo/.claude/worktrees/a\nb"), json!("/w/repo/.claude/worktrees/a\nb"));
    }

    #[test]
    fn reads_codex_context_lines() {
        assert_eq!(codex_context(r#"{"type":"session_meta","payload":{"cwd":"C:\\work\\proj"}}"#), Some(("proj".into(), String::new())));
        assert_eq!(codex_context(r#"{"type":"turn_context","payload":{"cwd":"/home/me/proj","model":"gpt-5.5"}}"#), Some(("proj".into(), "gpt-5.5".into())));
        assert_eq!(codex_context(r#"{"type":"event_msg","payload":{}}"#), None);
        assert_eq!(codex_context("{nope"), None);
    }

    #[test]
    fn compares_names_like_the_locale_does() {
        let mut names = ["b", "Z", "aB", "A", "ab-", "a-b", "1", "ab", "a b", "_x", "B", "a"];
        names.sort_by(|a, b| locale_compare(a, b));
        assert_eq!(names, ["_x", "1", "a", "A", "a b", "a-b", "ab", "aB", "ab-", "b", "B", "Z"]);
    }

    #[test]
    fn sums_tokens_per_day_counts_a_request_once_and_reads_appended_lines_only() {
        let home = tempfile::tempdir().unwrap();
        let u = json!({ "input_tokens": 1, "output_tokens": 2, "cache_read_input_tokens": 3, "cache_creation_input_tokens": 4 });
        let file = home.path().join(".claude/projects/E--repo/s1.jsonl");
        write(&file, &[assistant("a", &at(1), u.clone()), assistant("b", &at(0), u.clone()), assistant("b", &at(0), u.clone())]);
        let rollout = home.path().join(".codex/sessions/2026/10/15/rollout-1.jsonl");
        write(&rollout, &[token_count(&at(0), json!({ "input_tokens": 10, "output_tokens": 1 }), Value::Null), token_count(&at(0), json!({ "input_tokens": 30, "output_tokens": 4 }), json!({ "primary": { "used_percent": 9, "window_minutes": 300 } }))]);
        let usage = reader(home.path(), CHUNK);
        assert!(usage.scan());
        let totals = usage.totals();
        assert_eq!(stringify(&totals["claude"]), stringify(&json!({
            "today": 10, "history": 20,
            "days": [
                { "day": "2026-10-14", "input": 1, "output": 2, "cacheRead": 3, "cacheWrite": 4, "total": 10 },
                { "day": "2026-10-15", "input": 1, "output": 2, "cacheRead": 3, "cacheWrite": 4, "total": 10 },
            ],
            "breakdown": { "today": { "projects": [], "models": [{ "name": "m", "total": 10 }] }, "week": { "projects": [], "models": [{ "name": "m", "total": 20 }] } },
        })));
        // Codex's totals are cumulative: the day gets the last one (30 + 4), not their sum.
        assert_eq!(totals["codex"]["today"], json!(34));
        assert_eq!(usage.codex_limits(), Some(json!({ "primary": { "used_percent": 9, "window_minutes": 300 } })));
        assert_eq!(usage.codex_limits_at(), parse_date(&at(0), ZONE));
        // A line appended later counts; one without its newline yet waits.
        let mut text = std::fs::read_to_string(&file).unwrap();
        text += &(assistant("c", &at(0), u.clone()) + "\n" + &assistant("d", &at(0), u));
        std::fs::write(&file, text).unwrap();
        usage.scan();
        assert_eq!(usage.totals()["claude"]["today"], json!(20));
    }

    #[test]
    fn reads_a_file_in_small_steps_and_restarts_one_that_shrank() {
        let home = tempfile::tempdir().unwrap();
        let file = home.path().join(".claude/projects/x/s.jsonl");
        let lines: Vec<String> = (0..6).map(|i| assistant(&format!("r{i}"), &at(0), json!({ "input_tokens": 1 }))).collect();
        write(&file, &lines);
        let usage = reader(home.path(), 400);
        usage.scan();
        assert_eq!(usage.totals()["claude"]["today"], json!(6));
        write(&file, &lines[..2]);
        usage.scan();
        assert_eq!(usage.totals()["claude"]["today"], json!(2));
    }

    #[test]
    fn splits_tokens_by_project_and_model_sorted_and_capped_without_paths() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join(".claude/projects/x");
        let line = |id: &str, ts: String, cwd: &str, model: &str, tokens: u32| json!({ "type": "assistant", "requestId": id, "timestamp": ts, "cwd": cwd, "message": { "model": model, "usage": { "input_tokens": tokens } } }).to_string();
        let mut rows = vec![
            line("1", at(0), "E:\\GitHub\\alpha", "claude-opus-5-5", 100),
            line("2", at(0), "E:\\GitHub\\beta", "claude-sonnet-5-5-20260901", 30),
            line("3", at(3), "E:\\GitHub\\beta", "claude-sonnet-5-5", 50),
            line("4", at(10), "E:\\GitHub\\alpha", "claude-opus-5-5", 999),
            line("5", at(0), "E:\\GitHub\\gone", "<synthetic>", 7),
            line("6", at(0), "", "claude-opus-5-5", 5),
        ];
        rows.extend(["p1", "p2", "p3", "p4", "p5"].iter().enumerate().map(|(i, p)| line(&format!("m{i}"), at(0), &format!("/w/{p}"), "claude-haiku-5", 1)));
        // A session per row: a session's project is its first cwd.
        for (i, row) in rows.iter().enumerate() {
            write(&dir.join(format!("s{i}.jsonl")), std::slice::from_ref(row));
        }
        let meta = json!({ "type": "session_meta", "payload": { "cwd": "C:\\work\\cx" } }).to_string();
        let turn = json!({ "type": "turn_context", "payload": { "cwd": "C:\\work\\cx", "model": "gpt-5.5" } }).to_string();
        write(&home.path().join(".codex/sessions/2026/10/15/rollout-1.jsonl"), &[meta, turn, token_count(&at(0), json!({ "input_tokens": 20 }), Value::Null), token_count(&at(0), json!({ "input_tokens": 50 }), Value::Null)]);
        let usage = reader(home.path(), CHUNK);
        usage.scan();
        let totals = usage.totals();
        let names = |v: &Value| v.as_array().unwrap().iter().map(|e| (e["name"].as_str().unwrap().to_string(), e["total"].as_i64().unwrap())).collect::<Vec<_>>();
        let today = &totals["claude"]["breakdown"]["today"];
        assert_eq!(names(&today["projects"]), [("alpha".into(), 100), ("beta".into(), 30), ("gone".into(), 7), ("p1".into(), 1), ("p2".into(), 1)]);
        assert_eq!(names(&today["models"]), [("opus-5-5".into(), 105), ("sonnet-5-5".into(), 30), ("haiku-5".into(), 5)]);
        let week = &totals["claude"]["breakdown"]["week"];
        assert_eq!(names(&week["projects"])[..2], [("alpha".into(), 100), ("beta".into(), 80)]);
        assert_eq!(week["projects"].as_array().unwrap().len(), 5);
        assert_eq!(totals["codex"]["breakdown"]["today"], json!({ "projects": [{ "name": "cx", "total": 50 }], "models": [{ "name": "gpt-5.5", "total": 50 }] }));
        let out = stringify(&totals);
        for leak in ["GitHub", "work", "/w/", "\"\""] {
            assert!(!out.contains(leak), "{leak}");
        }
    }

    #[test]
    fn keeps_a_session_under_its_first_cwd_and_a_worktree_under_its_repo() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join(".claude/projects/x");
        let line = |id: &str, cwd: &str| json!({ "type": "assistant", "requestId": id, "timestamp": at(0), "cwd": cwd, "message": { "model": "claude-opus-5-5", "usage": { "input_tokens": 10 } } }).to_string();
        write(&dir.join("s1.jsonl"), &[line("1", "E:\\GitHub\\repo"), line("2", "E:\\GitHub\\repo\\src-tauri")]);
        write(&dir.join("s1/subagents/agent-a1.jsonl"), &[line("3", "E:\\GitHub\\repo\\.claude\\worktrees\\agent-a1")]);
        let usage = reader(home.path(), CHUNK);
        usage.scan();
        assert_eq!(usage.totals()["claude"]["breakdown"]["today"]["projects"], json!([{ "name": "repo", "total": 30 }]));
    }

    #[test]
    fn is_empty_without_agent_folders_and_skips_files_older_than_the_history() {
        let home = tempfile::tempdir().unwrap();
        let usage = reader(home.path(), CHUNK);
        usage.scan();
        assert_eq!(usage.totals(), json!({}));
        assert_eq!(usage.codex_limits(), None);
        // A file touched long ago is not read.
        let old = home.path().join(".claude/projects/x/old.jsonl");
        write(&old, &[assistant("r", &at(0), json!({ "input_tokens": 1 }))]);
        let far_future = AgentUsage::with(home.path(), Box::new(|| NOW + 400.0 * DAY_MS), ZONE, CHUNK);
        far_future.scan();
        assert_eq!(far_future.totals(), json!({}));
    }
}
