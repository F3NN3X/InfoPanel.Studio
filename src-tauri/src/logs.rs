// The settings page's log viewer: the last lines of a log, then only what was appended since a
// cursor, starting over when the file was rotated.

use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

/// Lines a first read (or a read after a rotation) returns.
pub const TAIL_LINES: usize = 2000;
/// Bytes a cursor remembers from the start of the file, to notice a new file of the same name.
const HEAD_BYTES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// server.log: the bundled server's output.
    Server,
    /// app.log without the studio's lines.
    App,
    /// The app.log lines `log_frontend` writes (target `studio`).
    Studio,
}

impl Source {
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "server" => Some(Source::Server),
            "app" => Some(Source::App),
            "studio" => Some(Source::Studio),
            _ => None,
        }
    }

    fn file_name(self) -> &'static str {
        match self {
            Source::Server => "server.log",
            Source::App | Source::Studio => "app.log",
        }
    }

    pub fn file(self, log_dir: &Path) -> PathBuf {
        log_dir.join(self.file_name())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct LogChunk {
    pub lines: Vec<String>,
    /// Pass back to get only the lines appended after these.
    pub cursor: String,
    pub file: String,
    /// The file was rotated or shrank since the cursor: `lines` is the new file's tail.
    pub reset: bool,
}

/// Where a read stopped: the byte offset, a hash of the file's first bytes, and whether the last
/// line read belongs to a studio line (so a continuation line in the next read follows it).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cursor {
    pub offset: u64,
    pub head: u64,
    pub studio: bool,
}

impl Cursor {
    pub fn parse(text: &str) -> Option<Self> {
        let mut parts = text.split('-');
        let offset = parts.next()?.parse().ok()?;
        let head = u64::from_str_radix(parts.next()?, 16).ok()?;
        let studio = match parts.next()? {
            "0" => false,
            "1" => true,
            _ => return None,
        };
        parts.next().is_none().then_some(Self {
            offset,
            head,
            studio,
        })
    }

    pub fn format(&self) -> String {
        format!("{}-{:x}-{}", self.offset, self.head, u8::from(self.studio))
    }
}

/// FNV-1a: stable across runs, unlike the std hasher.
fn hash(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

/// The hash of the file's first `HEAD_BYTES` bytes, or of its first `upto` when that is less.
fn head_hash(file: &mut File, upto: u64) -> std::io::Result<u64> {
    let mut head = vec![0; (HEAD_BYTES as u64).min(upto) as usize];
    file.seek(SeekFrom::Start(0))?;
    file.read_exact(&mut head)?;
    Ok(hash(&head))
}

/// The complete lines of `bytes` and how many bytes they take; a last line without its newline
/// is left for the next read.
pub fn complete_lines(bytes: &[u8]) -> (Vec<String>, usize) {
    let Some(end) = bytes.iter().rposition(|b| *b == b'\n') else {
        return (Vec::new(), 0);
    };
    let lines = String::from_utf8_lossy(&bytes[..end])
        .split('\n')
        .map(|l| l.trim_end_matches('\r').to_owned())
        .collect();
    (lines, end + 1)
}

/// The target of an app.log line, `[date][time][target][LEVEL] message`; None for a
/// continuation line.
pub fn line_target(line: &str) -> Option<&str> {
    let mut rest = line.strip_prefix('[')?;
    for _ in 0..2 {
        rest = rest.split_once("][")?.1;
    }
    Some(rest.split_once(']')?.0)
}

/// The lines of `source`; a continuation line (a multi-line message) goes with the line before.
/// `studio` says whether the line before the first one was a studio line; the result carries the
/// same for the last one.
pub fn filter(source: Source, lines: Vec<String>, mut studio: bool) -> (Vec<String>, bool) {
    if source == Source::Server {
        return (lines, false);
    }
    let kept = lines
        .into_iter()
        .filter(|l| {
            if let Some(target) = line_target(l) {
                studio = target == "studio";
            }
            studio == (source == Source::Studio)
        })
        .collect();
    (kept, studio)
}

fn tail(mut lines: Vec<String>, n: usize) -> Vec<String> {
    let start = lines.len().saturating_sub(n);
    lines.drain(..start);
    lines
}

/// Reads `source` from `log_dir`: the last 2000 lines without a cursor (or when the file is not
/// the one the cursor was for), the lines appended since it otherwise.
pub fn read(log_dir: &Path, source: Source, cursor: Option<&str>) -> std::io::Result<LogChunk> {
    let path = source.file(log_dir);
    let file_text = crate::paths::display(&path);
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LogChunk {
                lines: Vec::new(),
                cursor: Cursor {
                    offset: 0,
                    head: 0,
                    studio: false,
                }
                .format(),
                file: file_text,
                reset: cursor.is_some(),
            });
        }
        Err(e) => return Err(e),
    };
    let len = file.metadata()?.len();
    let given = cursor.is_some();
    let cursor = cursor.and_then(Cursor::parse);
    // The cursor is for this file while it has not shrunk and starts with the same bytes.
    let same = match cursor {
        Some(c) if c.offset <= len => head_hash(&mut file, c.offset)? == c.head,
        _ => false,
    };
    // A cursor that does not parse (an older format, junk) starts over too.
    let reset = given && !same;
    let from = if same {
        cursor.map_or(0, |c| c.offset)
    } else {
        0
    };
    file.seek(SeekFrom::Start(from))?;
    let mut bytes = Vec::new();
    file.by_ref().take(len - from).read_to_end(&mut bytes)?;
    let (lines, used) = complete_lines(&bytes);
    let carried = same && cursor.is_some_and(|c| c.studio);
    let (lines, studio) = filter(source, lines, carried);
    let mut lines = tail(lines, TAIL_LINES);
    // A fresh server.log after a rotation holds few lines; the one before it has the rest.
    if source == Source::Server && cursor.is_none() && lines.len() < TAIL_LINES {
        let older = std::fs::read(log_dir.join("server.1.log")).unwrap_or_default();
        let (mut previous, _) = complete_lines(&older);
        previous.extend(lines);
        lines = tail(previous, TAIL_LINES);
    }
    let offset = from + used as u64;
    Ok(LogChunk {
        lines,
        cursor: Cursor {
            offset,
            head: head_hash(&mut file, offset)?,
            studio,
        }
        .format(),
        file: file_text,
        reset,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ips-logs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn append(path: &Path, text: &str) {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        f.write_all(text.as_bytes()).unwrap();
    }

    #[test]
    fn cursor_round_trips() {
        for studio in [false, true] {
            let c = Cursor {
                offset: 1234,
                head: 0xdead_beef,
                studio,
            };
            assert_eq!(Cursor::parse(&c.format()), Some(c));
        }
        assert_eq!(Cursor::parse("nope"), None);
        assert_eq!(Cursor::parse("12-zz-0"), None);
        assert_eq!(Cursor::parse("12-ff"), None);
        assert_eq!(Cursor::parse("12-ff-2"), None);
        assert_eq!(Cursor::parse("12-ff-1-x"), None);
    }

    #[test]
    fn only_complete_lines_are_taken() {
        let (lines, used) = complete_lines(b"a\r\nb\nhalf");
        assert_eq!(lines, vec!["a", "b"]);
        assert_eq!(used, 5);
        assert_eq!(complete_lines(b"half"), (Vec::new(), 0));
    }

    #[test]
    fn app_and_studio_lines_split_by_target() {
        let lines: Vec<String> = [
            "[2026-10-20][01:11:54][infopanel_studio_lib::commands][DEBUG] ipc: report_metrics",
            "[2026-10-20][01:11:55][studio][ERROR] boom",
            "    | at line 2",
            "[2026-10-20][01:11:56][infopanel_studio_lib][INFO] quitting",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert_eq!(line_target(&lines[1]), Some("studio"));
        assert_eq!(line_target(&lines[2]), None);
        let (studio, _) = filter(Source::Studio, lines.clone(), false);
        assert_eq!(studio.len(), 2);
        assert!(studio[1].contains("at line 2"));
        let (app, last) = filter(Source::App, lines.clone(), false);
        assert_eq!(app.len(), 2);
        assert!(app[1].ends_with("quitting"));
        assert!(!last);
        assert_eq!(filter(Source::Server, lines.clone(), false).0.len(), 4);
        // A continuation line at the start goes with the line before it.
        let (_, last) = filter(Source::Studio, lines[..2].to_vec(), false);
        assert!(last);
        let rest = lines[2..3].to_vec();
        assert_eq!(filter(Source::Studio, rest.clone(), true).0.len(), 1);
        assert_eq!(filter(Source::App, rest, true).0.len(), 0);
    }

    #[test]
    fn tail_then_only_new_lines() {
        let dir = temp_dir("tail");
        let file = dir.join("server.log");
        for i in 0..2500 {
            append(&file, &format!("line {i}\n"));
        }
        let first = read(&dir, Source::Server, None).unwrap();
        assert_eq!(first.lines.len(), TAIL_LINES);
        assert_eq!(first.lines.last().unwrap(), "line 2499");
        assert!(!first.reset);
        assert!(first.file.ends_with("server.log"));
        let none = read(&dir, Source::Server, Some(&first.cursor)).unwrap();
        assert!(none.lines.is_empty());
        append(&file, "next\nhalf");
        let next = read(&dir, Source::Server, Some(&none.cursor)).unwrap();
        assert_eq!(next.lines, vec!["next"]);
        append(&file, " done\n");
        let rest = read(&dir, Source::Server, Some(&next.cursor)).unwrap();
        assert_eq!(rest.lines, vec!["half done"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_continuation_across_reads_keeps_its_source() {
        let dir = temp_dir("carry");
        let file = dir.join("app.log");
        append(&file, "[d][t][studio][ERROR] boom\n");
        let studio = read(&dir, Source::Studio, None).unwrap();
        let app = read(&dir, Source::App, None).unwrap();
        append(
            &file,
            "    | at line 2\n[d][t][infopanel_studio_lib][INFO] next\n",
        );
        let studio = read(&dir, Source::Studio, Some(&studio.cursor)).unwrap();
        assert_eq!(studio.lines, vec!["    | at line 2"]);
        let app = read(&dir, Source::App, Some(&app.cursor)).unwrap();
        assert_eq!(app.lines, vec!["[d][t][infopanel_studio_lib][INFO] next"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_rotated_or_shrunk_file_starts_over() {
        let dir = temp_dir("rotate");
        let file = dir.join("app.log");
        append(
            &file,
            "[d][t][infopanel_studio_lib][INFO] first run, a long enough line\n",
        );
        let first = read(&dir, Source::App, None).unwrap();
        assert_eq!(first.lines.len(), 1);
        // Rotated: a new file of the same name, longer than the old offset.
        std::fs::rename(&file, dir.join("app_old.log")).unwrap();
        append(
            &file,
            "[d][t][infopanel_studio_lib][INFO] second run, also quite a long line\n",
        );
        append(&file, "[d][t][infopanel_studio_lib][INFO] and more\n");
        let after = read(&dir, Source::App, Some(&first.cursor)).unwrap();
        assert!(after.reset);
        assert_eq!(after.lines.len(), 2);
        // Shrunk below the cursor.
        std::fs::write(&file, "[d][t][x][INFO] short\n").unwrap();
        let shrunk = read(&dir, Source::App, Some(&after.cursor)).unwrap();
        assert!(shrunk.reset);
        assert_eq!(shrunk.lines, vec!["[d][t][x][INFO] short"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_cursor_that_does_not_parse_starts_over() {
        let dir = temp_dir("badcursor");
        append(&dir.join("server.log"), "one\ntwo\n");
        for bad in ["12-ff", "junk", ""] {
            let chunk = read(&dir, Source::Server, Some(bad)).unwrap();
            assert!(chunk.reset, "{bad:?}");
            assert_eq!(chunk.lines, vec!["one", "two"]);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_file_is_empty() {
        let dir = temp_dir("missing");
        let chunk = read(&dir, Source::Studio, None).unwrap();
        assert!(chunk.lines.is_empty());
        assert!(!chunk.reset);
        assert!(Source::parse("sensor").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
