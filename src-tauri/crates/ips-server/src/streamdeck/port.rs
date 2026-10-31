// Where the Stream Deck app's VSD2 server listens: the port it writes to
// `HKCU\Software\Elgato Systems GmbH\StreamDeck\vsd2_current_port` (a DWORD), else 28198, the one it has always used.

/// The port when the registry has none (or this isn't Windows).
pub const FALLBACK_PORT: u16 = 28198;

/// Which VSD2 server the sessions talk to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Endpoint {
    /// The Stream Deck app on this PC.
    Local,
    /// A given port on this machine (a test's fake server).
    Fixed(u16),
    /// None: every session reports the app absent. A server that runs no backends (a test) never reaches the real app.
    Offline,
}

impl Endpoint {
    /// The port to connect to now, or `None` for no server at all.
    pub fn port(self) -> Option<u16> {
        match self {
            Self::Local => Some(registry_port().unwrap_or(FALLBACK_PORT)),
            Self::Fixed(port) => Some(port),
            Self::Offline => None,
        }
    }
}

#[cfg(windows)]
fn registry_port() -> Option<u16> {
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    // SAFETY: the value is a DWORD (RRF_RT_REG_DWORD) written into `value`, whose size `size` gives.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!(r"Software\Elgato Systems GmbH\StreamDeck"),
            w!("vsd2_current_port"),
            RRF_RT_REG_DWORD,
            None,
            Some(std::ptr::from_mut(&mut value).cast()),
            Some(&mut size),
        )
    };
    if status.is_err() {
        return None;
    }
    u16::try_from(value).ok().filter(|port| *port != 0)
}

#[cfg(not(windows))]
fn registry_port() -> Option<u16> {
    None
}
