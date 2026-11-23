//! Pulsar X2 V3 / X2 V3 eS and other Sonix-based Pulsar mice on vendor id 3710:
//!   X2 V3:    USB cable 3402 ("X2 v3"), 1K dongle 5402 (confirmed by a user's --dump, issue #54)
//!   X2 V3 eS: USB cable 3406, 8K dongle 5403
//! Both dongles are shared with other Pulsar mice (Xlite V4, X3), so on a dongle the mouse gets a
//! generic name. These do not speak the 17-byte report 08 protocol of the Kysona driver.
//! Protocol from github.com/darthsoup/PulsarBattery (Sonix64Protocol.cs / Sonix64Backend.cs) and
//! github.com/bluesceada/pulsar-mouse-linux (drivers/xlite_v4_wireless.py, verified on 5402 with an X3):
//!   Feature report 0, 64-byte packet: [00][category][register][sub][00 ...][sum lo][sum hi],
//!   sum = 16-bit sum of packet bytes 0..61 (little endian in bytes 62..63).
//!   Battery read = 08 81 01. SET_FEATURE, then GET_FEATURE every ~50 ms until the reply echoes the
//!   command: [status][08][81][01][..][..][percent] (packet byte 6, FF = no reading).
//!   Status 01 = answered, 02 = still pending. 05 means "mouse not linked / asleep" in
//!   pulsar-mouse-linux but "pending" in PulsarBattery, so we keep polling on 05 and only treat it as
//!   "mouse off" if it is still the last answer when we give up.
//!   The vendor collection (FFFF:0001) is on interfaces 2 and 3; interface 2 rejects SET_FEATURE, so
//!   higher interfaces are tried first.
//!   No reliable charging register: on the cable the mouse is charging; 0% from a dongle means the
//!   mouse is off or out of range.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4, hid_product};
use crate::win::sleep_ms;

const K_VID: u16 = 0x3710;

struct Product {
    pid: u16,
    cable: bool,
    name: Option<&'static str>,
}
const K_PRODUCTS: &[Product] = &[
    Product { pid: 0x3402, cable: true, name: Some("Pulsar X2 V3") },
    Product { pid: 0x3406, cable: true, name: Some("Pulsar X2 V3 eS") },
    Product { pid: 0x5402, cable: false, name: None }, // 1K dongle
    Product { pid: 0x5403, cable: false, name: None }, // 8K dongle
];

#[derive(PartialEq, Eq)]
enum Reply {
    Battery,
    Offline,
    None,
}

/// Reads the battery percent into `pct`. Offline = the dongle answered that the mouse is not linked.
fn read_battery(d: &mut dyn HidIo, pct: &mut i32) -> Reply {
    let mut req = vec![0u8; 65]; // [0] = report id 0, then the 64-byte packet
    let p = &mut req[1..];
    p[1] = 0x08;
    p[2] = 0x81;
    p[3] = 0x01;
    let mut sum: u32 = 0;
    for i in 0..62 {
        sum += p[i] as u32;
    }
    p[62] = (sum & 0xFF) as u8;
    p[63] = (sum >> 8) as u8;
    let mut saw_offline = false;
    for _attempt in 0..3 {
        if !d.set_feature(&req) {
            return Reply::None;
        }
        for _read in 0..6 {
            sleep_ms(50);
            let mut r: Vec<u8> = Vec::new();
            if !d.get_feature(0x00, &mut r) || r.len() < 65 {
                return Reply::None;
            }
            let w = &r[1..];
            if w[1] != 0x08 || w[2] != 0x81 || w[3] != 0x01 {
                continue;
            } // not our reply (yet)
            if w[0] == 0x01 {
                if w[6] > 100 {
                    return Reply::None;
                } // FF = no reading
                *pct = w[6] as i32;
                return Reply::Battery;
            }
            saw_offline = w[0] == 0x05; // 02 (or 05) = pending: keep polling
        }
    }
    if saw_offline { Reply::Offline } else { Reply::None }
}

pub fn poll_pulsar(ctx: &mut PollContext) {
    for prod in K_PRODUCTS {
        if ctx.is_claimed(K_VID, prod.pid) {
            continue;
        }
        let mut colls = ctx.find(K_VID, prod.pid, |c| c.feat_len() >= 65);
        colls.sort_by(|a, b| b.iface.cmp(&a.iface));
        for c in colls {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let mut pct = -1;
            let rep = read_battery(&mut d, &mut pct);
            if rep == Reply::None {
                continue;
            }
            let mut s = DeviceStatus::default();
            s.key = format!("pulsar:{}", hex4(prod.pid));
            s.kind = DeviceKind::Mouse;
            if prod.cable {
                s.name = prod.name.unwrap().into();
                s.via = "USB cable".into();
                s.charging = true;
            } else {
                let n = hid_product(&c);
                let generic = n.is_empty() || n.contains("Dongle") || n.contains("Receiver");
                s.name = if generic { "Pulsar wireless mouse".into() } else { n }; // the dongles are shared by several models
                s.via = "2.4 GHz receiver".into();
                s.connected = rep == Reply::Battery && pct > 0;
            }
            if rep == Reply::Battery && (pct > 0 || prod.cable) {
                s.percent = pct;
            }
            ctx.add(s, K_VID, prod.pid);
            break;
        }
    }
}
