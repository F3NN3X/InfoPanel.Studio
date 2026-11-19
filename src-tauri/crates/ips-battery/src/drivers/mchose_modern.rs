//! MCHOSE "new" wireless mice on the 2.4 GHz receiver (VID 3837): K7 V2 Ultra+ (receiver 3837:1014)
//! and the other Nordic models M HUB groups with it (receiver ids 0x1014, 0x1018, 0x1016, 0x102C,
//! 0x102D). The receiver exposes vendor collection FF01:0001 (64-byte input/output reports) and
//! answers a 64-byte "device info" frame:
//!   request: output report id 0x4D:
//!            [4D][01][flags 01 = read][len 00][cmd lo][cmd hi][biz][seq][xor of bytes 2..7]
//!            command 0x0900 = read device info, which carries the battery
//!   reply:   input report id 0x4D, same header, then len bytes of data and a checksum:
//!            [4D][01][flags][len][cmd lo][cmd hi][biz][seq][data ...][xor of bytes 2..7+len]
//!            data[0..1] = vendor id (3837), data[2..3] = paired model id, data[10] = link status
//!            (0 = receiver present, mouse not linked), data[11] = charge status (1 = charging),
//!            data[12] = battery percent, data[13] = game mode
//!            With the mouse switched off the receiver still answers, but with len = 1 and a single
//!            0xFF in place of the model id (4D 01 01 01 00 09 00 00 FF 00 ...): no battery data, so
//!            the device is reported as asleep rather than dropped. Verified on the K7 V2 Ultra+.
//! Protocol from MCHOSE's own M HUB web driver (cdn.mchose.com.cn, assets/main-DQZs6ZzX.js:
//! getCommandBuffer, mcReadCommand, readDeviceInfo with commandId 0x0900, deviceInfoToObj), and the
//! same frame is documented in github.com/HifumiDaisuki01/MchoseBatteryTray (PROTOCOL.md,
//! ModernRequest/ParseModern). Confirmed on a real K7 V2 Ultra+ receiver (3837:1014): 29% reported,
//! matching M HUB.
//! The G3 V2 driver (mchose_g3) speaks a different protocol on FF01:0010; this one needs FF01:0001
//! and report 0x4D, which the 0x1014 receiver does not expose through the feature-report path.

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, hid_product, PollContext};
use crate::win::{now_ms, sleep_ms};

const VID: u16 = 0x3837;
/// M HUB's newMouseWirelessPids: receivers of the "new" MCHOSE mice. Only 0x1014 was tested.
const RECEIVERS: [u16; 5] = [0x1014, 0x1018, 0x1016, 0x102C, 0x102D];

const REPORT: u8 = 0x4D;
const CMD_DEVICE_INFO: u16 = 0x0900;
const DATA: usize = 8;  // first byte of the data block in both the request and the reply

fn xor(b: &[u8], from: usize, to: usize) -> u8 {  // both ends inclusive
    let mut x = 0u8;
    let mut i = from;
    while i <= to && i < b.len() {
        x ^= b[i];
        i += 1;
    }
    x
}

/// Returns 1 for a status frame, 0 for a valid frame that says the mouse is not linked, -1 otherwise.
fn parse_info(r: &[u8], percent: &mut i32, charging: &mut bool) -> i32 {
    if r.len() < DATA + 2 || r[0] != REPORT { return -1; }
    if (r[4] as u16 | (r[5] as u16) << 8) != CMD_DEVICE_INFO { return -1; }
    let len = r[3] as usize;
    if DATA + len >= r.len() { return -1; }
    // While the mouse is off or asleep the receiver answers with the header only, a single 0xFF in
    // place of the model id and a zeroed data area (4D 01 01 01 00 09 00 00 FF 00 ...), so anything
    // shorter than the 14-byte device-info payload means "not linked" rather than "bad checksum".
    if len < 14 { return 0; }
    if r[DATA + len] != xor(r, 2, 7 + len) { return -1; }
    if (r[DATA] as u16 | (r[DATA + 1] as u16) << 8) != VID { return -1; }
    if r[DATA + 10] == 0 { return 0; }  // not linked: the mouse is off or asleep
    if r[DATA + 12] > 100 { return -1; }
    *percent = r[DATA + 12] as i32;
    *charging = r[DATA + 11] == 1;
    1
}

pub fn poll_mchose_modern(ctx: &mut PollContext) {
    for &pid in &RECEIVERS {
        for c in ctx.find(VID, pid, |c| {
            (c.page() == 0xFF01 || c.page() == 0xFF0B) && c.out_len() >= 64 && c.in_len() >= 21
        }) {
            let Some(mut d) = ctx.open(&c) else { continue };
            d.flush();
            let mut state = -1;
            let mut percent = -1;
            let mut charging = false;
            let mut attempt = 0;
            while attempt < 3 && state < 0 {
                if attempt > 0 { sleep_ms(150); }
                attempt += 1;
                let mut req = vec![0u8; c.out_len() as usize];
                req[0] = REPORT;
                req[1] = 0x01;
                req[2] = 0x01;  // read
                req[4] = (CMD_DEVICE_INFO & 0xFF) as u8;
                req[5] = (CMD_DEVICE_INFO >> 8) as u8;
                req[DATA] = xor(&req, 2, 7);
                if !d.write(&req, 500) { continue; }
                let end = now_ms() + 1000;
                let mut r = Vec::new();
                while (end as i64 - now_ms() as i64) > 0 {
                    let left = (end as i64 - now_ms() as i64) as i32;
                    let n = d.read(&mut r, left as u32);
                    if n < 0 { break; }
                    let st = parse_info(&r, &mut percent, &mut charging);
                    if st >= 0 {
                        state = st;
                        break;
                    }
                }
            }
            if state < 0 { continue; }
            let mut s = DeviceStatus {
                key: format!("mchose:{}:{}", hex4(VID), hex4(pid)),
                kind: DeviceKind::Mouse,
                via: "2.4 GHz receiver".into(),
                grace_sec: 1800,
                ..Default::default()
            };
            s.name = hid_product(&c);
            if s.name.is_empty() { s.name = "MCHOSE mouse".into(); }
            if state == 1 {
                s.percent = clamp100(percent);
                s.charging = charging;
            } else {
                s.asleep = true;
            }
            ctx.add(s, VID, pid);
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    //! Ported from tests/mchose_modern_driver_test.cpp: the 64-byte device-info frame, the "not
    //! linked" short frame (before any checksum), the fixed receiver probe order and the corrupted
    //! frame gates.
    use super::*;
    use crate::devices::DeviceStatus;
    use crate::hid::mock::{MockFactory, test_ctx};
    use crate::hid::test_seam::with_product;
    use crate::hid::{HidCaps, HidColl};
    use std::collections::BTreeSet;

    fn collection(pid: u16, page: u16, out_len: u16, in_len: u16) -> HidColl {
        HidColl {
            path: "mchose".into(),
            vid: 0x3837,
            pid,
            caps: HidCaps { usage_page: page, usage: 0x01, input_report_byte_length: in_len,
                            output_report_byte_length: out_len, ..Default::default() },
            ..Default::default()
        }
    }

    fn default_collection() -> HidColl { collection(0x1014, 0xFF01, 64, 64) }

    /// Device-info reply, laid out the way the receiver sends it: header, 16 data bytes, checksum.
    fn reply(link: u8, charge: u8, percent: u8) -> Vec<u8> {
        let mut r = vec![0u8; 64];
        r[0] = 0x4D;
        r[1] = 0x01;
        r[2] = 0x01; // read
        r[3] = 16;   // data length
        r[5] = 0x09; // command 0x0900, device info
        r[8] = 0x37;
        r[9] = 0x38; // vendor id 3837
        r[10] = 0x26;
        r[11] = 0x40; // paired model id
        r[18] = link;
        r[19] = charge;
        r[20] = percent;
        for i in 2..=7 + 16 { r[8 + 16] ^= r[i]; }
        r
    }

    /// What the receiver answered on real hardware while the mouse was switched off and on again.
    fn not_linked() -> Vec<u8> {
        let mut r = vec![0u8; 64];
        r[0] = 0x4D;
        r[1] = 0x01;
        r[2] = 0x01;
        r[3] = 0x01;
        r[5] = 0x09;
        r[8] = 0xFF;
        r
    }

    fn fix_checksum(r: &mut [u8]) {
        r[8 + 16] = 0;
        for i in 2..=7 + 16 { r[8 + 16] ^= r[i]; }
    }

    /// The only frame this driver may send: the read-only device-info request. The C++ mock
    /// asserted this inside every Write; the transport here records writes, so they are checked
    /// after the poll.
    fn assert_device_info_writes(writes: &[Vec<u8>]) {
        for w in writes {
            let expected = [0x4D, 0x01, 0x01, 0x00, 0x00, 0x09, 0x00, 0x00, 0x08];
            assert_eq!(w.len(), 64);
            assert_eq!(&w[..9], &expected[..]);
            assert!(w[9..].iter().all(|&b| b == 0), "unexpected payload in {:02X?}", w);
        }
    }

    struct Outcome {
        out: Vec<DeviceStatus>,
        claimed: BTreeSet<(u16, u16)>,
        writes: Vec<Vec<u8>>,
        opens: u32,
    }

    impl Outcome {
        fn is_claimed(&self, vid: u16, pid: u16) -> bool { self.claimed.contains(&(vid, pid)) }
    }

    /// One C++ `Poll(...)`: replies scripted, one collection, everything else fresh.
    fn poll(replies: Vec<Vec<u8>>, coll: &HidColl) -> Outcome {
        let mut io = MockFactory::new().with_reads(replies);
        let probe = io.clone();
        let mut ctx = test_ctx(coll.clone(), &mut io);
        poll_mchose_modern(&mut ctx);
        Outcome { out: ctx.out, claimed: ctx.claimed, writes: probe.writes(), opens: probe.opens() }
    }

    #[test]
    fn mchose_modern_driver() {
        let o = with_product("MCHOSE K7 V2 Ultra+", || poll(vec![reply(2, 0, 29)], &default_collection()));
        assert!(o.out.len() == 1 && o.is_claimed(0x3837, 0x1014));
        let s = &o.out[0];
        assert!(s.percent == 29 && s.connected && !s.charging && !s.asleep);
        // The C++ program substituted HidProduct at link time with "MCHOSE K7 V2 Ultra+"; the seam
        // gives the driver the same string, so the C++ name assertion is covered.
        assert!(s.name == "MCHOSE K7 V2 Ultra+" && s.key == "mchose:3837:1014");
        assert!(s.kind == DeviceKind::Mouse && s.via == "2.4 GHz receiver" && s.grace_sec == 1800);
        assert_eq!(o.writes.len(), 1); // one reply is enough, no retries
        assert_device_info_writes(&o.writes);

        let o = poll(vec![reply(2, 1, 100)], &default_collection());
        assert!(o.out.len() == 1 && o.out[0].percent == 100 && o.out[0].charging);
        assert_device_info_writes(&o.writes);

        // Mouse switched off: the receiver answers, but without battery data.
        let o = poll(vec![not_linked()], &default_collection());
        assert!(o.out.len() == 1 && o.is_claimed(0x3837, 0x1014));
        assert!(o.out[0].asleep && !o.out[0].charging && o.out[0].percent == -1);
        assert_eq!(o.writes.len(), 1);

        // The 0x13 echo frame the receiver emits after an unrelated write carries no battery either.
        let mut echo = vec![0u8; 64];
        echo[0] = 0x4D;
        echo[1] = 0x01;
        echo[2] = 0x01;
        echo[3] = 0x01;
        echo[8] = 0xFF;
        let o = poll(vec![echo, reply(2, 0, 31)], &default_collection());
        assert!(o.out.len() == 1 && o.out[0].percent == 31);
        assert_device_info_writes(&o.writes);

        // Silence: three attempts, then nothing is reported or claimed.
        let o = poll(Vec::new(), &default_collection());
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.writes.len() == 3);
        assert_device_info_writes(&o.writes);

        // Corrupted frames are not trusted.
        let mut bad_checksum = reply(2, 0, 29);
        let bad_percent = reply(2, 0, 101);
        let mut bad_vendor = reply(2, 0, 29);
        let mut bad_report = reply(2, 0, 29);
        let mut short_data = reply(2, 0, 29);
        bad_checksum[24] ^= 0xFF;
        bad_vendor[8] = 0x34;
        fix_checksum(&mut bad_vendor);
        bad_report[0] = 0x4E;
        short_data[3] = 12;
        fix_checksum(&mut short_data);
        let o = poll(vec![bad_checksum, bad_percent, bad_vendor, bad_report], &default_collection());
        assert!(o.out.is_empty() && o.claimed.is_empty() && o.writes.len() == 3);
        assert_device_info_writes(&o.writes);

        // A frame too short to hold the 14-byte payload means "not linked", like the 0xFF answer.
        let o = poll(vec![short_data], &default_collection());
        assert!(o.out.len() == 1 && o.out[0].asleep && o.out[0].percent == -1);

        // Only the vendor collections of the documented receivers are opened.
        for rejected in [collection(0x1012, 0xFF00, 64, 64),   // MagDock: a different product
                         collection(0x1014, 0x0001, 64, 64),   // mouse collection, not the vendor one
                         collection(0x1014, 0xFF01, 63, 64),   // too short to hold the frame
                         collection(0x1014, 0xFF01, 64, 20)] { // reply cannot be read
            let o = poll(Vec::new(), &rejected);
            assert!(o.out.is_empty() && o.opens == 0 && o.writes.is_empty());
        }

        // The other receivers M HUB groups with this one, and the FF0B collection, are accepted too.
        let o = poll(vec![reply(2, 0, 45)], &collection(0x1018, 0xFF0B, 64, 64));
        assert!(o.out.len() == 1 && o.out[0].percent == 45 && o.out[0].key == "mchose:3837:1018");
        let o = poll(vec![reply(2, 0, 45)], &collection(0x102D, 0xFF0B, 64, 64));
        assert!(o.out.len() == 1 && o.out[0].key == "mchose:3837:102D");

        // Outside the seam the real helper cannot read a simulated collection, so the driver's own
        // fallback name is what a scripted poll reports (real behaviour, not the C++ stub).
        let o = poll(vec![reply(2, 0, 29)], &default_collection());
        assert!(o.out.len() == 1 && o.out[0].name == "MCHOSE mouse");
    }
}
