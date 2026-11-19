//! JBL Quantum 520 / 650 / 850 / 950 (and X variants) headsets, vendor 0ECB, "HIDV3" protocol on the
//! vendor collection with usage page FF12 (64-byte reports: input 86, output 87, feature 88).
//!   request (feature 88): [88][00 DD][01 00][01][00][02 00][feature lo][feature hi]
//!            identifier DD00 = the device itself, command 0001 = get device info, 1 packet, index 0,
//!            payload = the 2-byte feature id
//!   reply   (input 86):   [86][00 DD][01 00][01][00][len lo][len hi][status lo][status hi]
//!                         [feature lo][feature hi][size lo][size hi][value...]
//!            status bit 15 set = error
//! Battery = feature 000D, one byte: bit 7 charging, bits 0..6 percent.
//! Read from JBL QuantumENGINE 2.9.4 (HIDV3Device / PowerFeature.Battery.HIDV3Left) and checked
//! against a Quantum 650 Wireless on its 2.4 GHz dongle; the other models use the same code path there.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::now_ms;

const VID: u16 = 0x0ECB;
const BATTERY_FEATURE: u16 = 0x000D;

struct Model { pid: u16, name: &'static str, dongle: bool }

const MODELS: [Model; 14] = [
    Model { pid: 0x2125, name: "JBL Quantum 650 Wireless", dongle: true },
    Model { pid: 0x2126, name: "JBL Quantum 650 Wireless", dongle: false },
    Model { pid: 0x213B, name: "JBL Quantum 650X Wireless", dongle: true },
    Model { pid: 0x213D, name: "JBL Quantum 650X Wireless", dongle: false },
    Model { pid: 0x2127, name: "JBL Quantum 950 Wireless", dongle: true },
    Model { pid: 0x2128, name: "JBL Quantum 950 Wireless", dongle: false },
    Model { pid: 0x213E, name: "JBL Quantum 950X Wireless", dongle: true },
    Model { pid: 0x2140, name: "JBL Quantum 950X Wireless", dongle: false },
    Model { pid: 0x218D, name: "JBL Quantum 520 Wireless", dongle: true },
    Model { pid: 0x218E, name: "JBL Quantum 520 Wireless", dongle: false },
    Model { pid: 0x21A7, name: "JBL Quantum 520X Wireless", dongle: true },
    Model { pid: 0x21A9, name: "JBL Quantum 520X Wireless", dongle: false },
    Model { pid: 0x219A, name: "JBL Quantum 850 Wireless", dongle: true },
    Model { pid: 0x219B, name: "JBL Quantum 850 Wireless", dongle: false },
];

// With the headset switched off the dongle does not answer at all, so a timeout means "not there".
fn get_battery(d: &mut dyn HidIo, info: &mut u8) -> bool {
    d.flush();
    if !d.set_feature(&[0x88, 0x00, 0xDD, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
                        BATTERY_FEATURE as u8, (BATTERY_FEATURE >> 8) as u8]) {
        return false;
    }
    let end = now_ms() + 800;
    let mut r = Vec::new();
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as i32;
        if d.read(&mut r, left as u32) < 16 { return false; }
        // Only the reply to "get device info" sent to the device itself.
        if r[0] != 0x86 || r[1] != 0x00 || r[2] != 0xDD || r[3] != 0x01 || r[4] != 0x00 || r[5] != 0x01 {
            continue;
        }
        if r[10] & 0x80 != 0 { return false; }  // error status (bit 15)
        if r[11] != BATTERY_FEATURE as u8 || r[12] != (BATTERY_FEATURE >> 8) as u8 { continue; }
        if r[13] == 0 && r[14] == 0 { continue; }  // empty feature value
        *info = r[15];
        return (*info & 0x7F) <= 100;
    }
    false
}

pub fn poll_jbl(ctx: &mut PollContext) {
    for m in &MODELS {
        if ctx.is_claimed(VID, m.pid) { continue; }
        for c in ctx.find(VID, m.pid, |c| {
            c.page() == 0xFF12 && c.feat_len() >= 11 && c.in_len() >= 16
        }) {
            let Some(mut d) = ctx.open(&c) else { continue };
            let mut info: u8 = 0;
            if !get_battery(d.as_mut(), &mut info) { continue; }
            let s = DeviceStatus {
                key: format!("jbl:{}", hex4(m.pid)),
                name: m.name.into(),
                kind: DeviceKind::Headset,
                via: if m.dongle { "2.4 GHz receiver".into() } else { "USB cable".into() },
                percent: (info & 0x7F) as i32,
                charging: (info & 0x80) != 0,
                ..Default::default()
            };
            ctx.add(s, VID, m.pid);
            break;
        }
    }
}
