// The JavaScript conversions the Node server leans on (`String.prototype.trim`, `Number(string)`, number to string and
// property keys), so a value reads and prints here as it did there.

use serde_json::Value;

/// Whether `c` is one of the characters `String.prototype.trim` removes.
pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n'
            | '\u{b}'
            | '\u{c}'
            | '\r'
            | ' '
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

/// `s.trim()`.
pub fn trim(s: &str) -> &str {
    s.trim_matches(is_js_space)
}

/// `Number(s)`: NaN when `s` is not a number literal, 0 when it is blank.
pub fn string_to_number(s: &str) -> f64 {
    let t = trim(s);
    if t.is_empty() {
        return 0.0;
    }
    for (prefix, radix) in [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)] {
        if let Some(digits) = t.strip_prefix(prefix) {
            if digits.is_empty() {
                return f64::NAN;
            }
            return digits.chars().try_fold(0.0, |acc, c| c.to_digit(radix).map(|d| acc * radix as f64 + d as f64)).unwrap_or(f64::NAN);
        }
    }
    let unsigned = t.strip_prefix(['+', '-']).unwrap_or(t);
    if unsigned == "Infinity" {
        return if t.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY };
    }
    if !is_decimal_literal(unsigned) {
        return f64::NAN;
    }
    t.parse().unwrap_or(f64::NAN)
}

/// `digits[.digits]` or `.digits`, then an optional exponent.
fn is_decimal_literal(s: &str) -> bool {
    let (mantissa, exponent) = match s.find(['e', 'E']) {
        Some(i) => (&s[..i], Some(&s[i + 1..])),
        None => (s, None),
    };
    let (int, frac) = mantissa.split_once('.').unwrap_or((mantissa, ""));
    let digits = |p: &str| p.bytes().all(|b| b.is_ascii_digit());
    if !digits(int) || !digits(frac) || (int.is_empty() && frac.is_empty()) {
        return false;
    }
    match exponent {
        None => true,
        Some(e) => {
            let e = e.strip_prefix(['+', '-']).unwrap_or(e);
            !e.is_empty() && digits(e)
        }
    }
}

/// `String(n)`: the shortest digits that read back as `n`, in JavaScript's notation (`1e+21`, `1e-7`, `0.000001`).
pub fn number_to_string(n: f64) -> String {
    if n.is_nan() {
        return "NaN".into();
    }
    if n == 0.0 {
        return "0".into();
    }
    if n.is_infinite() {
        return if n > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    let sign = if n < 0.0 { "-" } else { "" };
    let sci = format!("{:e}", n.abs());
    let (mantissa, exp) = sci.split_once('e').unwrap_or((&sci, "0"));
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let point = exp.parse::<i32>().unwrap_or(0) + 1;
    let body = if k <= point && point <= 21 {
        format!("{digits}{}", "0".repeat((point - k) as usize))
    } else if 0 < point && point <= 21 {
        format!("{}.{}", &digits[..point as usize], &digits[point as usize..])
    } else if -6 < point && point <= 0 {
        format!("0.{}{digits}", "0".repeat(-point as usize))
    } else {
        let e = point - 1;
        let m = if k == 1 { digits } else { format!("{}.{}", &digits[..1], &digits[1..]) };
        format!("{m}e{}{}", if e >= 0 { "+" } else { "-" }, e.abs())
    };
    format!("{sign}{body}")
}

/// A JSON number as JavaScript holds it (a double) and prints it.
pub fn json_number_to_string(n: &serde_json::Number) -> String {
    const SAFE: u64 = 1 << 53;
    if let Some(u) = n.as_u64().filter(|u| *u <= SAFE) {
        return u.to_string();
    }
    if let Some(i) = n.as_i64().filter(|i| i.unsigned_abs() <= SAFE) {
        return i.to_string();
    }
    number_to_string(n.as_f64().unwrap_or(f64::NAN))
}

/// `String(v)` for a property key (`obj[v]`); `None` is `undefined`.
pub fn to_property_key(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => json_number_to_string(n),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|item| if item.is_null() { String::new() } else { to_property_key(Some(item)) })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

/// `Number(v)` for a JSON value; `None` is `undefined`.
pub fn value_to_number(v: Option<&Value>) -> f64 {
    match v {
        None | Some(Value::Object(_)) => f64::NAN,
        Some(Value::Null) => 0.0,
        Some(Value::Bool(b)) => f64::from(u8::from(*b)),
        Some(Value::Number(n)) => n.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(s)) => string_to_number(s),
        Some(array) => string_to_number(&to_property_key(Some(array))),
    }
}

/// `new Date(ms).toISOString()` for a time in range.
pub fn iso_string(ms: i64) -> String {
    let (days, in_day) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    // Civil date from a day count (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    let (h, m, s, milli) = (in_day / 3_600_000, in_day / 60_000 % 60, in_day / 1000 % 60, in_day % 1000);
    format!("{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}.{milli:03}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_print_as_javascript_prints_them() {
        let cases = [
            (1.0, "1"),
            (1e21, "1e+21"),
            (1e20, "100000000000000000000"),
            (1e-7, "1e-7"),
            (0.000001, "0.000001"),
            (-0.0, "0"),
            (0.1, "0.1"),
            (123e-20, "1.23e-18"),
            (5e-324, "5e-324"),
            (1.7976931348623157e308, "1.7976931348623157e+308"),
            (-1.5, "-1.5"),
            (12345678901234567890.0, "12345678901234567000"),
        ];
        for (n, s) in cases {
            assert_eq!(number_to_string(n), s, "{n}");
        }
    }

    #[test]
    fn strings_read_as_number_reads_them() {
        assert_eq!(string_to_number(""), 0.0);
        assert_eq!(string_to_number(" 12 "), 12.0);
        assert_eq!(string_to_number("0x10"), 16.0);
        assert_eq!(string_to_number("1e3"), 1000.0);
        assert_eq!(string_to_number(".5"), 0.5);
        assert_eq!(string_to_number("5."), 5.0);
        assert_eq!(string_to_number("-Infinity"), f64::NEG_INFINITY);
        for bad in ["abc", "1_0", "0x", "inf", "NaN", "1e", "-0x10", ".", "+"] {
            assert!(string_to_number(bad).is_nan(), "{bad}");
        }
    }

    #[test]
    fn values_read_as_number_and_dates_print_as_iso() {
        use serde_json::json;
        assert!(value_to_number(None).is_nan());
        assert_eq!(value_to_number(Some(&json!(null))), 0.0);
        assert_eq!(value_to_number(Some(&json!(true))), 1.0);
        assert_eq!(value_to_number(Some(&json!("5"))), 5.0);
        assert_eq!(value_to_number(Some(&json!([]))), 0.0);
        assert_eq!(value_to_number(Some(&json!([7]))), 7.0);
        assert!(value_to_number(Some(&json!([1, 2]))).is_nan());
        assert!(value_to_number(Some(&json!({}))).is_nan());
        assert_eq!(iso_string(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_string(1_709_210_096_789), "2024-02-29T12:34:56.789Z");
    }
}
