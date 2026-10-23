// The data folder's file access as the Node server does it: JSON read as UTF-8 (any failure is "absent"), and writes
// to `<file>.tmp` renamed over the file, so a reader never sees half a file.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::json;

/// `fs.readFileSync(file, "utf8")`: invalid UTF-8 reads as U+FFFD.
pub fn read_text(file: &Path) -> io::Result<String> {
    fs::read(file).map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
}

/// The JSON in `file`, or `None` when it is missing or unreadable.
pub fn read_json(file: &Path) -> Option<Value> {
    json::parse(&read_text(file).ok()?)
}

fn tmp_of(file: &Path) -> PathBuf {
    let mut name = file.as_os_str().to_owned();
    name.push(".tmp");
    PathBuf::from(name)
}

/// Writes `bytes` to `<file>.tmp`, then renames it over `file`.
pub fn write_atomic(file: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = tmp_of(file);
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, file)
}
