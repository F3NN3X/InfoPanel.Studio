//! BenQ ZOWIE wireless mice (VID 04A5). Zowie ships no software; these vendor commands were
//! reverse-engineered by the community. Only the read-only battery commands below are ever sent
//! (other EC-CW commands reboot the receiver and unpair the mouse).
//!  * EC-CW series (EC1/EC2/EC3-CW): receiver 8006, cable 8005. Unnumbered 64-byte output report
//!    [A5 03]; reply [mV lo][mV hi][percent]... mV = 0 when the mouse is not linked.
//!    The Enhanced Receiver declares this collection on usage page 00FF instead of FFxx.
//!    From github.com/yleshchuk/zowie-battery.
//!  * DW series (U2-DW, S2-DW ...): receiver 800A. Output report 08 [B4 15] on usage page FF03,
//!    reply input report 09 on usage page FF04: mV = ([1] * 256 + [2]) * 10, [4] == C8.
//!    From github.com/IgnacioBarb/zowie-battery-tray (MIT).
//!  * U2: receiver 8008 (product string "BenQ ZOWIE Gaming Mouse"), same FF03 / FF04 layout and
//!    commands as the DW series.
//! On the charging dock the mouse charges over contacts, so nothing new shows up on USB; over radio
//! only the voltage arrives. Charging is therefore inferred from how the voltage moves (same rules
//! as zowie-battery-tray): a rise of 50 mV above the lowest reading means it went on the dock, a
//! drop of 20 mV below the highest means it came off. The receiver only passes on a new voltage
//! when the mouse sends one, so readings change in steps.

use std::collections::BTreeMap;
use std::sync::Mutex;

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4, hid_product, interpolate};
use crate::win::now_ms;

// Voltage -> % anchored on the mouse's own LED thresholds (10 / 25 / 50 %).
fn zowie_percent(mv: i32) -> i32 {
    interpolate(mv, &[4200, 4000, 3890, 3760, 3680, 3500], &[100, 75, 50, 25, 10, 0])
}

// Charging guess from the voltage trend of one receiver. Only touched by the polling thread.
#[derive(Default)]
struct ChargeTrend {
    has: bool,
    charging: bool,
    peak: i32,
    trough: i32,
}

impl ChargeTrend {
    fn update(&mut self, mv: i32) -> bool {
        if !self.has {
            self.has = true;
            self.charging = mv >= 4250; // a resting Li-ion cell never sits above ~4.2 V
            self.peak = mv;
            self.trough = mv;
        } else if self.charging {
            self.peak = self.peak.max(mv);
            if mv <= self.peak - 20 {
                self.charging = false;
                self.trough = mv;
            }
        } else {
            self.trough = self.trough.min(mv);
            if mv >= self.trough + 50 {
                self.charging = true;
                self.peak = mv;
            }
        }
        self.charging
    }
}
static G_TREND: Mutex<BTreeMap<u16, ChargeTrend>> = Mutex::new(BTreeMap::new());

fn poll_cw(ctx: &mut PollContext, pid: u16) -> bool {
    for c in ctx.find(0x04A5, pid, |c| (c.page() >= 0xFF00 || c.page() == 0x00FF) && c.out_len() == 65) {
        let Some(mut d) = ctx.open(&c) else { continue };
        d.flush();
        if !d.write(&[0x00, 0xA5, 0x03], 500) {
            continue;
        }
        let mut r = Vec::new();
        if d.read(&mut r, 1000) < 3 {
            continue;
        }
        let mv = r[0] as i32 | ((r[1] as i32) << 8);
        if mv != 0 && (mv < 3000 || mv > 4500) {
            continue;
        } // not a battery reply
        let mut s =
            DeviceStatus { key: format!("zowie:{}", hex4(pid)), name: "ZOWIE EC-CW".into(), kind: DeviceKind::Mouse, ..Default::default() };
        s.via = if pid == 0x8005 { "USB cable" } else { "2.4 GHz receiver" }.into();
        s.charging = pid == 0x8005;
        if mv == 0 {
            s.connected = false;
        } else {
            s.millivolts = mv;
            s.percent = if r[2] >= 1 && r[2] <= 100 { r[2] as i32 } else { zowie_percent(mv) };
        }
        ctx.add(s, 0x04A5, pid);
        return true;
    }
    false
}

fn poll_dw(ctx: &mut PollContext, pid: u16) -> bool {
    let cmd_colls = ctx.find(0x04A5, pid, |c| c.page() == 0xFF03 && c.out_len() == 16);
    let rep_colls = ctx.find(0x04A5, pid, |c| c.page() == 0xFF04 && c.in_len() == 16);
    if cmd_colls.is_empty() || rep_colls.is_empty() {
        return false;
    }
    // open the reply channel first
    let Some(mut reply_dev) = ctx.open(&rep_colls[0]) else { return false };
    let Some(mut command_dev) = ctx.open(&cmd_colls[0]) else { return false };
    reply_dev.flush();
    if !command_dev.write(&[0x08, 0xB4, 0x15], 500) {
        return false;
    }
    let mut r = Vec::new();
    let end = now_ms() + 1500;
    let mut ok = false;
    while (end as i64 - now_ms() as i64) > 0 {
        let left = (end as i64 - now_ms() as i64) as u32;
        if reply_dev.read(&mut r, left) < 5 {
            break;
        }
        if r[0] == 0x09 {
            ok = true;
            break;
        }
    }
    if !ok || r[1] == 0xE6 || r[4] != 0xC8 {
        return false;
    }
    let mv = (r[1] as i32 * 256 + r[2] as i32) * 10;
    let cable = pid != 0x800A && pid != 0x8008; // 800A: DW receiver, 8008: U2 receiver
    let mut s = DeviceStatus { key: format!("zowie:{}", hex4(pid)), kind: DeviceKind::Mouse, ..Default::default() };
    s.name = hid_product(&cmd_colls[0]);
    if pid == 0x8008 {
        s.name = "ZOWIE U2".into(); // its receiver only reports "BenQ ZOWIE Gaming Mouse"
    } else if s.name.is_empty() || s.name.contains("Receiver") {
        s.name = "ZOWIE DW mouse".into();
    }
    s.via = if cable { "USB cable" } else { "2.4 GHz receiver" }.into();
    if mv == 0 {
        s.connected = false;
    } else {
        s.millivolts = mv;
        s.percent = zowie_percent(mv);
        s.charging = cable || {
            let mut g = G_TREND.lock().unwrap();
            g.entry(pid).or_default().update(mv)
        };
    }
    ctx.add(s, 0x04A5, pid);
    true
}

pub fn poll_zowie(ctx: &mut PollContext) {
    for &(_vid, pid) in &ctx.products(0x04A5) {
        if pid == 0x8005 || pid == 0x8006 {
            poll_cw(ctx, pid);
        } else {
            poll_dw(ctx, pid); // only acts on devices with the DW command/reply collections
        }
    }
}
