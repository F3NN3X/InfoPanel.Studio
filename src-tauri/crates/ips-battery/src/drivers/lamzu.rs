//! LAMZU wireless mice on their own vendor ids 373E and 37B0 (Maya X, Maya, Tachi, Inca, Paro, Thorn,
//! Atlantis Mini/OG Champion, Orcus ...). The Atlantis on Compx 3554 uses the Kysona driver instead.
//! Protocol from LAMZU's Aurora web driver (lamzu.net, "IsNewProtocol" models):
//!   SET_FEATURE report 0, 64 bytes: [00][00][02][02][00][83][00 ...]
//!   ~100 ms later GET_FEATURE report 0: [A1][..][..][02][..][83][charging][percent] after the report
//!   id byte (the web driver accepts the reply with or without that byte, so we do too).
//!   charging 1 = on the cable; percent 0 means the mouse is not linked to the dongle.
//! Model ids from lamzu.net/Config/env-models.json. Several newer models share one dongle id, so those
//! dongles get a generic name.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::sleep_ms;

struct M { vid: u16, pids: [u16; 3], name: &'static str }

const MODELS: [M; 19] = [
    M { vid: 0x373E, pids: [0x001C, 0x001D, 0x001E], name: "LAMZU Maya X" },
    M { vid: 0x373E, pids: [0x0016, 0, 0], name: "LAMZU Maya X V2" },
    M { vid: 0x37B0, pids: [0x001F, 0, 0], name: "LAMZU Maya X V2" },
    M { vid: 0x37B0, pids: [0x0005, 0x000B, 0x000C], name: "LAMZU Tachi" },
    M { vid: 0x37B0, pids: [0x001C, 0x001E, 0], name: "LAMZU Tachi Lite" },
    M { vid: 0x37B0, pids: [0x0009, 0x000F, 0x0010], name: "LAMZU Inca" },
    M { vid: 0x37B0, pids: [0x0011, 0x0013, 0x0015], name: "LAMZU Maya" },
    M { vid: 0x37B0, pids: [0x0007, 0x000D, 0x000E], name: "LAMZU Paro" },
    M { vid: 0x37B0, pids: [0x0017, 0x0019, 0x001B], name: "LAMZU Thorn" },
    M { vid: 0x37B0, pids: [0x0021, 0x0003, 0x0023], name: "LAMZU Thorn V2" },
    M { vid: 0x37B0, pids: [0x0030, 0x0032, 0x0040], name: "LAMZU Thorn V2" },
    M { vid: 0x37B0, pids: [0x0025, 0x0027, 0], name: "LAMZU Atlantis OG Champion" },
    M { vid: 0x37B0, pids: [0x0028, 0x002B, 0x002A], name: "LAMZU Atlantis Mini" },
    M { vid: 0x37B0, pids: [0x003E, 0x003F, 0], name: "LAMZU Atlantis Mini" },
    M { vid: 0x37B0, pids: [0x002C, 0x0052, 0], name: "LAMZU Maya M" },
    M { vid: 0x37B0, pids: [0x003A, 0x003B, 0x0044], name: "LAMZU Maya X" },
    M { vid: 0x37B0, pids: [0x003C, 0x0050, 0], name: "LAMZU Maya" },
    M { vid: 0x37B0, pids: [0x0042, 0x0056, 0], name: "LAMZU Orcus" },
    M { vid: 0x37B0, pids: [0x0046, 0x0054, 0], name: "LAMZU Mini" },
];

fn model_name(vid: u16, pid: u16) -> Option<&'static str> {
    for m in &MODELS {
        if m.vid != vid { continue; }
        for &p in &m.pids {
            if p != 0 && p == pid { return Some(m.name); }
        }
    }
    None
}

// Wired product ids: the mouse itself on the USB cable.
fn is_cable(vid: u16, pid: u16) -> bool {
    if vid == 0x373E { return pid == 0x001C; }
    matches!(pid, 0x0005 | 0x0007 | 0x0009 | 0x0011 | 0x0017 | 0x001C | 0x001F | 0x0021
        | 0x0025 | 0x0028 | 0x002C | 0x0030 | 0x0034 | 0x0038 | 0x003A | 0x003C
        | 0x003E | 0x0040 | 0x0042 | 0x0044 | 0x0046 | 0x0050 | 0x0052 | 0x0056)
}

pub fn poll_lamzu(ctx: &mut PollContext) {
    for vendor in [0x373Eu16, 0x37B0] {
        for &(vid, pid) in &ctx.products(vendor) {
            for c in ctx.find(vid, pid, |c| c.feat_len() == 65) {
                let Some(mut d) = ctx.open_feature_only(&c) else { continue };
                let mut req = vec![0u8; 65];  // [0] = report id 0
                req[3] = 0x02;
                req[4] = 0x02;
                req[6] = 0x83;
                if !d.set_feature(&req) { continue; }
                sleep_ms(100);
                let mut r = Vec::new();
                if !d.get_feature(0x00, &mut r) || r.len() < 10 { continue; }
                // The reply can carry the report id byte or not; both shapes are accepted.
                let (chg, pct): (u8, u8) = if r[1] == 0xA1 && r[4] == 0x02 && r[6] == 0x83 {
                    (r[7], r[8])
                } else if r[0] == 0xA1 && r[3] == 0x02 && r[5] == 0x83 {
                    (r[6], r[7])
                } else {
                    continue;
                };
                if pct > 100 { continue; }
                let cable = is_cable(vid, pid);
                let mut s = DeviceStatus {
                    key: format!("lamzu:{}:{}", hex4(vid), hex4(pid)),
                    name: model_name(vid, pid).unwrap_or("LAMZU wireless mouse").into(),
                    kind: DeviceKind::Mouse,
                    via: if cable { "USB cable".into() } else { "2.4 GHz receiver".into() },
                    connected: pct > 0 || cable,  // 0 from a dongle = mouse off or out of range
                    charging: chg == 1,
                    ..Default::default()
                };
                if pct > 0 { s.percent = pct as i32; }
                ctx.add(s, vid, pid);
                break;
            }
        }
    }
}
