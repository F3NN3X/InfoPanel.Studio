// The production build (the Node server's `serveStatic`): any path the routes did not take. Dot segments are 404; anything
// else that is not a file under DIST is index.html (the app routes client-side via query strings), with status 200.
// HTML gets the CSP and `no-store`, the rest `no-cache`; no ETag, no Last-Modified, no ranges, no length.

use std::convert::Infallible;
use std::path::{Path, PathBuf, MAIN_SEPARATOR, MAIN_SEPARATOR_STR};

use axum::body::{Body, Bytes};
use axum::http::{Method, Response};
use tokio::io::AsyncReadExt;

use crate::http::{self, Req};
use crate::security_headers::security_headers;

const TYPES: [(&str, &str); 18] = [
    (".html", "text/html; charset=utf-8"),
    (".js", "text/javascript; charset=utf-8"),
    (".css", "text/css; charset=utf-8"),
    (".json", "application/json; charset=utf-8"),
    (".map", "application/json; charset=utf-8"),
    (".svg", "image/svg+xml"),
    (".png", "image/png"),
    (".jpg", "image/jpeg"),
    (".jpeg", "image/jpeg"),
    (".gif", "image/gif"),
    (".webp", "image/webp"),
    (".avif", "image/avif"),
    (".mp4", "video/mp4"),
    (".webm", "video/webm"),
    (".ico", "image/x-icon"),
    (".woff", "font/woff"),
    (".woff2", "font/woff2"),
    (".txt", "text/plain; charset=utf-8"),
];

const CHUNK: usize = 64 * 1024;

/// `decodeURIComponent(s)`, or `None` where it throws (a bad escape, or bytes that are not UTF-8).
pub fn decode_uri_component(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn is_separator(c: char) -> bool {
    c == '/' || (cfg!(windows) && c == '\\')
}

/// `path.join(dist, rel)` when it stays under `dist` (`startsWith(DIST + sep)`), else `None`. On Windows a backslash
/// separates too, so `..\` can climb out; that is the index fallback, as in Node.
pub fn join_under(dist: &Path, rel: &str) -> Option<PathBuf> {
    let dist = dist.to_string_lossy();
    let mut parts: Vec<&str> = dist.split(is_separator).collect();
    for segment in rel.split(is_separator) {
        match segment {
            "" | "." => {}
            ".." => {
                if parts.len() > 1 {
                    parts.pop();
                }
            }
            s => parts.push(s),
        }
    }
    let mut joined = parts.join(MAIN_SEPARATOR_STR);
    if rel.ends_with(is_separator) {
        joined.push(MAIN_SEPARATOR);
    }
    joined
        .starts_with(&format!("{dist}{MAIN_SEPARATOR}"))
        .then(|| PathBuf::from(joined))
}

/// `path.extname(file).toLowerCase()` (trailing separators do not count).
fn extension(file: &str) -> String {
    let file = file.trim_end_matches(is_separator);
    let base = file.rsplit(is_separator).next().unwrap_or(file);
    match base.rfind('.') {
        Some(i) if i > 0 => base[i..].to_lowercase(),
        _ => String::new(),
    }
}

/// The path Node's fs opens for `file` (`path.toNamespacedPath`): on Windows its `\\?\` form without trailing
/// separators, so a trailing dot or space is part of the name rather than dropped.
fn fs_path(file: &str) -> PathBuf {
    if !cfg!(windows) {
        return PathBuf::from(file);
    }
    let file = file.trim_end_matches(is_separator);
    match file.strip_prefix(r"\\") {
        Some(unc) => PathBuf::from(format!(r"\\?\UNC\{unc}")),
        None => PathBuf::from(format!(r"\\?\{file}")),
    }
}

pub fn content_type(file: &str) -> &'static str {
    let ext = extension(file);
    TYPES
        .iter()
        .find(|(e, _)| *e == ext)
        .map_or("application/octet-stream", |(_, t)| t)
}

/// The file's bytes in chunks; a read error ends the response mid-way, as Node destroys it.
fn file_body(file: PathBuf) -> Body {
    let stream =
        futures_util::stream::unfold(Some((file, None::<tokio::fs::File>)), |state| async move {
            let (path, open) = state?;
            let mut handle = match open {
                Some(handle) => handle,
                None => match tokio::fs::File::open(&path).await {
                    Ok(handle) => handle,
                    Err(e) => return Some((Err(e), None)),
                },
            };
            let mut buf = vec![0; CHUNK];
            match handle.read(&mut buf).await {
                Ok(0) => None,
                Ok(n) => {
                    buf.truncate(n);
                    Some((Ok(Bytes::from(buf)), Some((path, Some(handle)))))
                }
                Err(e) => Some((Err(e), None)),
            }
        });
    Body::from_stream(stream)
}

pub fn serve(dist: &Path, req: &Req) -> Result<Response<Body>, String> {
    if req.method != Method::GET && req.method != Method::HEAD {
        return Ok(http::empty(405));
    }
    if !dist.exists() {
        return Ok(http::text(
            503,
            "No build found. Run `npm run build` first.",
        ));
    }
    let decoded = decode_uri_component(&req.path).ok_or("URIError: URI malformed")?;
    let rel = decoded.trim_start_matches('/');
    let rel = if rel.is_empty() { "index.html" } else { rel };
    if rel
        .split('/')
        .any(|seg| seg == ".." || seg.starts_with('.'))
    {
        return Ok(http::empty(404));
    }
    let name = join_under(dist, rel)
        .map(|f| f.to_string_lossy().into_owned())
        .filter(|f| fs_path(f).is_file())
        .unwrap_or_else(|| dist.join("index.html").to_string_lossy().into_owned());
    let is_html = name.ends_with(".html");
    let mut response = Response::builder()
        .status(200)
        .header("Content-Type", content_type(&name))
        // index.html must track the latest build (hashed asset names change).
        .header(
            "Cache-Control",
            if is_html { "no-store" } else { "no-cache" },
        );
    for (key, value) in security_headers(is_html, &req.search) {
        response = response.header(key, value);
    }
    let body = if req.method == Method::HEAD {
        Body::from_stream(futures_util::stream::empty::<Result<Bytes, Infallible>>())
    } else {
        file_body(fs_path(&name))
    };
    Ok(response.body(body).unwrap_or_default())
}
