//! Samsung Galaxy Buds (Buds, Buds+, Live, Pro, Buds2, Buds2 Pro, FE, Core, Buds3 / 3 Pro / 3 FE ...).
//! Windows does not show a battery level for them, so they are asked directly: the earbuds accept
//! an RFCOMM connection on Samsung's SPP service and push a status frame with the left, right and
//! case levels as soon as it opens (frame format inlined below, from galaxy_buds_protocol.h).
//! Nothing is sent to them.
//!   Buds2 and later:     service {2e73a4ad-332d-41fc-90e2-16bef06523f2}
//!   Buds+, Live, Pro:    standard SPP {00001101-0000-1000-8000-00805f9b34fb}
//!   original Buds:       {00001102-0000-1000-8000-00805f9b34fd}, legacy framing
//! Service UUIDs from GalaxyBudsClient (Model/Constants.cs and the per-model DeviceSpec files).
//! Only paired devices that Windows reports as connected and whose name contains "Buds" are tried.
//! If the Galaxy Buds app (or GalaxyBudsClient) holds the connection, the earbuds are skipped.
#![allow(non_snake_case)]  #![allow(non_upper_case_globals)]  // the C++ constant and struct names

use std::sync::OnceLock;

use windows_sys::core::GUID;
use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
    SetupDiGetDeviceInstanceIdW, SetupDiGetDevicePropertyW, DIGCF_ALLCLASSES, DIGCF_PRESENT,
    SP_DEVINFO_DATA,
};
use windows_sys::Win32::Devices::Properties::{
    DEVPKEY_Device_FriendlyName, DEVPROP_TYPE_BOOLEAN, DEVPROP_TYPE_STRING,
};
use windows_sys::Win32::Foundation::DEVPROPKEY;
use windows_sys::Win32::Networking::WinSock::{
    closesocket, connect, ioctlsocket, recv, select, socket, WSAGetLastError, WSAStartup, FD_SET,
    FIONBIO, INVALID_SOCKET, SOCKADDR, SOCK_STREAM, SOCKET, TIMEVAL, WSADATA, WSAEWOULDBLOCK,
};

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::PollContext;
use crate::win::{now_ms, to_wide, wide_to_string};

// {2e73a4ad-332d-41fc-90e2-16bef06523f2}
const kSppNew: GUID = GUID::from_u128(0x2e73a4ad_332d_41fc_90e2_16bef06523f2);
// {00001101-0000-1000-8000-00805f9b34fb}
const kSppStandard: GUID = GUID::from_u128(0x00001101_0000_1000_8000_00805f9b34fb);
// {00001102-0000-1000-8000-00805f9b34fd}
const kSppLegacy: GUID = GUID::from_u128(0x00001102_0000_1000_8000_00805f9b34fd);

// DEVPKEY_Device_IsConnected ({83da6326-97a6-4088-9453-a1923f573b29}, pid 15)
const kIsConnected: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID::from_u128(0x83da6326_97a6_4088_9453_a1923f573b29),
    pid: 15,
};

// ws2bth.h keeps these behind windows-sys' Win32_Devices_Bluetooth feature, which the crate does
// not enable; the ABI is declared here like the C++ includes ws2bth.h.
const AF_BTH: u16 = 32;
const BTHPROTO_RFCOMM: i32 = 3;

#[repr(C)]
struct SockAddrBth {
    addressFamily: u16,
    btAddr: u64,
    serviceClassId: GUID,
    port: u32,
}

// ---- Samsung Galaxy Buds status frames (galaxy_buds_protocol.h) --------------------------------
// As sent over the Bluetooth RFCOMM (SPP) link. Kept independent of Win32 so captured frames
// can be checked without the earbuds.
//
// Frame (Buds+ and later):  FD [size lo][size hi | flags] [id] [payload...] [crc lo][crc hi] DD
// Frame (original Buds):    FE [type] [size] [id] [payload...] [crc lo][crc hi] EE
//   size  = id + payload + crc (low 10 bits of the 16-bit header); header bit 0x2000 = fragment
//   crc   = CRC-16/XMODEM (poly 0x1021, init 0) over id + payload, little-endian
// Messages carrying the battery levels (pushed by the earbuds, nothing has to be sent):
//   0x60 STATUS_UPDATED           payload[1] = left %, [2] = right %, [6] = case % (not on the original Buds)
//   0x61 EXTENDED_STATUS_UPDATED  payload[2] = left %, [3] = right %, [7] = case % (not on the original Buds)
// A level of 0 means that part is not connected (earbud out of range, case closed / unknown);
// the Buds+ report 101 for an unknown case level.
// Source: GalaxyBudsClient (timschneeb/GalaxyBudsClient), Message/SppMessage.cs, Utils/Crc16.cs,
// Message/Decoder/StatusUpdateDecoder.cs and ExtendedStatusUpdateDecoder.cs.

const kStatusUpdated: u8 = 0x60;
const kExtendedStatusUpdated: u8 = 0x61;

#[derive(Clone, Copy)]
struct Status {
    left: i32,       // -1 = not reported / not connected
    right: i32,
    caseLevel: i32,
}
impl Default for Status {
    fn default() -> Self {
        Status { left: -1, right: -1, caseLevel: -1 }
    }
}

fn Crc16(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &b in data {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    crc
}

fn Level(v: u8) -> i32 { if v >= 1 && v <= 100 { v as i32 } else { -1 } }

// Scans a received byte stream for status frames and keeps the levels of the last valid one.
// `legacy` selects the original Galaxy Buds framing. Returns true when a status frame was found.
fn FindStatus(data: &[u8], legacy: bool, out: &mut Status) -> bool {
    let som = if legacy { 0xFE } else { 0xFD };
    let eom = if legacy { 0xEE } else { 0xDD };
    let size = data.len();
    let mut found = false;
    let mut i: usize = 0;
    while i + 6 <= size {  // (the C++ for-loop's `i++` runs on every `continue` too)
        if data[i] != som { i += 1; continue; }
        let len: usize;
        if legacy {
            len = data[i + 2] as usize;
        } else {
            let header = (data[i + 1] as u32) | ((data[i + 2] as u32) << 8);
            if header & 0x2000 != 0 { i += 1; continue; }  // fragments only carry firmware data
            len = (header & 0x3FF) as usize;
        }
        if len < 3 || i + 3 + len >= size || data[i + 3 + len] != eom { i += 1; continue; }
        let body = &data[i + 3 .. i + 3 + len];  // id, payload, crc
        let crc = (body[len - 2] as u16) | ((body[len - 1] as u16) << 8);
        if Crc16(&body[..len - 2]) != crc { i += 1; continue; }
        let id = body[0];
        let p = &body[1..];
        let plen = len - 3;
        let mut s = Status::default();
        if id == kExtendedStatusUpdated && plen >= 4 {
            s.left = Level(p[2]);
            s.right = Level(p[3]);
            if !legacy && plen >= 8 { s.caseLevel = Level(p[7]); }
        } else if id == kStatusUpdated && plen >= 3 {
            s.left = Level(p[1]);
            s.right = Level(p[2]);
            if !legacy && plen >= 7 { s.caseLevel = Level(p[6]); }
        } else {
            i += 1;
            continue;
        }
        *out = s;
        found = true;
        i += 3 + len + 1;  // skip past this frame's EOM (plus the C++ for-loop's extra 1)
    }
    found
}

// ---- the SPP connection --------------------------------------------------------------------------

struct Buds { name: String, addrText: String, addr: u64 }

fn LooksLikeBuds(name: &str) -> bool {
    name.to_lowercase().contains("buds")
}

fn FindConnectedBuds() -> Vec<Buds> {
    let mut out: Vec<Buds> = Vec::new();
    unsafe {
        let di = SetupDiGetClassDevsW(std::ptr::null(), to_wide("BTHENUM").as_ptr(), std::ptr::null_mut(),
                                      DIGCF_ALLCLASSES | DIGCF_PRESENT);
        if di == -1 { return out; }  // INVALID_HANDLE_VALUE (HDEVINFO is isize)
        let mut dd: SP_DEVINFO_DATA = std::mem::zeroed();
        dd.cbSize = std::mem::size_of::<SP_DEVINFO_DATA>() as u32;
        let mut i = 0u32;
        while SetupDiEnumDeviceInfo(di, i, &mut dd) != 0 {
            i += 1;
            let mut inst = [0u16; 512];
            if SetupDiGetDeviceInstanceIdW(di, &dd, inst.as_mut_ptr(), 512, std::ptr::null_mut()) == 0 { continue; }
            // The device node itself: BTHENUM\DEV_<12 hex digits address>\... (_wcsnicmp, so case-insensitive)
            let inst_s = wide_to_string(&inst);
            let bytes = inst_s.as_bytes();
            if bytes.len() < 12 || !bytes[..12].eq_ignore_ascii_case(b"BTHENUM\\DEV_") { continue; }
            let hex: String = inst_s[12..].chars().take(12).collect();
            if hex.chars().count() != 12 { continue; }
            let Ok(addr) = u64::from_str_radix(&hex, 16) else { continue };
            if addr == 0 { continue; }

            let mut t: u32 = 0;
            let mut conn: u8 = 0;  // DEVPROP_BOOLEAN
            if SetupDiGetDevicePropertyW(di, &dd, &kIsConnected, &mut t, &mut conn, 1,
                                         std::ptr::null_mut(), 0) == 0
                || t != DEVPROP_TYPE_BOOLEAN || conn == 0 {
                continue;  // never page a device that is not connected (it would only time out)
            }
            let mut name = [0u16; 256];
            if SetupDiGetDevicePropertyW(di, &dd, &DEVPKEY_Device_FriendlyName, &mut t,
                                         name.as_mut_ptr() as *mut u8, ((name.len() - 1) * 2) as u32,
                                         std::ptr::null_mut(), 0) == 0
                || t != DEVPROP_TYPE_STRING {
                continue;
            }
            let name_s = wide_to_string(&name);
            if !LooksLikeBuds(&name_s) { continue; }
            out.push(Buds { name: name_s, addrText: hex, addr });
        }
        SetupDiDestroyDeviceInfoList(di);
    }
    out
}

fn StartWinsock() -> bool {
    static OK: OnceLock<bool> = OnceLock::new();
    *OK.get_or_init(|| unsafe {
        let mut wsa: WSADATA = std::mem::zeroed();
        WSAStartup(0x0202, &mut wsa) == 0  // MAKEWORD(2, 2)
    })
}

// The ws2_32 FD_SET / FD_ISSET macros (windows-sys ships only the fd_set struct).
fn fd_insert(s: SOCKET, set: &mut FD_SET) {
    for i in 0..set.fd_count as usize {
        if set.fd_array[i] == s { return; }
    }
    if (set.fd_count as usize) < set.fd_array.len() {
        set.fd_array[set.fd_count as usize] = s;
        set.fd_count += 1;
    }
}
fn fd_isset(s: SOCKET, set: &FD_SET) -> bool {
    (0..set.fd_count as usize).any(|i| set.fd_array[i] == s)
}

// Waits until `s` is readable (read) or connected (write). Returns false on timeout or error.
fn WaitSocket(s: SOCKET, forWrite: bool, timeoutMs: i32) -> bool {
    unsafe {
        let mut set: FD_SET = std::mem::zeroed();
        let mut err: FD_SET = std::mem::zeroed();
        fd_insert(s, &mut set);
        fd_insert(s, &mut err);
        let tv = TIMEVAL { tv_sec: timeoutMs / 1000, tv_usec: (timeoutMs % 1000) * 1000 };
        let r = select(0,
                       if forWrite { std::ptr::null_mut() } else { &mut set },
                       if forWrite { &mut set } else { std::ptr::null_mut() },
                       &mut err, &tv);
        r > 0 && fd_isset(s, &set) && !fd_isset(s, &err)
    }
}

// Opens the RFCOMM service and listens for the status frame the earbuds send on connect.
fn ReadStatus(addr: u64, service: &GUID, legacy: bool, st: &mut Status) -> bool {
    unsafe {
        let s = socket(AF_BTH as i32, SOCK_STREAM, BTHPROTO_RFCOMM);
        if s == INVALID_SOCKET { return false; }
        let mut nonBlocking: u32 = 1;
        ioctlsocket(s, FIONBIO, &mut nonBlocking);
        let mut sa: SockAddrBth = std::mem::zeroed();
        sa.addressFamily = AF_BTH;
        sa.btAddr = addr;
        sa.serviceClassId = *service;  // Windows looks the RFCOMM channel up over SDP
        sa.port = 0;
        let mut found = false;
        if connect(s, &sa as *const SockAddrBth as *const SOCKADDR,
                   std::mem::size_of::<SockAddrBth>() as i32) == 0
            || (WSAGetLastError() == WSAEWOULDBLOCK && WaitSocket(s, true, 4000)) {
            let mut buf: Vec<u8> = Vec::new();
            let deadline = now_ms() + 3000;
            while !found && buf.len() < 8192 {
                let now = now_ms();
                if now >= deadline { break; }
                if !WaitSocket(s, false, (deadline - now) as i32) { break; }
                let mut chunk = [0u8; 512];
                let n = recv(s, chunk.as_mut_ptr(), chunk.len() as i32, 0);
                if n <= 0 { break; }
                buf.extend_from_slice(&chunk[..n as usize]);
                found = FindStatus(&buf, legacy, st);
            }
        }
        closesocket(s);
        found
    }
}

fn Pct(v: i32) -> String { if v >= 0 { format!("{v}%") } else { "-".into() } }

pub fn poll_galaxy_buds(ctx: &mut PollContext) {
    let list = FindConnectedBuds();
    if list.is_empty() || !StartWinsock() { return; }
    for b in &list {
        let mut st = Status::default();
        let ok = ReadStatus(b.addr, &kSppNew, false, &mut st)
            || ReadStatus(b.addr, &kSppStandard, false, &mut st)
            || ReadStatus(b.addr, &kSppLegacy, true, &mut st);
        if !ok { continue; }
        let mut s = DeviceStatus::default();
        s.key = format!("galaxybuds:{}", b.addrText);
        s.name = b.name.clone();  // the same name the Bluetooth fallback uses, so it skips these earbuds
        s.via = "Bluetooth".into();
        s.kind = DeviceKind::Headset;
        // The tray shows the lower of the two earbuds; the tooltip lists all three parts.
        if st.left >= 0 && st.right >= 0 {
            s.percent = st.left.min(st.right);
        } else {
            s.percent = if st.left >= 0 { st.left } else { st.right };
        }
        s.detail = format!("L {}, R {}", Pct(st.left), Pct(st.right));
        if st.caseLevel >= 0 { s.detail.push_str(&format!(", case {}", Pct(st.caseLevel))); }
        s.grace_sec = 180;  // a busy link (Galaxy Buds app open) should not make them flicker
        ctx.out.push(s);
    }
}

// ---- tests (tests/galaxy_buds_protocol_test.cpp) -------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Builds a frame the way GalaxyBudsClient's SppMessage.Encode does.
    fn frame(id: u8, payload: &[u8], legacy: bool) -> Vec<u8> {
        let mut body = vec![id];
        body.extend_from_slice(payload);
        let crc = Crc16(&body);
        let size = body.len() + 2;
        let mut f = if legacy {
            vec![0xFE, 0x00, size as u8]
        } else {
            vec![0xFD, size as u8, (size >> 8) as u8]
        };
        f.extend_from_slice(&body);
        f.push((crc & 0xFF) as u8);
        f.push((crc >> 8) as u8);
        f.push(if legacy { 0xEE } else { 0xDD });
        f
    }

    #[test]
    fn galaxy_buds_protocol() {
        // EXTENDED_STATUS_UPDATED frames from GalaxyBudsClient.Tests/TestData/ExtendedStatusUpdate,
        // with the levels its decoder tests expect.
        let buds2_pro: Vec<u8> = vec![
            0xFD, 0x31, 0x00, 0x61, 0x0D, 0x04, 0x64, 0x64, 0x01, 0x00, 0x33, 0x58, 0x00, 0x01, 0xBF,
            0x22, 0x00, 0x01, 0x46, 0x01, 0x46, 0x01, 0x00, 0x00, 0x03, 0x35, 0x00, 0x03, 0x00, 0x10,
            0x01, 0x01, 0x01, 0x01, 0x32, 0x03, 0x01, 0x01, 0x01, 0x00, 0x0C, 0xAE, 0x01, 0x00, 0x03,
            0x00, 0x01, 0x00, 0x01, 0x01, 0xB6, 0x37, 0xDD,
        ];
        let buds_plus: Vec<u8> = vec![
            0xFD, 0x1B, 0x10, 0x61, 0x0D, 0x00, 0x57, 0x54, 0x01, 0x00, 0x11, 0x65, 0x00, 0x00, 0x00,
            0x03, 0x00, 0x22, 0x01, 0x04, 0x01, 0x04, 0x01, 0x00, 0x00, 0x00, 0x03, 0x00, 0x1E, 0x55,
            0xDD,
        ];
        let buds_fe: Vec<u8> = vec![
            0xFD, 0x31, 0x10, 0x61, 0x02, 0x06, 0x3A, 0x59, 0x01, 0x00, 0x11, 0x00, 0x00, 0x00, 0x8F,
            0x33, 0x00, 0x00, 0x4A, 0x01, 0x4A, 0x01, 0x03, 0x00, 0x04, 0x65, 0x00, 0x01, 0x00, 0x10,
            0x00, 0x00, 0x01, 0x01, 0x11, 0x03, 0x00, 0x00, 0x00, 0x00, 0xE8, 0x03, 0x00, 0x00, 0x9D,
            0x0E, 0x1D, 0x00, 0x50, 0x00, 0xC2, 0xCF, 0xDD,
        ];
        let buds_original: Vec<u8> = vec![
            0xFE, 0x01, 0x12, 0x61, 0x03, 0x00, 0x46, 0x5F, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x02, 0x01, 0x07, 0x00, 0x22, 0x01, 0xA5, 0x75, 0xEE,
        ];

        let mut s = Status::default();
        assert!(FindStatus(&buds2_pro, false, &mut s));
        assert_eq!(s.left, 100);
        assert_eq!(s.right, 100);
        assert_eq!(s.caseLevel, 88);
        assert!(FindStatus(&buds_plus, false, &mut s));
        assert_eq!(s.left, 87);
        assert_eq!(s.right, 84);
        assert_eq!(s.caseLevel, -1);  // 101 = case level unknown
        assert!(FindStatus(&buds_fe, false, &mut s));
        assert_eq!(s.left, 58);
        assert_eq!(s.right, 89);
        assert_eq!(s.caseLevel, -1);  // 0 = case closed / unknown
        assert!(FindStatus(&buds_original, true, &mut s));
        assert_eq!(s.left, 70);
        assert_eq!(s.right, 95);
        assert_eq!(s.caseLevel, -1);  // the original Buds report no case level
        assert!(!FindStatus(&buds_original, false, &mut s));  // wrong framing

        // A corrupted byte fails the checksum.
        let mut bad = buds2_pro.clone();
        bad[6] = 0x50;
        assert!(!FindStatus(&bad, false, &mut s));

        // STATUS_UPDATED (revision, L, R, coupled, main connection, placement, case) after the
        // extended status in one stream, with noise in between: the newest frame wins.
        let mut stream: Vec<u8> = vec![0x00, 0xFD, 0x12];
        stream.extend_from_slice(&buds2_pro);
        let other = frame(0x40, &[0x01, 0x02], false);  // some other message
        stream.extend_from_slice(&other);
        let update = frame(0x60, &[0x0D, 0x4B, 0x00, 0x01, 0x00, 0x13, 0x2A, 0x00], false);
        stream.extend_from_slice(&update);
        assert!(FindStatus(&stream, false, &mut s));
        assert_eq!(s.left, 75);
        assert_eq!(s.right, -1);  // right earbud not connected
        assert_eq!(s.caseLevel, 42);

        // An incomplete frame (still arriving) is not decoded yet.
        assert!(!FindStatus(&update[..update.len() - 1], false, &mut s));
        // Fragments are skipped.
        let mut frag = update.clone();
        frag[2] |= 0x20;
        assert!(!FindStatus(&frag, false, &mut s));
    }
}
