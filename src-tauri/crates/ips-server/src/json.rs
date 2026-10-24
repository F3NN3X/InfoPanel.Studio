// JSON as the Node server writes it: `JSON.stringify`, compact, with JavaScript's key order (integer-like keys first,
// ascending, then the rest as inserted) and its number format. What the server stores or sends that Node built with
// `JSON.stringify` goes through `stringify`, so the bytes match.

use serde_json::{Map, Value};

use crate::js;

/// `JSON.parse(text)`, or `None` where it throws.
pub fn parse(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok()
}

/// Whether `key` is an array index, which a JavaScript object orders before its other keys.
fn is_index(key: &str) -> bool {
    let canonical = key == "0" || (!key.starts_with('0') && !key.is_empty() && key.bytes().all(|b| b.is_ascii_digit()));
    canonical && key.parse::<u64>().is_ok_and(|n| n < u32::MAX as u64)
}

/// The keys of `map` in the order `Object.keys` gives them.
pub fn keys(map: &Map<String, Value>) -> Vec<&String> {
    let mut indices: Vec<&String> = map.keys().filter(|k| is_index(k)).collect();
    indices.sort_by_key(|k| k.parse::<u64>().unwrap_or(0));
    indices.extend(map.keys().filter(|k| !is_index(k)));
    indices
}

/// `JSON.stringify(value)`.
pub fn stringify(value: &Value) -> String {
    let mut out = String::new();
    write(&mut out, value);
    out
}

fn write(out: &mut String, value: &Value) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&js::json_number_to_string(n)),
        Value::String(s) => write_string(out, s),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(out, item);
            }
            out.push(']');
        }
        Value::Object(map) => {
            out.push('{');
            for (i, key) in keys(map).into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, key);
                out.push(':');
                write(out, &map[key]);
            }
            out.push('}');
        }
    }
}

fn write_string(out: &mut String, s: &str) {
    // serde_json escapes exactly as JSON.stringify does for well-formed strings.
    out.push_str(&serde_json::to_string(s).unwrap_or_default());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_insertion_order_with_integer_keys_first() {
        let v = parse(r#"{"b":1,"2":2,"a":3,"1":4,"01":5,"4294967295":6}"#).unwrap();
        assert_eq!(stringify(&v), r#"{"1":4,"2":2,"b":1,"a":3,"01":5,"4294967295":6}"#);
    }

    #[test]
    fn prints_numbers_and_strings_as_javascript() {
        let v = parse(r#"[1.0,1e21,1e-7,-0,12345678901234567890,"a\u0001\n\"/ "]"#).unwrap();
        assert_eq!(stringify(&v), "[1,1e+21,1e-7,0,12345678901234567000,\"a\\u0001\\n\\\"/\u{2028}\"]");
    }

    #[test]
    fn keeps_the_last_of_a_duplicate_key_in_the_first_place() {
        assert_eq!(stringify(&parse(r#"{"a":1,"b":2,"a":3}"#).unwrap()), r#"{"a":3,"b":2}"#);
    }
}
