// Windows' audio through Core Audio: the output and input endpoints with their volume and mute, the default ones, and the
// volume of each app's sessions. One dedicated thread owns every COM object (they never cross threads): it reads the
// whole state about five times a second, applies the writes it is sent and reads again at once, and reports a state only
// when it changed. A device that disappears or an app that quits mid-read is skipped, never an error.

use std::collections::HashMap;
use std::ffi::c_void;
use std::path::Path;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use tokio::sync::{oneshot, watch};
use windows::core::{Interface, BOOL, GUID, PCWSTR, PWSTR};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Foundation::{CloseHandle, S_OK};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eCapture, eCommunications, eConsole, eMultimedia, eRender, AudioSessionStateExpired, EDataFlow,
    IAudioSessionControl2, IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator,
    ISimpleAudioVolume, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

use super::act::{Kind, WinAct};
use super::state::{App, Dev, WindowsState};

const POLL: Duration = Duration::from_millis(200);
/// The id Windows gives the session for its own sounds (it belongs to no process).
const SYSTEM_SOUNDS: &str = "system sounds";

/// `IPolicyConfig`: the undocumented interface the Sound settings and every default-device switcher use. Only
/// `SetDefaultEndpoint` is called; the methods before it are declared (with opaque pointers) to keep the vtable's layout.
#[allow(non_snake_case)]
mod policy {
    use std::ffi::c_void;

    use windows::core::{BOOL, HRESULT, PCWSTR};
    use windows::Win32::Media::Audio::ERole;

    #[windows::core::interface("f8679f50-850a-41cf-9c72-430f290290c8")]
    pub unsafe trait IPolicyConfig: windows::core::IUnknown {
        pub unsafe fn GetMixFormat(&self, device: PCWSTR, format: *mut c_void) -> HRESULT;
        pub unsafe fn GetDeviceFormat(
            &self,
            device: PCWSTR,
            default: BOOL,
            format: *mut c_void,
        ) -> HRESULT;
        pub unsafe fn ResetDeviceFormat(&self, device: PCWSTR) -> HRESULT;
        pub unsafe fn SetDeviceFormat(
            &self,
            device: PCWSTR,
            endpoint_format: *mut c_void,
            mix_format: *mut c_void,
        ) -> HRESULT;
        pub unsafe fn GetProcessingPeriod(
            &self,
            device: PCWSTR,
            default: BOOL,
            default_period: *mut i64,
            min_period: *mut i64,
        ) -> HRESULT;
        pub unsafe fn SetProcessingPeriod(&self, device: PCWSTR, period: *mut i64) -> HRESULT;
        pub unsafe fn GetShareMode(&self, device: PCWSTR, mode: *mut c_void) -> HRESULT;
        pub unsafe fn SetShareMode(&self, device: PCWSTR, mode: *mut c_void) -> HRESULT;
        pub unsafe fn GetPropertyValue(
            &self,
            device: PCWSTR,
            fx: BOOL,
            key: *const c_void,
            value: *mut c_void,
        ) -> HRESULT;
        pub unsafe fn SetPropertyValue(
            &self,
            device: PCWSTR,
            fx: BOOL,
            key: *const c_void,
            value: *mut c_void,
        ) -> HRESULT;
        pub unsafe fn SetDefaultEndpoint(&self, device: PCWSTR, role: ERole) -> HRESULT;
        pub unsafe fn SetEndpointVisibility(&self, device: PCWSTR, visible: BOOL) -> HRESULT;
    }
}

use policy::IPolicyConfig;

/// The policy config's class id (`CPolicyConfigClient`).
const POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

/// The writes in flight to the COM thread, and the thread's lifetime.
pub struct Backend {
    commands: Sender<WinAct>,
    inbox: Mutex<Receiver<WinAct>>,
}

impl Backend {
    pub fn new() -> Self {
        let (commands, inbox) = std::sync::mpsc::channel();
        Self {
            commands,
            inbox: Mutex::new(inbox),
        }
    }

    /// Queues a write for the COM thread.
    pub fn send(&self, act: WinAct) -> bool {
        self.commands.send(act).is_ok()
    }

    /// Runs the COM thread until `shutdown` is set, passing each changed state to `on_state`. Returns when the thread
    /// ends (which the supervisor takes as a failure, unless the server is stopping).
    pub async fn run(
        self: &Arc<Self>,
        shutdown: watch::Receiver<bool>,
        on_state: Arc<dyn Fn(WindowsState) + Send + Sync>,
    ) {
        let (done, ended) = oneshot::channel::<()>();
        let backend = Arc::clone(self);
        let after = Arc::clone(&on_state);
        let spawned = std::thread::Builder::new()
            .name("audio-windows".into())
            .spawn(move || {
                backend.thread(&shutdown, &*on_state);
                let _ = done.send(());
            });
        if spawned.is_ok() {
            let _ = ended.await;
        }
        // The thread is gone (stopped, failed or panicked): nothing reads the writes now, so say Windows audio isn't there.
        after(WindowsState::default());
    }

    fn thread(
        &self,
        shutdown: &watch::Receiver<bool>,
        on_state: &(dyn Fn(WindowsState) + Send + Sync),
    ) {
        // SAFETY: balanced by the CoUninitialize below, on this same thread.
        if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
            return;
        }
        {
            // SAFETY: the enumerator lives only on this thread, and so does everything taken from it.
            let enumerator: Option<IMMDeviceEnumerator> =
                unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }.ok();
            if let Some(enumerator) = enumerator {
                self.poll_loop(&enumerator, shutdown, on_state);
            }
        }
        // SAFETY: pairs the successful CoInitializeEx above; every COM object is dropped by now.
        unsafe { CoUninitialize() };
    }

    fn poll_loop(
        &self,
        enumerator: &IMMDeviceEnumerator,
        shutdown: &watch::Receiver<bool>,
        on_state: &(dyn Fn(WindowsState) + Send + Sync),
    ) {
        let inbox = self.inbox.lock().unwrap_or_else(PoisonError::into_inner);
        // Writes queued while the thread was down are stale.
        while inbox.try_recv().is_ok() {}
        let mut names = HashMap::new();
        let mut last: Option<WindowsState> = None;
        while !*shutdown.borrow() {
            match inbox.recv_timeout(POLL) {
                Ok(act) => {
                    apply(enumerator, &act);
                    while let Ok(act) = inbox.try_recv() {
                        apply(enumerator, &act);
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
            let now = snapshot(enumerator, &mut names);
            if last.as_ref() != Some(&now) {
                on_state(now.clone());
                last = Some(now);
            }
        }
    }
}

/// The text of a COM-allocated wide string, freed.
fn take_string(p: PWSTR) -> String {
    // SAFETY: `p` came from a Core Audio call that allocates it with CoTaskMemAlloc and hands it over.
    unsafe {
        let s = p.to_string().unwrap_or_default();
        CoTaskMemFree(Some(p.0 as *const c_void));
        s
    }
}

fn device_id(device: &IMMDevice) -> Option<String> {
    // SAFETY: a plain COM call on an interface of this thread.
    unsafe { device.GetId() }.ok().map(take_string)
}

fn friendly_name(device: &IMMDevice) -> Option<String> {
    // SAFETY: COM calls on this thread's interfaces; the string PropVariantToStringAlloc returns is freed by `take_string`.
    unsafe {
        let store = device.OpenPropertyStore(STGM_READ).ok()?;
        let value = store.GetValue(&PKEY_Device_FriendlyName).ok()?;
        PropVariantToStringAlloc(&value).ok().map(take_string)
    }
}

fn endpoints(enumerator: &IMMDeviceEnumerator, flow: EDataFlow) -> Vec<(String, IMMDevice)> {
    // SAFETY: COM calls on this thread's interfaces.
    unsafe {
        let Ok(list) = enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE) else {
            return Vec::new();
        };
        let count = list.GetCount().unwrap_or(0);
        (0..count)
            .filter_map(|i| list.Item(i).ok())
            .filter_map(|d| device_id(&d).map(|id| (id, d)))
            .collect()
    }
}

fn default_id(enumerator: &IMMDeviceEnumerator, flow: EDataFlow) -> Option<String> {
    // SAFETY: a COM call on this thread's interface.
    unsafe { enumerator.GetDefaultAudioEndpoint(flow, eConsole) }
        .ok()
        .and_then(|d| device_id(&d))
}

fn percent(scalar: f32) -> u8 {
    (scalar * 100.0).round().clamp(0.0, 100.0) as u8
}

fn endpoint_volume(device: &IMMDevice) -> Option<IAudioEndpointVolume> {
    // SAFETY: a COM call on this thread's interface.
    unsafe { device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) }.ok()
}

fn devices(
    enumerator: &IMMDeviceEnumerator,
    flow: EDataFlow,
    names: &mut HashMap<String, String>,
) -> Vec<Dev> {
    let default = default_id(enumerator, flow);
    let mut out: Vec<Dev> = endpoints(enumerator, flow)
        .into_iter()
        .filter_map(|(id, device)| {
            let volume = endpoint_volume(&device)?;
            // SAFETY: COM calls on this thread's interface.
            let (level, muted) = unsafe {
                (
                    volume.GetMasterVolumeLevelScalar().ok()?,
                    volume.GetMute().ok()?.as_bool(),
                )
            };
            let name = match names.get(&id) {
                Some(name) => name.clone(),
                None => {
                    let name = friendly_name(&device).unwrap_or_else(|| id.clone());
                    names.insert(id.clone(), name.clone());
                    name
                }
            };
            Some(Dev {
                is_default: default.as_deref() == Some(&id),
                id,
                name,
                volume: percent(level),
                muted,
            })
        })
        .collect();
    out.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });
    out
}

/// One audio session of an app on an output device.
struct Session {
    app: String,
    name: String,
    volume: ISimpleAudioVolume,
    device: String,
}

/// The executable's file name, lowercase, of a process.
fn exe_of(pid: u32) -> Option<String> {
    // SAFETY: the handle is closed before returning; the buffer is as long as the length we pass.
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 1024];
        let mut len = buffer.len() as u32;
        let queried = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(process);
        queried.ok()?;
        let path = String::from_utf16_lossy(&buffer[..len as usize]);
        Path::new(&path)
            .file_name()
            .map(|f| f.to_string_lossy().to_lowercase())
    }
}

/// `Discord` for `discord.exe`.
fn stem_of(exe: &str) -> String {
    let stem = exe.strip_suffix(".exe").unwrap_or(exe);
    let mut chars = stem.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(chars).collect()
    })
}

fn sessions(device: &IMMDevice, device_id: &str) -> Vec<Session> {
    // SAFETY: COM calls on this thread's interfaces.
    unsafe {
        let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else {
            return Vec::new();
        };
        let Ok(list) = manager.GetSessionEnumerator() else {
            return Vec::new();
        };
        let count = list.GetCount().unwrap_or(0);
        (0..count)
            .filter_map(|i| {
                let control = list.GetSession(i).ok()?;
                if control.GetState().ok()? == AudioSessionStateExpired {
                    return None;
                }
                let control2 = control.cast::<IAudioSessionControl2>().ok()?;
                let volume = control.cast::<ISimpleAudioVolume>().ok()?;
                let display = control2
                    .GetDisplayName()
                    .ok()
                    .map(take_string)
                    .unwrap_or_default();
                // S_OK is "yes" (S_FALSE, which is_ok() would also accept, "no"): the session for Windows' own sounds.
                if control2.IsSystemSoundsSession() == S_OK {
                    return Some(Session {
                        app: SYSTEM_SOUNDS.into(),
                        name: "System sounds".into(),
                        volume,
                        device: device_id.into(),
                    });
                }
                let exe = exe_of(control2.GetProcessId().ok()?)?;
                let name = if display.is_empty() || display.starts_with('@') {
                    stem_of(&exe)
                } else {
                    display
                };
                Some(Session {
                    app: exe,
                    name,
                    volume,
                    device: device_id.into(),
                })
            })
            .collect()
    }
}

/// Every session on every output, in the order Windows lists them.
fn all_sessions(enumerator: &IMMDeviceEnumerator) -> Vec<Session> {
    endpoints(enumerator, eRender)
        .iter()
        .flat_map(|(id, device)| sessions(device, id))
        .collect()
}

fn apps(enumerator: &IMMDeviceEnumerator) -> Vec<App> {
    let mut out: Vec<App> = Vec::new();
    for s in all_sessions(enumerator) {
        if out.iter().any(|a| a.id == s.app) {
            continue;
        }
        // SAFETY: COM calls on this thread's interface.
        let Some((level, muted)) =
            (unsafe { s.volume.GetMasterVolume().ok().zip(s.volume.GetMute().ok()) })
        else {
            continue;
        };
        out.push(App {
            id: s.app,
            name: s.name,
            volume: percent(level),
            muted: muted.as_bool(),
            device_id: s.device,
        });
    }
    out.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });
    out
}

/// The whole state now.
pub fn snapshot(
    enumerator: &IMMDeviceEnumerator,
    names: &mut HashMap<String, String>,
) -> WindowsState {
    WindowsState {
        available: true,
        outputs: devices(enumerator, eRender, names),
        inputs: devices(enumerator, eCapture, names),
        apps: apps(enumerator),
    }
}

/// Sets the mute: `muted`, or the opposite of `current` when None.
fn wanted_mute(muted: Option<bool>, current: bool) -> bool {
    muted.unwrap_or(!current)
}

fn apply(enumerator: &IMMDeviceEnumerator, act: &WinAct) {
    match act {
        WinAct::Volume {
            kind: Kind::App,
            id,
            value,
        } => {
            for s in all_sessions(enumerator).iter().filter(|s| &s.app == id) {
                // SAFETY: a COM call on this thread's interface; a null event context is allowed.
                let _ = unsafe {
                    s.volume
                        .SetMasterVolume(f32::from(*value) / 100.0, std::ptr::null())
                };
            }
        }
        WinAct::Mute {
            kind: Kind::App,
            id,
            muted,
        } => {
            let sessions = all_sessions(enumerator);
            // SAFETY: COM calls on this thread's interfaces; a null event context is allowed.
            unsafe {
                let Some(first) = sessions.iter().find(|s| &s.app == id) else {
                    return;
                };
                let target = wanted_mute(*muted, first.volume.GetMute().is_ok_and(BOOL::as_bool));
                for s in sessions.iter().filter(|s| &s.app == id) {
                    let _ = s.volume.SetMute(target, std::ptr::null());
                }
            }
        }
        WinAct::Volume { kind, id, value } => {
            if let Some(volume) = endpoint_of(enumerator, *kind, id) {
                // SAFETY: a COM call on this thread's interface; a null event context is allowed.
                let _ = unsafe {
                    volume.SetMasterVolumeLevelScalar(f32::from(*value) / 100.0, std::ptr::null())
                };
            }
        }
        WinAct::Mute { kind, id, muted } => {
            if let Some(volume) = endpoint_of(enumerator, *kind, id) {
                // SAFETY: COM calls on this thread's interface; a null event context is allowed.
                unsafe {
                    let target = wanted_mute(*muted, volume.GetMute().is_ok_and(BOOL::as_bool));
                    let _ = volume.SetMute(target, std::ptr::null());
                }
            }
        }
        WinAct::Default { id } => set_default(enumerator, id),
        // Opened by the route, not here.
        WinAct::Settings => {}
    }
}

/// The volume control of the output or input endpoint `id` (which must be one of the active ones).
fn endpoint_of(
    enumerator: &IMMDeviceEnumerator,
    kind: Kind,
    id: &str,
) -> Option<IAudioEndpointVolume> {
    let flow = if kind == Kind::Input {
        eCapture
    } else {
        eRender
    };
    endpoints(enumerator, flow)
        .into_iter()
        .find(|(i, _)| i == id)
        .and_then(|(_, d)| endpoint_volume(&d))
}

/// Makes `id` the default output or input for every role. Only an active endpoint is accepted.
fn set_default(enumerator: &IMMDeviceEnumerator, id: &str) {
    let known = [eRender, eCapture]
        .into_iter()
        .any(|flow| endpoints(enumerator, flow).iter().any(|(i, _)| i == id));
    if !known {
        return;
    }
    // SAFETY: the policy config is created and used on this thread; `wide` outlives the calls and is NUL-terminated.
    unsafe {
        let Ok(policy) =
            CoCreateInstance::<_, IPolicyConfig>(&POLICY_CONFIG_CLIENT, None, CLSCTX_ALL)
        else {
            return;
        };
        let wide: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
        for role in [eConsole, eMultimedia, eCommunications] {
            let _ = policy.SetDefaultEndpoint(PCWSTR(wide.as_ptr()), role);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_an_app_from_its_executable() {
        assert_eq!(stem_of("discord.exe"), "Discord");
        assert_eq!(stem_of("obs64.exe"), "Obs64");
        assert_eq!(stem_of(""), "");
    }

    #[test]
    fn a_mute_without_a_value_toggles() {
        assert!(wanted_mute(None, false));
        assert!(!wanted_mute(None, true));
        assert!(wanted_mute(Some(true), true));
        assert!(!wanted_mute(Some(false), true));
    }

    /// Reads this PC's real endpoints and sessions, read-only: nothing here writes a volume, a mute or a default.
    #[test]
    fn reads_this_pcs_endpoints_without_changing_them() {
        // SAFETY: balanced below; the enumerator is dropped before CoUninitialize.
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().unwrap();
            {
                let enumerator: IMMDeviceEnumerator =
                    CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                        .expect("the device enumerator");
                let now = snapshot(&enumerator, &mut HashMap::new());
                assert!(now.available);
                for list in [&now.outputs, &now.inputs] {
                    assert!(
                        list.iter().filter(|d| d.is_default).count() <= 1,
                        "at most one default"
                    );
                    assert!(list
                        .iter()
                        .all(|d| d.volume <= 100 && !d.id.is_empty() && !d.name.is_empty()));
                }
                assert!(now.apps.iter().all(|a| a.volume <= 100 && !a.id.is_empty()));
                let ids: Vec<_> = now.apps.iter().map(|a| &a.id).collect();
                assert_eq!(
                    ids.len(),
                    ids.iter().collect::<std::collections::HashSet<_>>().len(),
                    "one entry per app"
                );
            }
            CoUninitialize();
        }
    }
}
