//! Logitech G435 LIGHTSPEED headset on the newer 046D:0ADF dongle. It does not speak HID++: its
//! vendor collection (FF00:0001, unnumbered 64-byte reports) carries CRC-16 framed messages, and
//! "PA" commands inside them reach the headset's radio SoC. The battery is read with the OTA
//! GET_BATTERY command (millivolts). The older 046D:0ACB dongle uses a different transport and is
//! not handled here.
//!
//! Session, as captured by portyporty: open (84 01), 85 01, session init (OTA IOCTL_READ_MAX_LEN),
//! REMOTE_GET_MODE / REMOTE_SET_MODE 01 / REMOTE_GET_MODE so the query is forwarded to the headset
//! rather than answered by the dongle, GET_BATTERY, close (85 02). SET_MODE 01 only selects where
//! the dongle routes the command; it is not a user setting and does not persist.
//!
//! The fixed waits between steps come from the original capture (about 1.2 s in total, under the
//! 4 s per-device limit). Unlike the 0ACB dongle, a read does not interrupt audio or microphone
//! (checked on hardware), so the headset is read on every poll and switching it off or on shows up
//! within one poll interval.
//! Protocol: github.com/portyporty/g435-battery-percentage (MIT), ported in
//! github.com/deddroid/logitech-g435-battery.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{hex4, HidIo, PollContext};
use crate::win::now_ms;

// ---- pure protocol helpers (logitech_g435_0adf.h, kept I/O-free) --------------------------------

/// CRC-16/XMODEM (poly 0x1021, init 0).
fn crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &b in data {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    crc
}

/// 64-byte frame: <cmd> <body length> <crc lo> <crc hi> <body...>, zero-padded. The CRC covers the
/// whole frame with the CRC field zeroed.
fn frame(cmd: u8, body: &[u8]) -> [u8; 64] {
    let mut f = [0u8; 64];
    f[0] = cmd;
    f[1] = body.len() as u8;
    let mut i = 0;
    while i < body.len() && i + 4 < f.len() {
        f[4 + i] = body[i];
        i += 1;
    }
    let crc = crc16(&f);
    f[2] = (crc & 0xFF) as u8;
    f[3] = (crc >> 8) as u8;
    f
}

/// "PA" command for the headset's radio SoC: 50 41 <category> <seq> <length field> <payload...>.
fn pa(category: u8, seq: u8, len: u8, payload: &[u8]) -> Vec<u8> {
    let mut cmd = vec![0x50, 0x41, category, seq, len];
    cmd.extend_from_slice(payload);
    cmd
}

/// Battery voltage from the GET_BATTERY reply (pattern 00 07 00 06 <seq> 00 <mV lo> <mV hi>, as
/// matched by portyporty). Returns -1 when absent or not a plausible Li-Po voltage.
fn parse_millivolts(data: &[u8]) -> i32 {
    let mut i = 0;
    while i + 8 <= data.len() {
        if data[i] == 0x00 && data[i + 1] == 0x07 && data[i + 2] == 0x00 && data[i + 3] == 0x06 && data[i + 5] == 0x00 {
            let mv = (data[i + 6] as i32) | ((data[i + 7] as i32) << 8);
            if (2500..=4500).contains(&mv) { return mv; }
        }
        i += 1;
    }
    -1
}

/// Voltage -> % for the G435 Li-Po cell (portyporty's curve), piecewise-linear.
fn percent(mv: i32) -> i32 {
    const V: [i32; 16] = [4200, 4150, 4100, 4050, 4000, 3950, 3900, 3850, 3800, 3750, 3700, 3650, 3600, 3550, 3500, 3400];
    const P: [i32; 16] = [100, 95, 90, 85, 80, 75, 70, 62, 55, 45, 35, 25, 15, 10, 5, 0];
    if mv >= V[0] { return 100; }
    for i in 1..16 {
        if mv >= V[i] {
            return P[i] + ((P[i - 1] - P[i]) * (mv - V[i]) + (V[i - 1] - V[i]) / 2) / (V[i - 1] - V[i]);
        }
    }
    0
}

// ---- the dongle session --------------------------------------------------------------------------

const K_VID: u16 = 0x046D;
const K_PID: u16 = 0x0ADF;
const K_CAT_OTA: u8 = 0x06;
const K_CAT_WIRELESS: u8 = 0x0E;
const K_GET_MODE: u8 = 0xE0;
const K_SET_MODE: u8 = 0xE1;

/// Session init from the capture (OTA_CMD_IOCTL_READ_MAX_LEN, sequence 1 embedded).
const K_SESSION_INIT: [u8; 19] = [0x50, 0x41, 0x06, 0x01, 0x0D, 0x00, 0x25, 0x34, 0x12, 0x5A,
                                   0x5A, 0x01, 0x00, 0x00, 0x00, 0xF0, 0x00, 0x00, 0x00];

/// Sends one frame (report ID 0) and collects the input reports that arrive within `wait_ms`.
/// With `mv` set, returns as soon as a battery reply is seen.
fn transact(d: &mut dyn HidIo, cmd: u8, body: &[u8], wait_ms: u32, mut mv: Option<&mut i32>) -> bool {
    let f = frame(cmd, body);
    let mut out = vec![0x00u8];
    out.extend_from_slice(&f);
    d.flush();
    if !d.write(&out, 500) { return false; }
    let end = now_ms() + wait_ms as u64;
    let mut r: Vec<u8> = Vec::new();
    loop {
        let left = end as i64 - now_ms() as i64;
        if left <= 0 { return true; }
        if d.read(&mut r, left as u32) < 0 { continue; }
        if let Some(mvp) = mv.as_deref_mut() {
            *mvp = parse_millivolts(&r);
            if *mvp >= 0 { return true; }
        }
    }
}

/// Always closes the session (85 02) once it was opened, whatever happens in between.
struct SessionGuard<'a> {
    d: &'a mut dyn HidIo,
}

impl Drop for SessionGuard<'_> {
    fn drop(&mut self) { transact(&mut *self.d, 0x85, &[0x02], 50, None); }
}

fn read_millivolts(d: &mut dyn HidIo) -> i32 {
    if !transact(&mut *d, 0x84, &[0x01], 50, None) { return -1; }
    let guard = SessionGuard { d };
    transact(&mut *guard.d, 0x85, &[0x01], 50, None);
    transact(&mut *guard.d, 0x80, &K_SESSION_INIT, 450, None);
    let mut seq: u8 = 2;
    // "PA" command carrying the current sequence number; the sequence then advances mod 127.
    let mut next_pa = |cat: u8, len: u8, payload: &[u8]| -> Vec<u8> {
        let cmd = pa(cat, seq, len, payload);
        seq = seq % 127 + 1;
        cmd
    };
    transact(&mut *guard.d, 0x80, &next_pa(K_CAT_WIRELESS, 1, &[K_GET_MODE]), 120, None);
    transact(&mut *guard.d, 0x80, &next_pa(K_CAT_WIRELESS, 2, &[K_SET_MODE, 0x01]), 120, None);
    transact(&mut *guard.d, 0x80, &next_pa(K_CAT_WIRELESS, 1, &[K_GET_MODE]), 120, None);
    let mut mv: i32 = -1;
    transact(&mut *guard.d, 0x80, &next_pa(K_CAT_OTA, 1, &[0x00, 0x31]), 250, Some(&mut mv));
    mv
}

pub fn poll_logitech_g435(ctx: &mut PollContext) {
    if ctx.is_claimed(K_VID, K_PID) { return; }
    let colls = ctx.find(K_VID, K_PID, |c| {
        c.page() == 0xFF00 && c.usage() == 0x0001 && c.in_len() == 65 && c.out_len() == 65
    });
    if colls.is_empty() { return; }

    let Some(mut d) = ctx.open(&colls[0]) else { return };

    let mut s = DeviceStatus {
        key: format!("g435:{}", hex4(K_PID)),
        name: "Logitech G435".into(),
        kind: DeviceKind::Headset,
        via: "2.4 GHz receiver".into(),
        ..Default::default()
    };

    let mv = read_millivolts(d.as_mut());
    if mv < 0 {
        // Dongle present but no reply: the headset is off or out of range.
        s.connected = false;
        ctx.add(s, K_VID, K_PID);
        return;
    }
    s.millivolts = mv;
    s.percent = percent(mv);
    ctx.add(s, K_VID, K_PID);
}

// ---- tests (tests/logitech_g435_0adf_test.cpp) ---------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logitech_g435_0adf() {
        // CRC-16/XMODEM check value.
        let check = *b"123456789";
        assert_eq!(crc16(&check), 0x31C3);

        // Frame layout: cmd, body length, CRC (little endian) over the frame with the CRC zeroed.
        let f = frame(0x84, &[0x01]);
        assert_eq!(f.len(), 64);
        assert_eq!(f[0], 0x84);
        assert_eq!(f[1], 1);
        assert_eq!(f[4], 0x01);
        assert_eq!(f[5], 0);
        let mut zeroed = f;
        zeroed[2] = 0;
        zeroed[3] = 0;
        let crc = crc16(&zeroed);
        assert_eq!(f[2], (crc & 0xFF) as u8);
        assert_eq!(f[3], (crc >> 8) as u8);

        // GET_BATTERY command as sent by the original tool (sequence 5 after the init and mode steps).
        let pa_cmd = pa(0x06, 5, 1, &[0x00, 0x31]);
        assert_eq!(pa_cmd, vec![0x50, 0x41, 0x06, 0x05, 0x01, 0x00, 0x31]);

        // Battery reply (synthetic, built on the pattern the original tool matches): 3780 mV = 0x0EC4.
        let mut reply = vec![0u8; 64];
        let body: [u8; 10] = [0x50, 0x49, 0x00, 0x07, 0x00, 0x06, 0x85, 0x00, 0xC4, 0x0E];
        for (i, &b) in body.iter().enumerate() {
            reply[10 + i] = b;
        }
        assert_eq!(parse_millivolts(&reply), 3780);

        // Implausible voltage (dongle answering itself) and missing reply are rejected.
        reply[18] = 0xD2;
        reply[19] = 0x00;
        assert_eq!(parse_millivolts(&reply), -1);
        let empty = vec![0u8; 64];
        assert_eq!(parse_millivolts(&empty), -1);

        // Voltage curve.
        assert_eq!(percent(4250), 100);
        assert_eq!(percent(4200), 100);
        assert_eq!(percent(3800), 55);
        assert_eq!(percent(3775), 50);
        assert_eq!(percent(3400), 0);
        assert_eq!(percent(3000), 0);
    }
}
