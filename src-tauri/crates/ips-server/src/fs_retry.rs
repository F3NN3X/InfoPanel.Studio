// Renames that survive Windows briefly denying a just-written file or folder (the indexer or antivirus holds a handle).

use std::io;
use std::path::Path;
use std::thread::sleep;
use std::time::Duration;

const TRIES: u32 = 10;
const FIRST_WAIT_MS: u64 = 5;
const LONGEST_WAIT_MS: u64 = 50;

/// Whether `e` is Windows refusing a rename that will likely work a moment later: access denied (5), sharing
/// violation (32) or lock violation (33).
fn is_transient(e: &io::Error) -> bool {
    cfg!(windows) && (e.kind() == io::ErrorKind::PermissionDenied || matches!(e.raw_os_error(), Some(5 | 32 | 33)))
}

/// `std::fs::rename`, retried with a short backoff (at most ~10 tries, under 500 ms) while Windows denies it.
/// Any other error, and every error off Windows, is returned at once.
pub fn rename(from: &Path, to: &Path) -> io::Result<()> {
    rename_with(|| std::fs::rename(from, to), |ms| sleep(Duration::from_millis(ms)))
}

fn rename_with(mut attempt: impl FnMut() -> io::Result<()>, mut wait: impl FnMut(u64)) -> io::Result<()> {
    let mut pause = FIRST_WAIT_MS;
    for _ in 1..TRIES {
        match attempt() {
            Err(e) if is_transient(&e) => {
                wait(pause);
                pause = (pause * 2).min(LONGEST_WAIT_MS);
            }
            done => return done,
        }
    }
    attempt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    fn failing(code: i32, times: u32) -> impl FnMut() -> io::Result<()> {
        let mut left = times;
        move || {
            if left == 0 {
                return Ok(());
            }
            left -= 1;
            Err(io::Error::from_raw_os_error(code))
        }
    }

    #[cfg(windows)]
    #[test]
    fn retries_access_denied_and_sharing_and_lock_violations() {
        for code in [5, 32, 33] {
            let mut waits = 0;
            assert!(rename_with(failing(code, 3), |_| waits += 1).is_ok(), "code {code}");
            assert_eq!(waits, 3);
        }
    }

    #[cfg(windows)]
    #[test]
    fn gives_up_after_the_bound_with_the_last_error() {
        let (mut calls, mut total) = (0, 0);
        let err = rename_with(
            || {
                calls += 1;
                Err(io::Error::from_raw_os_error(5))
            },
            |ms| total += ms,
        )
        .unwrap_err();
        assert_eq!(err.raw_os_error(), Some(5));
        assert_eq!(calls, TRIES);
        assert!(total < 500, "waited {total} ms");
    }

    #[test]
    fn never_retries_other_errors() {
        for e in [io::ErrorKind::NotFound, io::ErrorKind::AlreadyExists, io::ErrorKind::InvalidInput] {
            let mut calls = 0;
            let err = rename_with(
                || {
                    calls += 1;
                    Err(io::Error::from(e))
                },
                |_| panic!("waited"),
            )
            .unwrap_err();
            assert_eq!((err.kind(), calls), (e, 1));
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn never_retries_off_windows() {
        let mut calls = 0;
        let _ = rename_with(
            || {
                calls += 1;
                Err(io::Error::from_raw_os_error(5))
            },
            |_| panic!("waited"),
        );
        assert_eq!(calls, 1);
    }

    #[test]
    fn renames_a_real_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a"), "x").unwrap();
        rename(&dir.path().join("a"), &dir.path().join("b")).unwrap();
        assert!(dir.path().join("b").exists());
        assert_eq!(rename(&dir.path().join("a"), &dir.path().join("c")).unwrap_err().kind(), io::ErrorKind::NotFound);
    }
}
