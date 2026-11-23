// Weather by place: ids and rounding, which places are polled, the cache, backoff, the caps, the host list and the switch. Every
// fetch goes to a local fake provider (`Fake`); nothing here reaches the network.

use std::sync::atomic::{AtomicBool, Ordering};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use super::*;

const MIN: i64 = 60_000;

/// An Open-Meteo forecast answer, cut down: three hours, two days, an hour ahead of UTC.
fn forecast_body() -> String {
    json!({
        "utc_offset_seconds": 3600,
        "current": { "temperature_2m": 3.44, "apparent_temperature": 1.2, "relative_humidity_2m": 92, "weather_code": 3, "wind_speed_10m": 2.9, "is_day": 1, "precipitation": 0.0 },
        "hourly": { "time": [1_794_214_800, 1_794_218_400, 1_794_222_000], "temperature_2m": [3.4, 3.6, 3.9], "weather_code": [3, 2, 61], "precipitation_probability": [0, 10, 40], "is_day": [1, 1, 0] },
        "daily": { "time": [1_794_178_800, 1_794_265_200], "temperature_2m_max": [4.2, 3.6], "temperature_2m_min": [1.8, 2.0], "weather_code": [3, 51] }
    })
    .to_string()
}

/// A local stand-in for Open-Meteo: answers every request, records its request line, fails while `fail` is set.
struct Fake {
    base: String,
    hits: Arc<Mutex<Vec<String>>>,
    fail: Arc<AtomicBool>,
}

impl Fake {
    fn hits(&self) -> Vec<String> {
        self.hits.lock().unwrap().clone()
    }

    fn count(&self, needle: &str) -> usize {
        self.hits().iter().filter(|h| h.contains(needle)).count()
    }
}

async fn fake() -> Fake {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
    let (hits, fail) = (Arc::new(Mutex::new(Vec::new())), Arc::new(AtomicBool::new(false)));
    let (h, f) = (Arc::clone(&hits), Arc::clone(&fail));
    tokio::spawn(async move {
        loop {
            let Ok((mut stream, _)) = listener.accept().await else { return };
            let (h, f) = (Arc::clone(&h), Arc::clone(&f));
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
                h.lock().unwrap().push(line.clone());
                let (status, body) = if f.load(Ordering::SeqCst) {
                    ("500 Internal Server Error", "{}".to_string())
                } else if line.contains("/v1/search") {
                    ("200 OK", json!({ "results": [{ "name": "Brevik", "latitude": 59.05329, "longitude": 9.70068, "country": "Norway", "admin1": "Vestfold" }, { "name": "Nowhere", "latitude": 99.0, "longitude": 0.0 }] }).to_string())
                } else {
                    ("200 OK", forecast_body())
                };
                let answer = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(answer.as_bytes()).await;
            });
        }
    });
    Fake { base, hits, fail }
}

fn oslo() -> Place {
    place_of(59.91, 10.75).unwrap()
}

fn tokyo() -> Place {
    place_of(35.68, 139.69).unwrap()
}

/// A source on the fake, polling whatever `places` holds at each round.
fn source(f: &Fake, limits: Limits, places: Arc<Mutex<Vec<Place>>>) -> Arc<Weather> {
    Weather::new(true, Endpoints::at(&f.base).unwrap(), limits, move || places.lock().unwrap().clone())
}

fn key(place: &Place, k: &str) -> String {
    format!("{PREFIX}{}.{k}", place.id)
}

#[test]
fn a_place_is_its_coordinates_rounded_to_a_hundredth_of_a_degree() {
    assert_eq!(place_id(59.9139, 10.7522), "n5991e1075");
    assert_eq!(place_id(-33.8688, 151.2093), "s3387e15121");
    assert_eq!(place_id(40.7128, -74.006), "n4071w7401");
    assert_eq!(place_id(0.004, -0.004), "n0e0", "a coordinate that rounds to 0 has one spelling");
    // Two names for one spot share a fetch; a kilometre or two apart do not.
    assert_eq!(place_of(59.9139, 10.7522), place_of(59.912, 10.748));
    assert_ne!(place_of(59.91, 10.75).unwrap().id, place_of(59.93, 10.75).unwrap().id);
    assert_eq!(place_of(59.9139, 10.7522).unwrap().lat, 59.91);
    for (lat, lon) in [(90.01, 0.0), (0.0, -180.01), (f64::NAN, 0.0), (0.0, f64::INFINITY)] {
        assert_eq!(place_of(lat, lon), None, "{lat} {lon}");
    }
    assert!(place_of(-90.0, 180.0).is_some());
}

#[test]
fn polls_only_the_places_the_stored_placements_reference() {
    let recipe = json!({ "options": [
        { "key": "places", "type": "place-list", "default": [{ "name": "Oslo", "lat": 59.91, "lon": 10.75 }] },
        { "key": "units", "type": "select", "default": "c" }
    ] });
    let recipe_of = |id: &str| (id == "recipe:wx").then(|| recipe.clone());
    let config = json!({ "profiles": [{ "placements": [
        { "module": "recipe:wx", "settings": { "places": "[{\"name\":\"Tokyo\",\"lat\":35.68,\"lon\":139.69},{\"name\":\"Oslo again\",\"lat\":59.912,\"lon\":10.748}]" } },
        { "module": "recipe:wx", "settings": {} },
        { "module": "recipe:wx", "settings": { "places": "[]" } },
        { "module": "recipe:gone", "settings": { "places": "[{\"name\":\"X\",\"lat\":1,\"lon\":1}]" } },
        { "module": "Weather", "settings": { "places": "[{\"name\":\"Y\",\"lat\":2,\"lon\":2}]" } },
        { "module": "recipe:wx", "settings": { "places": "not json" } }
    ] }], "canvas": { "items": [{ "module": "recipe:wx", "settings": { "places": [{ "name": "Brevik", "lat": 59.05, "lon": 9.7 }] } }] } });
    let ids: Vec<String> = referenced_places(&config, &recipe_of, 48).into_iter().map(|p| p.id).collect();
    // Tokyo and Oslo from the first, Oslo (the default) from the second and the unparsable sixth, nothing from "[]", the missing
    // recipe or the built-in, Brevik from wherever a placement sits.
    assert_eq!(ids, ["n3568e13969", "n5991e1075", "n5905e970"]);
    assert_eq!(referenced_places(&config, &recipe_of, 1).len(), 1, "at most the cap");
    assert!(referenced_places(&json!({}), &recipe_of, 48).is_empty());
}

#[test]
fn the_rate_cap_holds_a_window_and_frees_as_it_slides() {
    let mut cap = RateCap::new(Duration::from_secs(3600), 3);
    assert!(cap.take(0) && cap.take(10) && cap.take(20));
    assert!(!cap.take(30), "the fourth in the hour");
    assert_eq!(cap.used(3_599_999), 3);
    assert!(cap.take(3_600_000), "the first slot freed an hour after it was taken");
    assert!(!cap.take(3_600_001));
}

#[test]
fn backs_off_from_the_floor_doubling_up_to_two_hours() {
    let mins = |f| backoff(f).as_secs() / 60;
    assert_eq!([mins(1), mins(2), mins(3), mins(4), mins(5), mins(40)], [10, 20, 40, 80, 120, 120]);
    assert!(POLL >= POLL_FLOOR, "the poll is never faster than the floor");
}

#[test]
fn reads_an_answer_as_readings() {
    let r = parse_forecast(&serde_json::from_str(&forecast_body()).unwrap()).unwrap();
    assert_eq!(r["temp"], json!({ "value": 3.4, "unit": "°C" }));
    assert_eq!(r["condition"], json!({ "text": "Overcast", "unit": "" }));
    assert_eq!((r["high"]["value"].as_f64(), r["low"]["value"].as_f64()), (Some(4.2), Some(1.8)), "today's");
    assert_eq!(r["hourly.2.code"]["value"], 61.0);
    assert_eq!(r["hourly.2.condition"]["text"], "Light rain");
    assert_eq!((r["hourly.1.is_day"]["value"].as_f64(), r["hourly.2.is_day"]["value"].as_f64()), (Some(1.0), Some(0.0)));
    assert_eq!(r["hourly.0.time"]["text"], "10:00", "local time by the place's offset");
    assert_eq!(r["daily.1.condition"]["text"], "Drizzle");
    assert!(!r.contains_key("hourly.3.temp"));
    assert_eq!(parse_forecast(&json!({ "hourly": {} })), Err("the answer has no current conditions".into()));
    assert_eq!(condition_of(95), "Thunderstorm");
    assert_eq!(condition_of(1234), "Unknown");
}

#[tokio::test]
async fn caches_each_place_for_the_poll_and_fetches_it_again_after() {
    let f = fake().await;
    let w = source(&f, Limits::default(), Arc::new(Mutex::new(vec![oslo()])));
    w.poll_once(0).await;
    assert_eq!(f.count("/v1/forecast"), 1, "a miss");
    assert!(f.hits()[0].contains("latitude=59.91&longitude=10.75"), "the rounded coordinates go to the provider");
    assert_eq!(w.readings()[&key(&oslo(), "temp")]["value"], 3.4);
    assert_eq!(w.readings()[&key(&oslo(), "status")]["text"], "ok");
    w.poll_once(5 * MIN).await;
    w.poll_once(14 * MIN).await;
    assert_eq!(f.count("/v1/forecast"), 1, "hits until the poll is due");
    assert_eq!(w.readings()[&key(&oslo(), "age")]["value"], 14);
    w.poll_once(15 * MIN).await;
    assert_eq!(f.count("/v1/forecast"), 2);
}

#[tokio::test]
async fn a_place_no_longer_referenced_is_not_fetched_and_leaves_the_readings() {
    let f = fake().await;
    let places = Arc::new(Mutex::new(vec![oslo(), tokyo()]));
    let w = source(&f, Limits::default(), Arc::clone(&places));
    w.poll_once(0).await;
    assert_eq!(f.count("/v1/forecast"), 2);
    *places.lock().unwrap() = vec![oslo()];
    w.poll_once(MIN).await;
    assert!(!w.readings().keys().any(|k| k.contains(&tokyo().id)));
    // Back within the hour and before its poll is due: the cached answer, no fetch.
    *places.lock().unwrap() = vec![oslo(), tokyo()];
    w.poll_once(5 * MIN).await;
    assert_eq!(f.count("latitude=35.68"), 1);
    assert_eq!(w.readings()[&key(&tokyo(), "temp")]["value"], 3.4);
    // Gone again: only Oslo is fetched when the poll comes round.
    *places.lock().unwrap() = vec![oslo()];
    w.poll_once(16 * MIN).await;
    assert_eq!((f.count("latitude=59.91"), f.count("latitude=35.68")), (2, 1));
}

#[tokio::test]
async fn backs_off_on_errors_keeps_the_last_answer_and_says_so() {
    let f = fake().await;
    f.fail.store(true, Ordering::SeqCst);
    let w = source(&f, Limits::default(), Arc::new(Mutex::new(vec![oslo()])));
    w.poll_once(0).await;
    assert_eq!(w.readings()[&key(&oslo(), "status")]["text"], "error");
    assert_eq!(w.readings()[&key(&oslo(), "error")]["text"], "HTTP 500");
    w.poll_once(9 * MIN).await;
    assert_eq!(f.count("/v1/forecast"), 1, "not before the floor");
    w.poll_once(10 * MIN).await;
    w.poll_once(29 * MIN).await;
    assert_eq!(f.count("/v1/forecast"), 2, "the second failure waits 20 minutes");
    f.fail.store(false, Ordering::SeqCst);
    w.poll_once(30 * MIN).await;
    assert_eq!(w.readings()[&key(&oslo(), "status")]["text"], "ok");
    assert!(!w.readings().contains_key(&key(&oslo(), "error")));
    f.fail.store(true, Ordering::SeqCst);
    w.poll_once(45 * MIN).await;
    let r = w.readings();
    assert_eq!(
        (r[&key(&oslo(), "status")]["text"].as_str(), r[&key(&oslo(), "temp")]["value"].as_f64()),
        (Some("stale"), Some(3.4)),
        "the last good answer stays"
    );
    w.poll_once(80 * MIN).await;
    assert_eq!(w.readings()[&key(&oslo(), "age")]["value"], 50, "the age keeps counting");
}

#[tokio::test]
async fn one_cap_holds_every_provider_call() {
    let f = fake().await;
    let limits = Limits { calls_per_hour: 2, ..Limits::default() };
    let w = source(&f, limits, Arc::new(Mutex::new(vec![oslo(), tokyo(), place_of(59.05, 9.7).unwrap()])));
    w.poll_once(0).await;
    assert_eq!(f.count("/v1/forecast"), 2, "two of three in the hour");
    assert_eq!(w.readings()[&format!("{PREFIX}n5905e970.status")]["text"], "waiting");
    assert_eq!(
        w.search("brevik", "en", MIN).await,
        Err((429, "the weather source has used its calls for this hour; try again later".into()))
    );
    w.poll_once(60 * MIN).await;
    assert_eq!(f.count("latitude=59.05"), 1, "the one held back goes first once the window frees the slots");
    assert_eq!(w.status(60 * MIN)["calls"]["today"], 4, "and one of the two due again takes the other slot");
}

#[tokio::test]
async fn place_search_is_cached_and_capped_per_minute() {
    let f = fake().await;
    let w = source(&f, Limits { searches_per_minute: 2, ..Limits::default() }, Arc::new(Mutex::new(vec![])));
    let found = w.search("Brevik", "en", 0).await.unwrap();
    assert_eq!(
        found,
        json!([{ "name": "Brevik", "admin1": "Vestfold", "country": "Norway", "lat": 59.0533, "lon": 9.7007 }]),
        "a place off the globe is left out"
    );
    assert!(f.hits()[0].contains("name=Brevik&count=20&language=en"));
    assert_eq!(w.search("brevik", "en", 1).await.unwrap(), found, "the same query from the cache");
    assert_eq!(f.count("/v1/search"), 1);
    w.search("Oslo", "en", 2).await.unwrap();
    assert_eq!(w.search("Tokyo", "en", 3).await.map_err(|e| e.0), Err(429));
    assert!(w.search("Tokyo", "en", MIN + 1).await.is_ok(), "a minute on");
    f.fail.store(true, Ordering::SeqCst);
    assert_eq!(w.search("Bergen", "en", 2 * MIN).await.map_err(|e| e.0), Err(502));
}

#[test]
fn a_search_is_refused_before_the_provider_when_it_breaks_a_rule() {
    let ok = |q: &str, lang: &str| search_refusal(&Method::GET, true, true, false, q, lang);
    assert_eq!(ok("Oslo", "en"), None);
    assert_eq!(ok("O", "en").map(|r| r.0), Some(400));
    assert_eq!(ok(&"x".repeat(61), "en").map(|r| r.0), Some(400));
    assert_eq!(ok("Os\nlo", "en").map(|r| r.0), Some(400));
    assert_eq!(ok("Oslo", "eng").map(|r| r.0), Some(400));
    assert_eq!(search_refusal(&Method::POST, true, true, false, "Oslo", "en").map(|r| r.0), Some(405));
    assert_eq!(search_refusal(&Method::GET, false, true, false, "Oslo", "en").map(|r| r.0), Some(403), "off");
    assert_eq!(search_refusal(&Method::GET, true, false, false, "Oslo", "en").map(|r| r.0), Some(403), "another computer");
    assert_eq!(search_refusal(&Method::GET, true, false, true, "Oslo", "en"), None, "remote editing on");
}

#[tokio::test]
async fn reaches_only_the_listed_hosts() {
    let f = fake().await;
    let mut endpoints = Endpoints::at(&f.base).unwrap();
    endpoints.hosts = vec!["api.open-meteo.com".into()];
    let w = Weather::new(true, endpoints, Limits::default(), || vec![oslo()]);
    w.poll_once(0).await;
    assert_eq!(f.hits().len(), 0);
    assert_eq!(w.readings()[&key(&oslo(), "error")]["text"], crate::guarded_net::NOT_LISTED);
    let live = Endpoints::open_meteo().unwrap();
    assert_eq!(live.hosts, ["api.open-meteo.com", "geocoding-api.open-meteo.com"]);
    assert!(live.forecast.scheme() == "https" && live.search.scheme() == "https");
    // The offline endpoints are on the list but the address guard refuses them.
    let w = Weather::new(true, Endpoints::offline().unwrap(), Limits::default(), || vec![oslo()]);
    w.poll_once(0).await;
    assert_eq!(w.readings()[&key(&oslo(), "error")]["text"], crate::guarded_net::NOT_ALLOWED);
}

#[tokio::test]
async fn off_fetches_nothing_and_starts_no_task() {
    let f = fake().await;
    let w = Weather::new(false, Endpoints::at(&f.base).unwrap(), Limits::default(), || vec![oslo()]);
    w.poll_once(0).await;
    assert!(w.readings().is_empty());
    assert_eq!(f.hits().len(), 0);
    let (_stop, shutdown) = watch::channel(false);
    assert!(w.start(&shutdown).is_none());
    assert_eq!(w.status(0)["enabled"], false);
}

#[test]
fn a_stream_sends_what_changed_under_its_prefix() {
    let r = |pairs: &[(&str, i64)]| pairs.iter().map(|(k, v)| (k.to_string(), json!(v))).collect::<Readings>();
    let all = r(&[("weather.place.a.temp", 1), ("weather.place.ab.temp", 2), ("weather.place.b.temp", 3)]);
    assert_eq!(under(&all, "weather.place.a.").keys().collect::<Vec<_>>(), ["weather.place.a.temp"]);
    let (changed, removed) = diff(&r(&[("x", 1), ("y", 2)]), &r(&[("x", 1), ("y", 3), ("z", 4)]));
    assert_eq!((changed, removed), (r(&[("y", 3), ("z", 4)]), vec![]));
    assert_eq!(diff(&r(&[("x", 1)]), &r(&[])).1, ["x"]);
}

#[test]
fn an_hourly_weather_placement_references_the_first_place_of_its_list() {
    let none = |_: &str| None;
    let config = json!({ "profiles": [{ "placements": [
        { "module": "HourlyWeather", "settings": { "places": "[{\"name\":\"Oslo\",\"lat\":59.91,\"lon\":10.75},{\"name\":\"Bergen\",\"lat\":60.39,\"lon\":5.32}]" } },
        { "module": "HourlyWeather", "settings": { "places": "[{\"name\":\"Oslo again\",\"lat\":59.912,\"lon\":10.748}]" } },
        { "module": "HourlyWeather", "settings": { "places": "[]" } },
        { "module": "HourlyWeather", "settings": {} },
        { "module": "HourlyWeather", "settings": { "places": "not json" } }
    ] }] });
    let ids: Vec<String> = referenced_places(&config, &none, 48).into_iter().map(|p| p.id).collect();
    assert_eq!(ids, ["n5991e1075"], "the first place of a list, once, and nothing from an empty, missing or unreadable one");
}
