//! MOONDROP GM01 Pro wireless headset (35D8:0133, WalkPlay chipset).
//!
//! 2.4 GHz dongle: exposes the WalkPlay control channel on interface 3, a consumer-page collection
//! with 64-byte input/output reports, report id 4B. Commands are [4B][dir][cmd][len][data...] with
//! dir 80 = read, 01 = write; only reads are sent here. The dongle forwards most reads to the
//! headset, so they go unanswered while the headset is not linked.
//!   [4B][80][27][00] -> [4B][80][27][06][00][00][00][00][link][percent]
//!     [8] link: 01 while the headset is on and paired; [9] percent: matched Moondrop Link (50%).
//!   [4B][80][31][00] -> [4B][80][31][01][link]: answered by the dongle itself; 01 with the headset
//!     linked, 00 once it switched to its USB cable.
//!
//! USB cable: the headset itself enumerates with the same 35D8:0133, but interface 3 then has a
//! single consumer-control collection (no &colNN in the path) and no control channel, so there is
//! no level to read. Plugged into the PC it is charging, so it is reported as charging and the app
//! keeps showing the last level, dimmed. While on the cable it drops the 2.4 GHz link.
//!
//! Verified on hardware (35D8:0133, firmware 1.5.3): level over the dongle, cable detection, 31 = 00
//! on the cable. Not seen yet: a charging flag while charging from a wall charger over 2.4 GHz.
//! Protocol framing: github.com/jeromeof/devicePEQ (walkplayHidHandler.js); the battery command
//! was found with a read-only scan of the READ command ids.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidColl, HidIo, PollContext};
use crate::win::now_ms;

const VID: u16 = 0x35D8;  // WalkPlay; shared by other DACs/dongles, so only known product ids
const GM01_PRO: u16 = 0x0133;
const REPORT: u8 = 0x4B;
const READ: u8 = 0x80;
const CMD_BATTERY: u8 = 0x27;
const CMD_LINK: u8 = 0x31;

// Sends a READ for `cmd` and waits for its reply ([4B][80][cmd][len]...).
fn query(d: &mut dyn HidIo, cmd: u8, r: &mut Vec<u8>) -> bool {
    d.flush();
    if !d.write(&[REPORT, READ, cmd, 0x00], 500) { return false; }
    let end = now_ms() + 400;
    loop {
        let left = (end as i64 - now_ms() as i64) as i32;
        if left <= 0 || d.read(r, left as u32) < 5 { return false; }
        if r[0] == REPORT && r[1] == READ && r[2] == cmd { return true; }
    }
}

// Windows adds &colNN to the path only for devices with several top-level collections; the
// dongle has four on interface 3, the headset on its cable has one.
fn is_single_collection(c: &HidColl) -> bool {
    !c.path.to_lowercase().contains("&col")
}

pub fn poll_moondrop(ctx: &mut PollContext) {
    if ctx.is_claimed(VID, GM01_PRO) { return; }
    let mut s = DeviceStatus {
        key: format!("moondrop:{}", hex4(GM01_PRO)),
        name: "MOONDROP GM01 Pro".into(),
        kind: DeviceKind::Headset,
        grace_sec: 1800,
        ..Default::default()
    };

    let mut found = false;       // a GM01 Pro (dongle or cable) is present
    let mut dongle_unlinked = false;
    for c in ctx.find(VID, GM01_PRO, |c| c.iface == 3 && c.page() == 0x000C) {
        found = true;
        if c.out_len() < 4 || c.in_len() < 10 { continue; }  // only the dongle's control channel
        let mut r = Vec::new();
        let Some(mut d) = ctx.open(&c) else { continue };
        if query(d.as_mut(), CMD_BATTERY, &mut r) && r.len() >= 10 && r[3] >= 6 && r[8] != 0 && r[9] <= 100 {
            s.via = "2.4 GHz receiver".into();
            s.percent = r[9] as i32;
            ctx.add(s, VID, GM01_PRO);
            return;
        }
        if query(d.as_mut(), CMD_LINK, &mut r) && r[3] >= 1 && r[4] == 0 { dongle_unlinked = true; }
    }
    if !found { return; }

    let mut on_cable = false;
    for c in ctx.find(VID, GM01_PRO, |c| c.iface == 3) {
        on_cable |= is_single_collection(&c);
    }
    if on_cable {
        s.via = "USB cable".into();
        s.charging = true;  // level unknown on the cable; the app keeps the last one, dimmed
        ctx.add(s, VID, GM01_PRO);
    } else if dongle_unlinked {
        s.via = "2.4 GHz receiver".into();
        s.connected = false;  // headset switched off or out of range
        ctx.add(s, VID, GM01_PRO);
    } else {
        ctx.claim(VID, GM01_PRO);  // no answer: let the app keep the last value (graceSec)
    }
}
