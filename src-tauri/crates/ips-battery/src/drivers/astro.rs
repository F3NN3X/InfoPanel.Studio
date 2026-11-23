//! ASTRO A50 X / A50 Gen 5 headsets on their USB base station (astro.cpp).

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{PollContext, hex4};
use crate::win::now_ms;

pub fn poll_astro(ctx: &mut PollContext) {
    let colls = ctx.colls.clone(); // snapshot: the loop below mutates ctx (claims)
    for c in &colls {
        if c.vid != 0x046D
            || (c.pid != 0x0B0B && c.pid != 0x0B1C)
            || ctx.is_claimed(c.vid, c.pid)
            || c.page() != 0xFF32
            || c.usage() != 0x0074
            || c.in_len() != 64
            || c.out_len() != 64
        {
            continue;
        }
        let Some(mut d) = ctx.open(c) else { continue };
        d.flush();
        // No payload: read battery only; never change audio or headset settings.
        let mut request = vec![0u8; 64];
        request[0] = 0x02;
        request[1] = 0x0C;
        request[2] = 3;
        request[4] = 0x06;
        request[5] = 0x0C;
        if !d.write(&request, 500) {
            continue;
        }
        let deadline = now_ms() + 1000;
        for _attempt in 0..8 {
            let now = now_ms();
            if now >= deadline {
                break;
            }
            let mut reply: Vec<u8> = Vec::new();
            let n = d.read(&mut reply, (deadline - now) as u32);
            if n < 0 {
                break;
            }
            // Ignore unsolicited volume/mix events and malformed or partial frames.
            if n < 9
                || reply.len() < 9
                || reply[0] != 0x02
                || reply[1] != 0x0C
                || reply[2] < 6
                || reply[2] as usize + 3 > reply.len()
                || reply[2] as i32 + 3 > n
                || reply[3] != 0
                || reply[4] != 0x06
                || (reply[5] != 0 && reply[5] != 0x0C)
                || reply[6] > 100
            {
                continue;
            }
            let mut s = DeviceStatus::default();
            s.key = format!("astro:{}:{}:{}", hex4(c.vid), hex4(c.pid), c.iface);
            let name = if c.pid == 0x0B0B { "ASTRO A50 X" } else { "ASTRO A50 Gen 5" };
            s.name = name.into();
            s.kind = DeviceKind::Headset;
            s.via = "USB base station".into();
            s.percent = reply[6] as i32;
            s.charging = reply[8] != 0;
            ctx.add(s, c.vid, c.pid);
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hid::HidCaps;
    use crate::hid::HidColl;
    use crate::hid::mock::{MockFactory, test_ctx};

    fn collection() -> HidColl {
        HidColl {
            path: "astro-test".into(),
            vid: 0x046D,
            pid: 0x0B0B,
            iface: -1,
            caps: HidCaps {
                usage_page: 0xFF32,
                usage: 0x0074,
                input_report_byte_length: 64,
                output_report_byte_length: 64,
                feature_report_byte_length: 0,
            },
            ..Default::default()
        }
    }

    /// The exact 64-byte request the driver sends: battery query only, no payload.
    fn request() -> Vec<u8> {
        let mut r = vec![0u8; 64];
        r[0] = 0x02;
        r[1] = 0x0C;
        r[2] = 3;
        r[4] = 0x06;
        r[5] = 0x0C;
        r
    }

    /// 02 0C 06 00 06 0C <level> 100 <dock>
    fn reply(level: u8, dock: u8) -> Vec<u8> {
        vec![2, 12, 6, 0, 6, 12, level, 100, dock]
    }

    // tests/astro_driver_test.cpp
    #[test]
    fn astro_a50_usb_base_station() {
        // Level, name, kind and claim; a product that is already claimed is not opened again.
        {
            let mut io = MockFactory::new().with_reads(vec![reply(99, 0)]).with_expected_writes(vec![request()]);
            let probe = io.clone(); // shares the mock's state; readable while ctx borrows io
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].percent, 99);
            assert!(!ctx.out[0].charging);
            assert_eq!(ctx.out[0].name, "ASTRO A50 X");
            assert_eq!(ctx.out[0].kind, DeviceKind::Headset);
            assert!(ctx.is_claimed(0x046D, 0x0B0B));
            // int before = opens; PollAstro(ctx); assert(opens == before);
            let before = probe.opens();
            poll_astro(&mut ctx);
            assert_eq!(probe.opens(), before, "the claimed product was opened again");
            assert_eq!(ctx.out.len(), 1, "the claimed product was listed twice");
        }

        // Dock byte non-zero: on the charging dock.
        {
            let mut io = MockFactory::new().with_reads(vec![reply(0, 1)]).with_expected_writes(vec![request()]);
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].percent, 0);
            assert!(ctx.out[0].charging);
        }

        // The sub command byte may also be 0 instead of 0x0C.
        {
            let mut push = reply(100, 0);
            push[5] = 0;
            let mut io = MockFactory::new().with_reads(vec![push]).with_expected_writes(vec![request()]);
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].percent, 100);
        }

        // An unsolicited volume/mix event (reply[4] != 0x06) is skipped; the next frame is used.
        {
            let mut unrelated = reply(50, 0);
            unrelated[4] = 8;
            let mut io = MockFactory::new().with_reads(vec![unrelated, reply(60, 0)]).with_expected_writes(vec![request()]);
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].percent, 60);
        }

        // Corrupting any of the first seven bytes must yield no device and no claim.
        for field in 0..7 {
            let mut bad = reply(50, 0);
            bad[field] = 255;
            let mut io = MockFactory::new().with_reads(vec![bad]);
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert!(ctx.out.is_empty(), "field {field} = 255 was accepted");
            assert!(ctx.claimed.is_empty(), "field {field} = 255 claimed the product");
        }

        // A partial frame (fewer than 9 bytes) is ignored.
        {
            let mut io = MockFactory::new().with_reads(vec![vec![2, 12, 6, 0, 6, 12, 50]]);
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert!(ctx.out.is_empty());
        }

        // No reply at all: nothing listed.
        {
            let mut io = MockFactory::new();
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert!(ctx.out.is_empty());
        }

        // The Gen 5 base station is pid 0x0B1C and has its own name.
        {
            let mut c = collection();
            c.pid = 0x0B1C;
            let mut io = MockFactory::new().with_reads(vec![reply(75, 0)]);
            let mut ctx = test_ctx(c, &mut io);
            poll_astro(&mut ctx);
            assert_eq!(ctx.out.len(), 1);
            assert_eq!(ctx.out[0].name, "ASTRO A50 Gen 5");
        }

        // Collections that are not the ASTRO base station are never opened.
        for field in 0..5 {
            let mut c = collection();
            if field == 0 {
                c.vid = 0x1234;
            }
            if field == 1 {
                c.pid = 0x1234;
            }
            if field == 2 {
                c.caps.usage_page = 0xFF00;
            }
            if field == 3 {
                c.caps.usage = 1;
            }
            if field == 4 {
                c.caps.output_report_byte_length = 20;
            }
            let mut io = MockFactory::new().with_reads(vec![reply(50, 0)]);
            let mut ctx = test_ctx(c, &mut io);
            poll_astro(&mut ctx);
            assert!(ctx.out.is_empty(), "wrong collection {field} was reported");
            assert_eq!(io.opens(), 0, "wrong collection {field} was opened");
        }

        // Open failure: nothing listed.
        {
            let mut io = MockFactory::new().with_reads(vec![reply(50, 0)]).with_open_ok(false);
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert!(ctx.out.is_empty());
        }

        // Write failure: nothing listed.
        {
            let mut io = MockFactory::new().with_reads(vec![reply(50, 0)]).with_expected_writes(vec![request()]).with_write_ok(false);
            let mut ctx = test_ctx(collection(), &mut io);
            poll_astro(&mut ctx);
            assert!(ctx.out.is_empty());
        }
    }
}
