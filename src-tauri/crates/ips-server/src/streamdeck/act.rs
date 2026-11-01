// POST /api/streamdeck/act's body, read into an action. Pure: every refusal is a message for the 400.

use serde_json::Value;

use super::settings::{clamp_grid, clean_name, DEFAULT_COLS, DEFAULT_ROWS, MAX_NAME};
use super::{PageTo, MAX_KEYS};

const MAX_DEVICE_ID: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Act {
    Press {
        device: String,
        index: u32,
        down: bool,
    },
    Page {
        device: String,
        to: PageTo,
    },
    Pair,
    /// No name: "IPStudio" or the first free "IPStudio N".
    Create {
        name: Option<String>,
        cols: u32,
        rows: u32,
    },
    Grid {
        device: String,
        cols: u32,
        rows: u32,
    },
    Rename {
        device: String,
        name: String,
    },
    Forget {
        device: String,
    },
}

fn device(body: &Value) -> Result<String, String> {
    match body.get("device") {
        Some(Value::String(id)) if !id.is_empty() && id.len() <= MAX_DEVICE_ID => Ok(id.clone()),
        _ => Err("\"device\" must be a device id".into()),
    }
}

/// A grid side: a whole number, brought into 1 to 8; `default` when absent.
fn side(body: &Value, key: &str, default: Option<u32>) -> Result<u32, String> {
    match (body.get(key), default) {
        (None, Some(default)) => Ok(default),
        (Some(v), _) if v.is_i64() || v.is_u64() => Ok(clamp_grid(v.as_u64().unwrap_or(0))),
        _ => Err(format!("\"{key}\" must be a whole number")),
    }
}

fn name(body: &Value) -> Result<String, String> {
    clean_name(body.get("name"))
        .ok_or_else(|| format!("\"name\" must be 1 to {MAX_NAME} characters"))
}

/// The action a request body asks for, or why it isn't one.
pub fn parse(body: &str) -> Result<Act, String> {
    let body: Value =
        serde_json::from_str(body).map_err(|_| "expected a JSON object".to_string())?;
    if !body.is_object() {
        return Err("expected a JSON object".into());
    }
    match body.get("op").and_then(Value::as_str) {
        Some("press") => {
            let index = body
                .get("index")
                .and_then(Value::as_u64)
                .filter(|i| *i < MAX_KEYS as u64);
            let index = index.ok_or(format!(
                "\"index\" must be a key number from 0 to {}",
                MAX_KEYS - 1
            ))? as u32;
            let down = body
                .get("down")
                .and_then(Value::as_bool)
                .ok_or("\"down\" must be true or false")?;
            Ok(Act::Press {
                device: device(&body)?,
                index,
                down,
            })
        }
        Some("page") => {
            let to = match body.get("to") {
                Some(Value::String(s)) if s == "next" => PageTo::Next,
                Some(Value::String(s)) if s == "prev" => PageTo::Prev,
                Some(n) => PageTo::Index(
                    n.as_u64()
                        .and_then(|n| u32::try_from(n).ok())
                        .ok_or("\"to\" must be \"next\", \"prev\" or a page number")?,
                ),
                None => return Err("\"to\" must be \"next\", \"prev\" or a page number".into()),
            };
            Ok(Act::Page {
                device: device(&body)?,
                to,
            })
        }
        Some("pair") => Ok(Act::Pair),
        Some("create") => {
            let name = if body.get("name").is_some() {
                Some(name(&body)?)
            } else {
                None
            };
            Ok(Act::Create {
                name,
                cols: side(&body, "cols", Some(DEFAULT_COLS))?,
                rows: side(&body, "rows", Some(DEFAULT_ROWS))?,
            })
        }
        Some("grid") => Ok(Act::Grid {
            device: device(&body)?,
            cols: side(&body, "cols", None)?,
            rows: side(&body, "rows", None)?,
        }),
        Some("rename") => Ok(Act::Rename {
            device: device(&body)?,
            name: name(&body)?,
        }),
        Some("forget") => Ok(Act::Forget {
            device: device(&body)?,
        }),
        _ => Err("\"op\" must be press, page, pair, create, grid, rename or forget".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(body: &str) -> Act {
        parse(body).unwrap_or_else(|e| panic!("{body}: {e}"))
    }

    #[test]
    fn reads_each_op() {
        assert_eq!(
            ok(r#"{"op":"press","device":"d","index":63,"down":true}"#),
            Act::Press {
                device: "d".into(),
                index: 63,
                down: true
            }
        );
        assert_eq!(
            ok(r#"{"op":"page","device":"d","to":"next"}"#),
            Act::Page {
                device: "d".into(),
                to: PageTo::Next
            }
        );
        assert_eq!(
            ok(r#"{"op":"page","device":"d","to":"prev"}"#),
            Act::Page {
                device: "d".into(),
                to: PageTo::Prev
            }
        );
        assert_eq!(
            ok(r#"{"op":"page","device":"d","to":2}"#),
            Act::Page {
                device: "d".into(),
                to: PageTo::Index(2)
            }
        );
        assert_eq!(ok(r#"{"op":"pair"}"#), Act::Pair);
        assert_eq!(
            ok(r#"{"op":"create"}"#),
            Act::Create {
                name: None,
                cols: 5,
                rows: 3
            }
        );
        assert_eq!(
            ok(r#"{"op":"create","name":" Desk ","cols":4,"rows":2}"#),
            Act::Create {
                name: Some("Desk".into()),
                cols: 4,
                rows: 2
            }
        );
        assert_eq!(
            ok(r#"{"op":"rename","device":"d","name":"New"}"#),
            Act::Rename {
                device: "d".into(),
                name: "New".into()
            }
        );
        assert_eq!(
            ok(r#"{"op":"forget","device":"d"}"#),
            Act::Forget { device: "d".into() }
        );
    }

    #[test]
    fn clamps_a_grid_to_one_to_eight_per_side() {
        assert_eq!(
            ok(r#"{"op":"grid","device":"d","cols":9,"rows":0}"#),
            Act::Grid {
                device: "d".into(),
                cols: 8,
                rows: 1
            }
        );
        assert_eq!(
            ok(r#"{"op":"grid","device":"d","cols":-3,"rows":100}"#),
            Act::Grid {
                device: "d".into(),
                cols: 1,
                rows: 8
            }
        );
        assert_eq!(
            ok(r#"{"op":"create","cols":20}"#),
            Act::Create {
                name: None,
                cols: 8,
                rows: 3
            }
        );
    }

    #[test]
    fn refuses_what_is_not_an_action() {
        let bad = [
            "",
            "nope",
            "[]",
            "{}",
            r#"{"op":"explode"}"#,
            r#"{"op":"press","index":1,"down":true}"#,
            r#"{"op":"press","device":"","index":1,"down":true}"#,
            r#"{"op":"press","device":"d","index":64,"down":true}"#,
            r#"{"op":"press","device":"d","index":-1,"down":true}"#,
            r#"{"op":"press","device":"d","index":1}"#,
            r#"{"op":"press","device":"d","index":1,"down":"yes"}"#,
            r#"{"op":"page","device":"d"}"#,
            r#"{"op":"page","device":"d","to":"first"}"#,
            r#"{"op":"page","device":"d","to":1.5}"#,
            r#"{"op":"grid","device":"d","cols":2}"#,
            r#"{"op":"grid","device":"d","cols":2.5,"rows":2}"#,
            r#"{"op":"create","name":""}"#,
            r#"{"op":"rename","device":"d"}"#,
            r#"{"op":"rename","device":"d","name":"   "}"#,
            r#"{"op":"forget"}"#,
        ];
        for body in bad {
            assert!(parse(body).is_err(), "{body}");
        }
        let long = format!(
            r#"{{"op":"rename","device":"d","name":"{}"}}"#,
            "x".repeat(41)
        );
        assert_eq!(
            parse(&long).unwrap_err(),
            "\"name\" must be 1 to 40 characters"
        );
        let device = format!(r#"{{"op":"forget","device":"{}"}}"#, "x".repeat(65));
        assert!(parse(&device).is_err());
    }
}
