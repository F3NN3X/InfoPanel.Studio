# Parity fixtures

Frozen output of the Node server (`server.mjs` and `server/*.mjs`), which was removed in 1.3.0 once the native server
(`ips-server`) had replaced it. Each file holds cases of an input and the output the Node server gave. The Rust tests in
`src-tauri/crates/ips-server/tests/parity*.rs` read them and require the same output from the native code. They are the
spec the port was held to and are never regenerated: a change here means the behaviour of the server changed, and the
case is edited by hand along with `docs/server-contract.md`.
