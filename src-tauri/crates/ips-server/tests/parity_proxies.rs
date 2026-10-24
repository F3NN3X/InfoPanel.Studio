// The parity fixtures for the proxies (proxy, font-proxy; tests/fixtures/parity/*.json, written from the Node server
// by tools/parity/proxy-fixtures.mjs): each case's input through the native function must give the Node output exactly.

use std::path::PathBuf;

use base64::Engine;
use ips_server::font_proxy::{hop_allowed, proxy_allowed};
use ips_server::guarded_net::blocked_address;
use ips_server::proxy::{is_allowed_proxy_type, is_valid_proxy_target, resolve_proxy_type, sniff_image_type};
use serde_json::{json, Value};

fn cases(module: &str) -> Vec<(Value, Value)> {
    let file = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../tests/fixtures/parity").join(format!("{module}.json"));
    let text = std::fs::read_to_string(&file).unwrap_or_else(|e| panic!("{}: {e}", file.display()));
    let list: Vec<Value> = serde_json::from_str(&text).unwrap();
    assert!(!list.is_empty(), "{module}: no cases");
    list.into_iter().map(|case| (case["input"].clone(), case["output"].clone())).collect()
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or_else(|| panic!("{key} in {v}"))
}

fn bytes_of(v: &Value) -> Vec<u8> {
    base64::engine::general_purpose::STANDARD.decode(str_of(v, "bytes")).unwrap()
}

#[test]
fn proxy() {
    for (input, want) in cases("proxy") {
        let got = match str_of(&input, "fn") {
            "blockedAddress" => json!(blocked_address(str_of(&input, "ip"), input["blockLan"].as_bool().unwrap())),
            "isValidProxyTarget" => url::Url::parse(str_of(&input, "url")).map_or(Value::Null, |u| json!(is_valid_proxy_target(&u))),
            "isAllowedProxyType" => json!(is_allowed_proxy_type(input["type"].as_str().unwrap_or(""))),
            "sniffImageType" => json!(sniff_image_type(&bytes_of(&input))),
            "resolveProxyType" => json!(resolve_proxy_type(input["type"].as_str(), &bytes_of(&input))),
            other => panic!("unknown fn {other}"),
        };
        assert_eq!(got, want, "{input}");
    }
}

#[test]
fn font_proxy() {
    for (input, want) in cases("font-proxy") {
        let got = match str_of(&input, "fn") {
            "proxyAllowed" => proxy_allowed(str_of(&input, "url")),
            "hopAllowed" => hop_allowed(str_of(&input, "url")),
            other => panic!("unknown fn {other}"),
        };
        assert_eq!(json!(got), want, "{input}");
    }
}
