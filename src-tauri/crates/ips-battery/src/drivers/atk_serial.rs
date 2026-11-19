//! ATK N9 Pro (VID 373B: dongle 11CB, wired 11CA) and first-generation N9 Ultra (dongle 1204,
//! wired 1203) headsets. Unlike other headsets they are not queried over HID but over a USB
//! virtual COM port (9600 8N1), with 64-byte frames:
//!   request [len = 2][cmd][sub][0...]        reply [len][cmd][sub][data...]
//!   cmd 00 sub 04 = status  -> data[1] == 1 when the headset is connected to the dongle
//!   cmd 00 sub 03 = battery -> data[1] = percent (bits 0-6), charging (bit 7)
//! Protocol from ATK's own configuration software (ATK HUB, "n9-pro" model; ATK HUB 3.2.31 maps
//! the N9 Ultra ids to the same model and serial settings, see
//! github.com/wushuai0802/myfinder-device-battery engine/upstream-protocols.md). The N9 Ultra
//! reports its level in 10 % steps. The newer N9 V2 headsets use a different (HID) protocol.
//! If the ATK desktop app is running it holds the port and the headset is skipped.
#![allow(non_snake_case)]  // the DCB keeps the winbase.h member names

use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
    SetupDiGetDeviceInstanceIdW, SetupDiOpenDevRegKey, DICS_FLAG_GLOBAL, DIGCF_PRESENT, DIREG_DEV,
    GUID_DEVCLASS_PORTS, SP_DEVINFO_DATA,
};
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_SUCCESS, GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE,
};
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, ReadFile, WriteFile, OPEN_EXISTING};
use windows_sys::Win32::System::Registry::{RegCloseKey, RegQueryValueExW, KEY_READ, REG_SZ};

use crate::devices::{DeviceKind, DeviceStatus};
use crate::hid::{clamp100, hex4, PollContext};
use crate::win::{now_ms, to_wide, wide_to_string};

struct Model { pid: u16, name: &'static str, wired: bool }

static K_MODELS: [Model; 4] = [
    Model { pid: 0x11CB, name: "ATK N9 Pro", wired: false },
    Model { pid: 0x11CA, name: "ATK N9 Pro", wired: true },
    Model { pid: 0x1204, name: "ATK N9 Ultra", wired: false },
    Model { pid: 0x1203, name: "ATK N9 Ultra", wired: true },
];

struct Port { name: String, model: &'static Model }

fn FindPorts() -> Vec<Port> {
    let mut out: Vec<Port> = Vec::new();
    unsafe {
        let di = SetupDiGetClassDevsW(&GUID_DEVCLASS_PORTS, std::ptr::null(), std::ptr::null_mut(),
                                      DIGCF_PRESENT);
        if di == -1 { return out; }  // INVALID_HANDLE_VALUE (HDEVINFO is isize)
        let mut dd: SP_DEVINFO_DATA = std::mem::zeroed();
        dd.cbSize = std::mem::size_of::<SP_DEVINFO_DATA>() as u32;
        let mut i = 0u32;
        while SetupDiEnumDeviceInfo(di, i, &mut dd) != 0 {
            i += 1;
            let mut inst = [0u16; 512];
            if SetupDiGetDeviceInstanceIdW(di, &dd, inst.as_mut_ptr(), 512, std::ptr::null_mut()) == 0 { continue; }
            let id = wide_to_string(&inst).to_uppercase();
            let mut model: Option<&'static Model> = None;
            for m in &K_MODELS {
                if id.contains(&format!("VID_373B&PID_{}", hex4(m.pid))) { model = Some(m); }
            }
            let Some(model) = model else { continue };
            let k = SetupDiOpenDevRegKey(di, &dd, DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
            if k == INVALID_HANDLE_VALUE { continue; }
            let mut name = [0u16; 32];
            let mut sz: u32 = (name.len() * 2 - 2) as u32;  // sizeof(name) - sizeof(wchar_t)
            let mut ty: u32 = 0;
            let port_name = to_wide("PortName");
            if RegQueryValueExW(k, port_name.as_ptr(), std::ptr::null(), &mut ty,
                                name.as_mut_ptr() as *mut u8, &mut sz) == ERROR_SUCCESS && ty == REG_SZ {
                out.push(Port { name: wide_to_string(&name), model });
            }
            RegCloseKey(k);
        }
        SetupDiDestroyDeviceInfoList(di);
    }
    out
}

// windows-sys gates the comm functions behind its Win32_Devices_Communication feature, which the
// crate does not enable; the ABI is declared here exactly as winbase.h / winbasep.h define it.

#[repr(C)]
struct DCB {
    DCBlength: u32,
    BaudRate: u32,
    f: u32,  // the fBinary..fDummy2 bitfield union of winbase.h (bits below)
    wReserved: u16,
    XonLim: u16,
    XoffLim: u16,
    ByteSize: u8,
    Parity: u8,
    StopBits: u8,
    XonChar: i8,
    XoffChar: i8,
    ErrorChar: i8,
    EofChar: i8,
    EvtChar: i8,
    wReserved1: u16,
}

#[repr(C)]
struct COMMTIMEOUTS {
    ReadIntervalTimeout: u32,
    ReadTotalTimeoutMultiplier: u32,
    ReadTotalTimeoutConstant: u32,
    WriteTotalTimeoutMultiplier: u32,
    WriteTotalTimeoutConstant: u32,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCommState(h: HANDLE, dcb: *mut DCB) -> i32;
    fn SetCommState(h: HANDLE, dcb: *const DCB) -> i32;
    fn SetCommTimeouts(h: HANDLE, timeouts: *const COMMTIMEOUTS) -> i32;
    fn PurgeComm(h: HANDLE, flags: u32) -> i32;
}

// DCB flag bits (winbase.h bitfields packed into DCB.f)
const F_BINARY: u32 = 1;                // bit 0:    fBinary
const F_OUTXCTS_FLOW: u32 = 1 << 2;      // bit 2:    fOutxCtsFlow
const F_OUTXDSR_FLOW: u32 = 1 << 3;      // bit 3:    fOutxDsrFlow
const F_DTR_CONTROL: u32 = 0b11 << 4;   // bits 4-5: fDtrControl (2 bits)
const F_OUTX: u32 = 1 << 8;              // bit 8:    fOutX
const F_INX: u32 = 1 << 9;               // bit 9:    fInX
const F_RTS_CONTROL: u32 = 0b11 << 12;  // bits 12-13: fRtsControl (2 bits)
const DTR_CONTROL_ENABLE: u32 = 1;
const RTS_CONTROL_ENABLE: u32 = 1;
const CBR_9600: u32 = 9600;
const NOPARITY: u8 = 0;
const ONESTOPBIT: u8 = 0;
const PURGE_RXCLEAR: u32 = 8;
const PURGE_TXCLEAR: u32 = 4;

struct Serial {
    h: HANDLE,  // INVALID_HANDLE_VALUE when the port could not be opened or configured
}

impl Serial {
    fn new(port: &str) -> Serial {
        let mut s = Serial { h: INVALID_HANDLE_VALUE };
        unsafe {
            let path = to_wide(&format!("\\\\.\\{port}"));
            s.h = CreateFileW(path.as_ptr(), GENERIC_READ | GENERIC_WRITE, 0, std::ptr::null(),
                              OPEN_EXISTING, 0, std::ptr::null_mut());
            if s.h == INVALID_HANDLE_VALUE { return s; }
            let mut dcb: DCB = std::mem::zeroed();
            dcb.DCBlength = std::mem::size_of::<DCB>() as u32;
            GetCommState(s.h, &mut dcb);
            dcb.BaudRate = CBR_9600;
            dcb.ByteSize = 8;
            dcb.Parity = NOPARITY;
            dcb.StopBits = ONESTOPBIT;
            // fBinary = TRUE; fOutxCtsFlow = fOutxDsrFlow = FALSE; fDtrControl = DTR_CONTROL_ENABLE;
            // fRtsControl = RTS_CONTROL_ENABLE; fOutX = fInX = FALSE
            dcb.f = (dcb.f & !(F_OUTXCTS_FLOW | F_OUTXDSR_FLOW | F_OUTX | F_INX | F_DTR_CONTROL | F_RTS_CONTROL))
                    | F_BINARY
                    | (DTR_CONTROL_ENABLE << 4)
                    | (RTS_CONTROL_ENABLE << 12);
            let mut to: COMMTIMEOUTS = std::mem::zeroed();
            to.ReadIntervalTimeout = 50;
            to.ReadTotalTimeoutConstant = 300;
            to.WriteTotalTimeoutConstant = 300;
            if SetCommState(s.h, &dcb) == 0 || SetCommTimeouts(s.h, &to) == 0 {
                s.close();
            } else {
                PurgeComm(s.h, PURGE_RXCLEAR | PURGE_TXCLEAR);
            }
        }
        s
    }

    fn ok(&self) -> bool { self.h != INVALID_HANDLE_VALUE }

    // Sends command (cmd, sub) and returns the data bytes of the matching 64-byte reply frame.
    fn command(&mut self, cmd: u8, sub: u8, data: &mut Vec<u8>) -> bool {
        let mut frame = [0u8; 64];
        frame[0] = 2;
        frame[1] = cmd;
        frame[2] = sub;
        let mut n: u32 = 0;
        unsafe {
            if WriteFile(self.h, frame.as_ptr(), frame.len() as u32, &mut n, std::ptr::null_mut()) == 0
                || n != frame.len() as u32 {
                return false;
            }
        }
        let mut buf: Vec<u8> = Vec::new();
        let end = now_ms() + 800;
        while (end as i64 - now_ms() as i64) > 0 {
            let mut chunk = [0u8; 128];
            let mut n: u32 = 0;
            unsafe {
                if ReadFile(self.h, chunk.as_mut_ptr(), chunk.len() as u32, &mut n, std::ptr::null_mut()) == 0 {
                    return false;
                }
            }
            buf.extend_from_slice(&chunk[..n as usize]);
            while buf.len() >= 64 {
                // the headset also pushes unsolicited frames; skip those
                if buf[1] == cmd && buf[2] == sub {
                    data.clear();
                    data.extend_from_slice(&buf[3..64]);
                    return true;
                }
                buf.drain(..64);
            }
        }
        false
    }

    fn close(&mut self) {
        if self.h != INVALID_HANDLE_VALUE { unsafe { CloseHandle(self.h); } }
        self.h = INVALID_HANDLE_VALUE;
    }
}

impl Drop for Serial {
    fn drop(&mut self) { self.close(); }
}

pub fn poll_atk_serial(ctx: &mut PollContext) {
    for p in FindPorts() {
        let pid = p.model.pid;
        if ctx.is_claimed(0x373B, pid) { continue; }
        let mut port = Serial::new(&p.name);
        if !port.ok() { continue; }  // in use (ATK app open) or not a working port
        let mut data: Vec<u8> = Vec::new();
        if !port.command(0x00, 0x04, &mut data) { continue; }
        let mut s = DeviceStatus::default();
        s.key = format!("atk-serial:{}", hex4(pid));
        s.name = p.model.name.into();
        s.kind = DeviceKind::Headset;
        s.via = (if p.model.wired { "USB cable" } else { "2.4 GHz receiver" }).into();
        s.connected = data[1] == 1;
        if s.connected && port.command(0x00, 0x03, &mut data) {
            s.percent = clamp100((data[1] & 0x7F) as i32);
            s.charging = (data[1] & 0x80) != 0;
        }
        ctx.add(s, 0x373B, pid);
    }
}
