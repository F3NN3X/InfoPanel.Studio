//! WLMouse (VID 36A7): Beast X 8K, Beast X Mini / Mini Pro, Beast X Pro, Beast MAX, Sword X 8K and
//! their receivers. The Sword X 8K ids (A878 receiver, A879 cable) and its FFFF:0000 collection come
//! from an owner's --dump (issue #75). The Beast X V2 8K receiver (A856) comes from an owner's
//! --dump (issue #121): it exposes the same 65-byte FFFF:0000 collection on interface 2 as the other
//! 8K receivers, so it gets the same query (HaloBattery sends it to every 36A7 product id). Its
//! cable id is not known yet.
//! Read-only status query on the vendor collection (usage page FFFF, 65-byte feature report 0):
//!   SET_FEATURE [00][00][00][02][02][00][83][00 ...], then GET_FEATURE report 0 until
//!   [00][status][00][02][02][00][83][charging][battery%]; status A1 / A2 = answered, A0 = mouse asleep.
//!   No checksum. The receiver answers for the mouse; a silent receiver means the mouse is asleep or
//!   off.
//! From github.com/djnawara/mouse-gauge (verified on a Beast X 8K through its A883 receiver) and
//! github.com/Waturus/HaloBattery (providers/wlmouse.py; A880 receiver confirmed on hardware).
//! Not handled: A887 / A888 (Beast X 4K / original Beast X). The sources disagree on their protocol
//! (an output report 04 query, or a different CRC framing) and one reports they never answer this
//! query.
use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::sleep_ms;

const K_VID: u16 = 0x36A7;

// Cables come before receivers: a mouse on its cable with the receiver also plugged in shows up under
// both ids, so a cable that answers claims its receiver (`receiver_pid`) and the mouse is listed once.
struct Model {
    pid: u16,
    receiver: bool,
    name: &'static str,
    receiver_pid: u16,
}
const K_MODELS: [Model; 12] = [
    Model { pid: 0xA879, receiver: false, name: "WLMouse Sword X 8K", receiver_pid: 0xA878 },
    Model { pid: 0xA884, receiver: false, name: "WLMouse Beast X 8K", receiver_pid: 0xA883 },
    Model { pid: 0xA860, receiver: false, name: "WLMouse mouse", receiver_pid: 0 },
    Model { pid: 0xA866, receiver: false, name: "WLMouse mouse", receiver_pid: 0 },
    Model { pid: 0xA867, receiver: false, name: "WLMouse mouse", receiver_pid: 0 },
    // 8K receiver; seen with a Beast X V2 Max
    Model { pid: 0xA856, receiver: true, name: "WLMouse Beast X V2", receiver_pid: 0 },
    Model { pid: 0xA868, receiver: true, name: "WLMouse Beast X Mini Pro", receiver_pid: 0 },
    Model { pid: 0xA870, receiver: true, name: "WLMouse Beast X Pro", receiver_pid: 0 },
    Model { pid: 0xA878, receiver: true, name: "WLMouse Sword X 8K", receiver_pid: 0 },
    Model { pid: 0xA880, receiver: true, name: "WLMouse Beast MAX", receiver_pid: 0 },
    Model { pid: 0xA883, receiver: true, name: "WLMouse Beast X 8K", receiver_pid: 0 },
    Model { pid: 0xA885, receiver: true, name: "WLMouse Beast X Mini", receiver_pid: 0 },
];

#[derive(PartialEq, Eq, Clone, Copy)]
enum Reply {
    Battery,
    Asleep,
    None,
}

fn query(d: &mut dyn HidIo, pct: &mut i32, charging: &mut bool) -> Reply {
    let mut req = vec![0u8; 65]; // [0] = report id 0
    req[3] = 0x02;
    req[4] = 0x02;
    req[6] = 0x83;
    for _attempt in 0..2 {
        if !d.set_feature(&req) {
            return Reply::None;
        }
        for _read in 0..6 {
            sleep_ms(60);
            let mut r = Vec::new();
            if !d.get_feature(0x00, &mut r) || r.len() < 9 {
                return Reply::None;
            }
            if r[3] != 0x02 || r[4] != 0x02 || r[6] != 0x83 {
                continue;
            } // not the reply (yet)
            if r[1] == 0xA0 {
                return Reply::Asleep;
            }
            if r[1] != 0xA1 && r[1] != 0xA2 {
                continue;
            } // still our own request echoed back
            if r[8] > 100 {
                return Reply::None;
            }
            *pct = r[8] as i32;
            *charging = r[7] == 0x01;
            return Reply::Battery;
        }
    }
    Reply::None
}

pub fn poll_wlmouse(ctx: &mut PollContext) {
    for m in &K_MODELS {
        if ctx.is_claimed(K_VID, m.pid) {
            continue;
        }
        let mut colls = ctx.find(K_VID, m.pid, |c| c.page() == 0xFFFF && c.feat_len() >= 65);
        // Usage 0 is the collection that answers in both sources; try it first (stable sort).
        colls.sort_by_key(|c| c.usage() != 0);
        for c in colls {
            let Some(mut d) = ctx.open_feature_only(&c) else { continue };
            let (mut pct, mut charging) = (-1i32, false);
            let rep = query(&mut *d, &mut pct, &mut charging);
            if rep == Reply::None {
                continue;
            }
            let mut s = DeviceStatus {
                key: format!("wlmouse:{}", hex4(m.pid)),
                name: m.name.into(),
                kind: DeviceKind::Mouse,
                via: if m.receiver { "2.4 GHz receiver" } else { "USB cable" }.into(),
                ..Default::default()
            };
            if m.receiver {
                s.grace_sec = 1800;
            } // a sleeping mouse can leave the receiver silent
            if rep == Reply::Asleep {
                s.asleep = true; // shown with the last known value
            } else {
                s.percent = pct;
                s.charging = charging;
            }
            ctx.add(s, K_VID, m.pid);
            // same mouse, already listed via its cable
            if m.receiver_pid != 0 {
                ctx.claim(K_VID, m.receiver_pid);
            }
            break;
        }
    }
}
