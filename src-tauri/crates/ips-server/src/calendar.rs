// The calendar links (server/calendar.mjs): fetched on the server every few minutes and expanded to the upcoming
// occurrences (ical.rs) for the island's countdown. The links are often secret (Google's "secret address"), so kiosks
// get only the events, never the URLs. The fetch goes through the guarded client (guarded_net.rs).

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::sync::watch;

use crate::config::now_ms;
use crate::guarded_net::GuardedClient;
use crate::ical::{self, LocalZone};
use crate::integrations::Link;

pub const REFRESH: Duration = Duration::from_secs(10 * 60);
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_BYTES: usize = 5 * 1024 * 1024;
/// How far ahead the kiosks get events, ms.
pub const AHEAD_MS: i64 = 36 * 3_600_000;
/// Events that began this long ago are still sent (a running meeting), ms.
const BEHIND_MS: i64 = 3_600_000;
const MAX_EVENTS: usize = 50;
const MAX_REDIRECTS: usize = 3;

pub fn empty_calendar(configured: bool) -> Value {
    json!({ "configured": configured, "events": [] })
}

/// The occurrences of the feeds (ICS texts) between an hour ago and 36 hours on, soonest first.
pub fn upcoming(feeds: &[String], now: i64, local: LocalZone) -> Vec<ical::Occurrence> {
    let mut all: Vec<ical::Occurrence> = feeds.iter().flat_map(|text| ical::occurrences(&ical::parse_ics(text), now - BEHIND_MS, now + AHEAD_MS, local)).collect();
    all.sort_by_key(|o| o.start);
    all.truncate(MAX_EVENTS);
    all
}

/// The feed's text. Each hop (redirects are followed by hand, at most three) is checked first, and one timeout covers
/// the whole chain.
pub async fn fetch_feed(client: &GuardedClient, url: &str) -> Result<String, String> {
    let chain = async {
        let mut target = url::Url::parse(url).map_err(|_| "Invalid URL".to_string())?;
        let mut hop = 0;
        let fetched = loop {
            client.check_target(&target).await?;
            let fetched = client.get(&target, &[("Accept", "text/calendar, text/plain;q=0.8")], MAX_BYTES).await?;
            let next = (300..400).contains(&fetched.status).then(|| fetched.headers.get("location")).flatten();
            let Some(next) = next else { break fetched };
            if hop >= MAX_REDIRECTS {
                return Err("too many redirects".to_string());
            }
            hop += 1;
            target = target.join(&String::from_utf8_lossy(next.as_bytes())).map_err(|_| "Invalid URL".to_string())?;
        };
        if !(200..300).contains(&fetched.status) {
            return Err(format!("HTTP {}", fetched.status));
        }
        let text = String::from_utf8_lossy(&fetched.body).into_owned();
        if !text.to_ascii_uppercase().contains("BEGIN:VCALENDAR") {
            return Err("not a calendar".into());
        }
        Ok(text)
    };
    tokio::time::timeout(FETCH_TIMEOUT, chain).await.unwrap_or_else(|_| Err("The operation was aborted".into()))
}

/// The host of a link for the log and error text: never the path or query, which hold the secret.
fn host_of(url: &str) -> String {
    url::Url::parse(url).map(|u| u.host_str().unwrap_or_default().to_string() + &u.port().map_or(String::new(), |p| format!(":{p}"))).unwrap_or_default()
}

/// The live calendar: `run` is the supervised task, `reconfigure` fetches now (after the links change), and `on_change`
/// runs on every refresh. A link that fails keeps its last good feed and reports the error.
pub struct Calendar {
    state: Mutex<Value>,
    last_good: Mutex<HashMap<String, String>>,
    links: Box<dyn Fn() -> Vec<Link> + Send + Sync>,
    on_change: Box<dyn Fn() + Send + Sync>,
    client: GuardedClient,
    local: LocalZone,
    reconfigure: watch::Sender<u64>,
}

impl Calendar {
    pub fn new(client: GuardedClient, links: impl Fn() -> Vec<Link> + Send + Sync + 'static, on_change: impl Fn() + Send + Sync + 'static) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(empty_calendar(false)),
            last_good: Mutex::new(HashMap::new()),
            links: Box::new(links),
            on_change: Box::new(on_change),
            client,
            local: LocalZone::System,
            reconfigure: watch::channel(0).0,
        })
    }

    pub fn state(&self) -> Value {
        self.state.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    /// Call after the links change: fetches now, then every `REFRESH`.
    pub fn reconfigure(&self) {
        self.reconfigure.send_modify(|generation| *generation += 1);
    }

    fn publish(&self, state: Value) {
        *self.state.lock().unwrap_or_else(PoisonError::into_inner) = state;
        (self.on_change)();
    }

    async fn refresh(&self) {
        let list = (self.links)();
        if list.is_empty() {
            self.last_good.lock().unwrap_or_else(PoisonError::into_inner).clear();
            return self.publish(empty_calendar(false));
        }
        self.last_good.lock().unwrap_or_else(PoisonError::into_inner).retain(|url, _| list.iter().any(|l| &l.url == url));
        let fetched = futures_util::future::join_all(list.iter().map(|l| fetch_feed(&self.client, &l.url))).await;
        let mut errors = Vec::new();
        let mut feeds = Vec::new();
        for (link, result) in list.iter().zip(fetched) {
            match result {
                Ok(text) => {
                    self.last_good.lock().unwrap_or_else(PoisonError::into_inner).insert(link.url.clone(), text.clone());
                    feeds.push(text);
                }
                Err(message) => {
                    let host = host_of(&link.url);
                    errors.push(format!("{}: {message}", if link.label.is_empty() { &host } else { &link.label }));
                    log::warn!(target: "server", "Calendar {host}: {message}");
                    feeds.push(self.last_good.lock().unwrap_or_else(PoisonError::into_inner).get(&link.url).cloned().unwrap_or_default());
                }
            }
        }
        let events: Vec<Value> = upcoming(&feeds, now_ms(), self.local).iter().map(ical::Occurrence::to_json).collect();
        let mut state = json!({ "configured": true, "events": events });
        if !errors.is_empty() {
            state["error"] = json!(errors.join("; "));
        }
        self.publish(state);
    }

    /// Refreshes at once and every `REFRESH` after, and at once again when `reconfigure` is called (a refresh in
    /// flight is dropped: its answer is for the old links). Never returns.
    pub async fn run(&self) {
        let mut changes = self.reconfigure.subscribe();
        loop {
            tokio::select! {
                _ = changes.changed() => continue,
                _ = self.refresh() => {}
            }
            tokio::select! {
                _ = changes.changed() => {}
                _ = tokio::time::sleep(REFRESH) => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn ics(uid: &str, start: &str, title: &str) -> String {
        format!("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:{uid}\r\nSUMMARY:{title}\r\nDTSTART:{start}\r\nDURATION:PT30M\r\nEND:VEVENT\r\nEND:VCALENDAR")
    }

    /// A server answering each request with the next of `answers` (a full HTTP response each), then dropping.
    async fn serve(answers: Vec<String>) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            for answer in answers {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut buf = [0u8; 2048];
                let _ = stream.read(&mut buf).await;
                let _ = stream.write_all(answer.as_bytes()).await;
            }
        });
        port
    }

    fn ok(body: &str) -> String {
        format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
    }

    fn redirect(location: &str) -> String {
        format!("HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
    }

    #[test]
    fn merges_the_feeds_occurrences_soonest_first_and_skips_a_broken_feed() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-15T08:00:00Z").unwrap().timestamp_millis();
        let feeds = vec![ics("b", "20261015T120000Z", "Lunch"), "garbage".to_string(), ics("a", "20261015T090000Z", "Standup"), ics("c", "20261020T090000Z", "Far")];
        let events = upcoming(&feeds, now, LocalZone::System);
        assert_eq!(events.iter().map(|e| e.title.as_str()).collect::<Vec<_>>(), ["Standup", "Lunch"]);
    }

    #[tokio::test]
    async fn fetches_a_feed_and_follows_at_most_three_redirects() {
        let client = GuardedClient::open();
        let feed = ics("a", "20261015T090000Z", "Standup");
        let port = serve(vec![redirect("/moved.ics"), ok(&feed)]).await;
        assert_eq!(fetch_feed(&client, &format!("http://127.0.0.1:{port}/a.ics")).await, Ok(feed));
        let port = serve((0..4).map(|_| redirect("/again")).collect()).await;
        assert_eq!(fetch_feed(&client, &format!("http://127.0.0.1:{port}/a.ics")).await, Err("too many redirects".into()));
    }

    #[tokio::test]
    async fn reports_a_status_a_non_calendar_and_a_blocked_target() {
        let client = GuardedClient::open();
        let port = serve(vec!["HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into(), ok("<html>")]).await;
        assert_eq!(fetch_feed(&client, &format!("http://127.0.0.1:{port}/a")).await, Err("HTTP 404".into()));
        assert_eq!(fetch_feed(&client, &format!("http://127.0.0.1:{port}/b")).await, Err("not a calendar".into()));
        // The real client refuses this machine, at the first hop and at an address a redirect names.
        let guarded = GuardedClient::new(false).unwrap();
        assert_eq!(fetch_feed(&guarded, &format!("http://127.0.0.1:{port}/a")).await, Err("address not allowed".into()));
        assert_eq!(fetch_feed(&guarded, "http://localhost/a").await, Err("address not allowed".into()));
        assert_eq!(fetch_feed(&guarded, "file:///c:/x.ics").await, Err("not an http(s) link".into()));
    }

    #[tokio::test]
    async fn keeps_a_failing_links_last_feed_and_reports_the_error() {
        let feed = ics("a", "20261015T090000Z", "Standup");
        let port = serve(vec![ok(&feed), "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into()]).await;
        let url = format!("http://127.0.0.1:{port}/a.ics");
        let cal = Calendar::new(GuardedClient::open(), move || vec![Link { id: "x".into(), label: "Work".into(), url: url.clone() }], || {});
        cal.refresh().await;
        assert_eq!(cal.state()["configured"], true);
        assert!(cal.state().get("error").is_none());
        cal.refresh().await;
        assert_eq!(cal.state()["error"], "Work: HTTP 404");
        assert_eq!(cal.last_good.lock().unwrap().values().next(), Some(&feed));
    }

    #[tokio::test]
    async fn no_links_means_not_configured_and_the_stored_feeds_are_dropped() {
        let cal = Calendar::new(GuardedClient::open(), Vec::new, || {});
        cal.last_good.lock().unwrap().insert("https://x.example/a".into(), "old".into());
        cal.refresh().await;
        assert_eq!(cal.state(), empty_calendar(false));
        assert!(cal.last_good.lock().unwrap().is_empty());
    }
}
