// The statusline command the agent wrapped, carried as base64url so its quotes survive the shell.

use base64::alphabet;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig, URL_SAFE_NO_PAD};
use base64::engine::DecodePaddingMode;
use base64::Engine;

/// Node's `Buffer.from(x, "base64url")` is forgiving, and so is this: either alphabet, padding or
/// none, stray characters skipped, decoding stops at the first `=`.
const LENIENT: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

pub fn encode(command: &str) -> String {
    URL_SAFE_NO_PAD.encode(command.as_bytes())
}

pub fn decode(text: &str) -> String {
    let mut clean: String = text
        .chars()
        .take_while(|&c| c != '=')
        .filter_map(|c| match c {
            '-' => Some('+'),
            '_' => Some('/'),
            c if c.is_ascii_alphanumeric() || c == '+' || c == '/' => Some(c),
            _ => None,
        })
        .collect();
    // One character is not a whole byte; Node drops it.
    if clean.len() % 4 == 1 {
        clean.pop();
    }
    let bytes = LENIENT.decode(clean).unwrap_or_default();
    String::from_utf8_lossy(&bytes).into_owned()
}

/// The `--wrap=` value among the arguments (the first such argument).
pub fn wrapped_command(args: &[String]) -> String {
    args.iter()
        .find_map(|a| a.strip_prefix("--wrap="))
        .map(decode)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_quotes_and_unicode() {
        let cmd = r#"node "C:/Users/me/.claude/statusline.mjs" --x='y' æøå"#;
        assert_eq!(decode(&encode(cmd)), cmd);
        assert!(encode(cmd)
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn decodes_as_leniently_as_node() {
        assert_eq!(decode("aGk"), "hi");
        assert_eq!(decode("aGk="), "hi");
        assert_eq!(decode("aG k\n"), "hi");
        assert_eq!(decode("aGkxa"), "hi1");
        assert_eq!(decode(""), "");
        assert_eq!(decode("!!!"), "");
        // Standard-alphabet characters are accepted too.
        assert_eq!(decode("+/8"), "\u{fffd}\u{fffd}");
    }
}
