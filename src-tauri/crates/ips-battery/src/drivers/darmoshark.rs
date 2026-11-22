//! Darmoshark M3 over its Telink receiver. Protocol reference:
//! https://github.com/Barba2k2/darmoshark-m3-configurator/blob/main/PROTOCOL.md

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{HidIo, PollContext, hex4};
use crate::win::now_ms;

const VID: u16 = 0x248A;
const RECEIVER: u16 = 0xFF30;
const MOUSE: u16 = 0xFF12;
const FEATURE: u8 = 0x51;
const BOND: u8 = 0x03;
const IDENTIFY: u8 = 0x06;
const RECEIVER_TIMEOUT_MS: u64 = 1000;
const FIRST_ATTEMPT_MS: u64 = 300;
const QUERY_TIMEOUT_MS: u64 = 500;

fn read_id(reply: &[u8], offset: usize) -> u16 {
    (reply[offset] as u16) | ((reply[offset + 1] as u16) << 8)
}

fn query(device: &mut dyn HidIo, opcode: u8, reply: &mut Vec<u8>, receiver_deadline: u64) -> bool {
    let start = now_ms();
    if start >= receiver_deadline {
        return false;
    }
    let deadline = receiver_deadline.min(start + QUERY_TIMEOUT_MS);

    device.flush();
    if now_ms() >= deadline || !device.set_feature(&[FEATURE, opcode]) {
        return false;
    }

    let mut input = Vec::new();
    let mut now = now_ms();
    while now < deadline {
        let wait_ms = 20u64.min(deadline - now) as u32;
        if device.read(&mut input, wait_ms) >= 3 && input[0] == 0x54 && input[1] == 0xE4 && input[2] == 2 {
            return false;
        }
        if now_ms() >= deadline {
            return false;
        }
        if device.get_feature(FEATURE, reply) && reply.len() >= 12 && reply[0] == FEATURE && reply[1] == opcode {
            return now_ms() < deadline;
        }
        now = now_ms();
    }
    false
}

fn read_battery(device: &mut dyn HidIo, deadline: u64) -> i32 {
    // The bond query replaces any previous battery reply in the receiver's
    // feature buffer before we request another one.
    let mut reply = Vec::new();
    if !query(device, BOND, &mut reply, deadline) || read_id(&reply, 3) != VID || read_id(&reply, 5) != MOUSE || reply[7] == 0 {
        return -1;
    }
    if !query(device, IDENTIFY, &mut reply, deadline)
        || reply[2] != 1
        || read_id(&reply, 4) != VID
        || read_id(&reply, 6) != MOUSE
        || reply[11] > 100
    {
        return -1;
    }
    reply[11] as i32
}

pub fn poll_darmoshark(ctx: &mut PollContext) {
    if ctx.is_claimed(VID, RECEIVER) {
        return;
    }
    for coll in ctx.find(VID, RECEIVER, |c| {
        c.iface == 1 && c.page() == 0x008C && c.usage() == 1 && c.in_len() == 33 && c.out_len() == 33 && c.feat_len() == 1001
    }) {
        let deadline = now_ms() + RECEIVER_TIMEOUT_MS;
        let Some(mut device) = ctx.open(&coll) else { continue };

        // Leave time to reread the bond and retry if the first battery request goes unanswered.
        let first_deadline = deadline.min(now_ms() + FIRST_ATTEMPT_MS);
        let mut percent = read_battery(device.as_mut(), first_deadline);
        if percent < 0 && now_ms() < deadline {
            percent = read_battery(device.as_mut(), deadline);
        }
        if percent < 0 {
            continue;
        }

        let status = DeviceStatus {
            key: format!("darmoshark:{}:{}:{}", hex4(coll.vid), hex4(coll.pid), coll.iface),
            name: "Darmoshark M3".into(),
            kind: DeviceKind::Mouse,
            via: "2.4 GHz receiver".into(),
            percent,
            ..Default::default()
        };
        ctx.add(status, VID, RECEIVER);
        return;
    }
}
