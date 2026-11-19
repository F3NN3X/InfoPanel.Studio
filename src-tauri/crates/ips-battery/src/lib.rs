//! The battery poll core, ported verbatim from the batterymon-proto prototype
//! (`hid.rs`, `devices.rs`, `win.rs` and the 55 driver modules).
//!
//! - Windows-only: the drivers talk to Win32/WinRT directly; non-Windows builds of the host
//!   take a stub and never link this crate.
//! - Polls are synchronous, single-threaded and may take seconds (receiver waits, BLE
//!   adverts). Run them from a worker thread and never overlap two polls: some drivers keep
//!   HID handles open across polls.
//! - Vendor drivers run first and claim the devices they handle; the generic fallbacks
//!   (Bluetooth, HID Battery Strength, XInput) only look at what is left.
//! - The prototype's taskbar/tray UI (`main.rs`, `widget.rs`, `report.rs`) is not ported. Its
//!   `HKCU\...\IgnoreDevices` registry read is replaced by the blocklist handed to
//!   [`devices::poll_all_devices_blocked`], and its tray-side grace/asleep bookkeeping is
//!   reimplemented by the host.

// The driver modules are a verbatim port of the batterymon-proto prototype: report formats,
// timeouts and retry loops are the tested contract and are not restyled. The style and
// complexity lint groups are silenced wholesale instead of hand-editing working protocol code.
#![allow(clippy::style, clippy::complexity)]
// Three perf lints remain in verbatim driver/test code (jabra map_entry, kysona + razer
// manual_contains, machenike + ninjutso useless_vec in tests) — behaviour-preserving only,
// so allowed here rather than edited.
#![allow(clippy::map_entry, clippy::manual_contains, clippy::useless_vec)]

pub mod devices;
pub mod drivers;
pub mod hid;
pub mod win;
