// Weather by place over a real socket: a server whose stored config has a recipe placement with places, a local fake provider
// in place of Open-Meteo (WEATHER_BASE_URL, which only a debug build reads), and raw HTTP/1.1. Its own test binary: the
// variable is process-wide. Checks that the referenced places are fetched and streamed in the Data API's shape, and the place
// search route's guards and caps. Nothing here reaches the network.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use ips_server::{bind_with_home, ServerConfig};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;

/// The fake provider: a forecast for any place, Brevik for any search; the request lines it got.
async fn provider() -> (String, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let hits = Arc::new(Mutex::new(Vec::new()));
    let seen = Arc::clone(&hits);
    tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else { return };
            let seen = Arc::clone(&seen);
            tokio::spawn(async move {
                let mut raw = Vec::new();
                let mut buf = [0u8; 4096];
                while !raw.windows(4).any(|w| w == b"\r\n\r\n") {
                    match stream.read(&mut buf).await {
                        Ok(0) | Err(_) => return,
                        Ok(n) => raw.extend_from_slice(&buf[..n]),
                    }
                }
                let line = String::from_utf8_lossy(&raw).lines().next().unwrap_or("").to_string();
                seen.lock().unwrap().push(line.clone());
                let body = if line.contains("/v1/search") {
                    json!({ "results": [{ "name": "Brevik", "latitude": 59.0533, "longitude": 9.7007, "country": "Norway", "admin1": "Vestfold" }] })
                } else {
                    json!({ "utc_offset_seconds": 0, "current": { "temperature_2m": 4.0, "weather_code": 61, "is_day": 1 }, "hourly": { "time": [0, 3600], "temperature_2m": [4.0, 5.0], "weather_code": [61, 3] }, "daily": { "temperature_2m_max": [6.0], "temperature_2m_min": [1.0], "weather_code": [61] } })
                }
                .to_string();
                let answer = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(answer.as_bytes()).await;
            });
        }
    });
    (base, hits)
}

/// The status, headers (lowercase) and body of one request (the body de-chunked when it is one chunk, as these answers are).
async fn ask(port: u16, method: &str, path: &str) -> (u16, String, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let request = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\n\r\n");
    stream.write_all(request.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut raw)).await.unwrap().unwrap();
    let text = String::from_utf8_lossy(&raw).into_owned();
    let (head, rest) = text.split_once("\r\n\r\n").unwrap();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let body = if head.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        rest.lines().nth(1).unwrap_or("").to_string()
    } else {
        rest.to_string()
    };
    (status, head.to_ascii_lowercase(), body)
}

/// The first event of a stream, parsed, and the stream's head.
async fn first_event(port: u16, path: &str) -> (String, Value) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    stream.write_all(format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n").as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    let mut buf = [0u8; 8192];
    let text = loop {
        let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf)).await.unwrap().unwrap();
        raw.extend_from_slice(&buf[..n]);
        let text = String::from_utf8_lossy(&raw).into_owned();
        if text.contains("data: ") && text[text.find("data: ").unwrap()..].contains("\n\n") {
            break text;
        }
    };
    let head = text.split("\r\n\r\n").next().unwrap().to_ascii_lowercase();
    let data = text.split("data: ").nth(1).unwrap().split("\n\n").next().unwrap();
    (head, serde_json::from_str(data).unwrap())
}

struct Server {
    port: u16,
    _dir: tempfile::TempDir,
    stop: oneshot::Sender<()>,
    done: tokio::task::JoinHandle<()>,
}

/// A server whose config places one recipe placement with Oslo and Tokyo (stored) and one with the recipe's default (Oslo).
async fn start() -> Server {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("dist")).unwrap();
    let data = dir.path().join("data");
    let recipe = data.join("widgets").join("recipe.wx");
    std::fs::create_dir_all(&recipe).unwrap();
    let options =
        json!({ "options": [{ "key": "places", "type": "place-list", "default": [{ "name": "Oslo", "lat": 59.91, "lon": 10.75 }] }] });
    std::fs::write(recipe.join("recipe.json"), options.to_string()).unwrap();
    let places = r#"[{"name":"Oslo","lat":59.9139,"lon":10.7522},{"name":"Tokyo","lat":35.68,"lon":139.69}]"#;
    let config = json!({ "version": 19, "profiles": [{ "id": "p", "placements": [
        { "id": "a", "module": "recipe:wx", "settings": { "places": places } },
        { "id": "b", "module": "recipe:wx" },
        { "id": "c", "module": "recipe:other", "settings": { "places": r#"[{"name":"Nope","lat":1,"lon":1}]"# } }
    ] }] });
    std::fs::write(data.join("config.json"), config.to_string()).unwrap();
    let cfg = ServerConfig {
        host: "127.0.0.1".into(),
        port: 0,
        allowed_hosts: vec![],
        allow_remote_edit: false,
        allow_remote_upload: false,
        action_runner: false,
        obs_stream: false,
        agent_approvals: vec![],
        agent_key_file: None,
        dist: dir.path().join("dist"),
        data_dir: data,
        infopanel_dir: dir.path().join("infopanel"),
        debug: false,
        version: "9.9.9".into(),
    };
    let home = cfg.data_dir.with_file_name("home");
    let bound = bind_with_home(cfg, home).await.unwrap();
    let port = bound.port();
    let (stop, stopped) = oneshot::channel::<()>();
    let done = tokio::spawn(bound.serve(async {
        let _ = stopped.await;
    }));
    Server { port, _dir: dir, stop, done }
}

#[tokio::test]
async fn fetches_the_referenced_places_streams_them_and_guards_place_search() {
    let (base, hits) = provider().await;
    std::env::set_var("WEATHER_BASE_URL", &base);
    let s = start().await;
    let port = s.port;

    // The first round runs at start: the two places the placements name (Oslo once), nothing for a recipe the server lacks.
    let mut status = Value::Null;
    for _ in 0..100 {
        status = serde_json::from_str(&ask(port, "GET", "/api/weather").await.2).unwrap();
        if status["places"].as_array().is_some_and(|p| p.len() == 2 && p.iter().all(|x| x["updated"].is_number())) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let ids: Vec<&str> = status["places"].as_array().unwrap().iter().map(|p| p["id"].as_str().unwrap()).collect();
    assert_eq!(ids, ["n5991e1075", "n3568e13969"]);
    assert_eq!(status["attribution"], "Weather data by Open-Meteo.com");
    let forecasts = hits.lock().unwrap().iter().filter(|h| h.contains("/v1/forecast")).count();
    assert_eq!(forecasts, 2, "one fetch per place");
    assert_eq!(status["calls"]["today"], 2);

    // The stream: the Data API's shape, under the asked prefix.
    let (head, event) = first_event(port, "/events/weather?prefix=weather.place.n5991e1075.&interval=1000").await;
    assert!(head.contains("content-type: text/event-stream") && !head.contains("x-weather"));
    let sensors = event["sensors"].as_object().unwrap();
    assert_eq!(
        (sensors["weather.place.n5991e1075.temp"]["value"].as_f64(), sensors["weather.place.n5991e1075.temp"]["unit"].as_str()),
        (Some(4.0), Some("°C"))
    );
    assert_eq!(sensors["weather.place.n5991e1075.condition"]["text"], "Light rain");
    assert_eq!(sensors["weather.place.n5991e1075.status"]["text"], "ok");
    assert!(sensors.keys().all(|k| k.starts_with("weather.place.n5991e1075.")));
    assert!(event["timestamp"].is_number());
    let (_, all) = first_event(port, "/events/weather?prefix=plugins.").await;
    assert!(
        all["sensors"].as_object().unwrap().keys().any(|k| k.starts_with("weather.place.n3568e13969.")),
        "a prefix outside weather. reads the namespace"
    );

    // Place search: found, cached, guarded and capped.
    let (code, _, body) = ask(port, "GET", "/api/weather/places?q=Brevik").await;
    assert_eq!(code, 200);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()[0]["lat"], 59.0533);
    ask(port, "GET", "/api/weather/places?q=brevik").await;
    assert_eq!(hits.lock().unwrap().iter().filter(|h| h.contains("/v1/search")).count(), 1, "the second from the cache");
    assert_eq!(ask(port, "GET", "/api/weather/places?q=B").await.0, 400);
    assert_eq!(ask(port, "GET", &format!("/api/weather/places?q={}", "x".repeat(61))).await.0, 400);
    assert_eq!(ask(port, "GET", "/api/weather/places?q=Oslo&lang=english").await.0, 400);
    assert_eq!(ask(port, "POST", "/api/weather/places?q=Oslo").await.0, 405);
    assert_eq!(ask(port, "PUT", "/api/weather").await.0, 405);
    let mut last = 0;
    for n in 0..20 {
        last = ask(port, "GET", &format!("/api/weather/places?q=place{n}")).await.0;
        if last == 429 {
            break;
        }
    }
    assert_eq!(last, 429, "at most 20 searches a minute");
    let (code, head, _) = ask(port, "GET", "/api/weather/places?q=another").await;
    assert_eq!(code, 429);
    assert!(head.contains("retry-after: 60"));
    assert_eq!(hits.lock().unwrap().iter().filter(|h| h.contains("/v1/search")).count(), 20);

    let _ = s.stop.send(());
    tokio::time::timeout(Duration::from_secs(5), s.done).await.unwrap().unwrap();
}
