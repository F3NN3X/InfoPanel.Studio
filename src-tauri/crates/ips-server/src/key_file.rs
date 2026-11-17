// The agent hook key's file (pinned layer P8, security review 5): where it lives and who may read it. ips-agent compiles this
// same file (its hook_auth.rs, `#[path]`), so the server and the hook agree on the place and the check.
//
// - It lives in the user's own folder, whatever DASHBOARD_DATA_DIR says (a data folder can be set anywhere, even shared):
//   INFOPANEL_STUDIO_CONFIG_DIR when set (test runs), else `%LOCALAPPDATA%\dev.f3nn3x.infopanel-studio` on Windows and
//   `$XDG_CONFIG_HOME/infopanel-studio` (or `~/.config/infopanel-studio`) elsewhere. Not the roaming profile.
// - It is made owner-only: mode 0600 on Unix; on Windows an explicit, protected DACL (no inherited entries) that grants the
//   current user and SYSTEM only, with the user as owner.
// - It is read only when it still is: on Unix owned by this user with mode 0600; on Windows owned by this user with no entry
//   that allows anyone but this user and SYSTEM. Anything else is refused: the server makes a fresh key, the hook takes no
//   answer and the agent asks in its terminal.

use std::path::{Path, PathBuf};

pub const KEY_FILE: &str = "agent-hook.key";
pub const KEY_BYTES: usize = 32;
/// The app's folder name under LOCALAPPDATA (the desktop app's identifier, src-tauri/tauri.conf.json).
const WINDOWS_DIR: &str = "dev.f3nn3x.infopanel-studio";
const UNIX_DIR: &str = "infopanel-studio";

pub type Key = [u8; KEY_BYTES];

/// Why a key file was not read.
#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
    Missing,
    /// Someone but this user may read or write it (or it isn't this user's).
    NotOwnerOnly,
    /// Not a key: the wrong length.
    Damaged,
    Unreadable(String),
}

/// The key file's place for these environment values (`config`: INFOPANEL_STUDIO_CONFIG_DIR).
pub fn key_file_for(config: Option<&str>, local: Option<&str>, xdg: Option<&str>, home: Option<&str>) -> PathBuf {
    let set = |v: Option<&str>| v.filter(|s| !s.is_empty()).map(PathBuf::from);
    if let Some(dir) = set(config) {
        return dir.join(KEY_FILE);
    }
    let dir = if cfg!(windows) {
        set(local).unwrap_or_else(std::env::temp_dir).join(WINDOWS_DIR)
    } else {
        set(xdg).unwrap_or_else(|| Path::new(home.unwrap_or(".")).join(".config")).join(UNIX_DIR)
    };
    dir.join(KEY_FILE)
}

/// The key file's place in this process's environment.
pub fn key_file() -> PathBuf {
    let var = |k: &str| std::env::var(k).ok();
    key_file_for(var("INFOPANEL_STUDIO_CONFIG_DIR").as_deref(), var("LOCALAPPDATA").as_deref(), var("XDG_CONFIG_HOME").as_deref(), var("HOME").as_deref())
}

/// The key in `file`, if only this user can read or write it.
pub fn read(file: &Path) -> Result<Key, Refused> {
    if !file.exists() {
        return Err(Refused::Missing);
    }
    if !owner_only(file) {
        return Err(Refused::NotOwnerOnly);
    }
    let bytes = std::fs::read(file).map_err(|e| Refused::Unreadable(e.to_string()))?;
    bytes.try_into().map_err(|_| Refused::Damaged)
}

/// Writes `key` to a new file at `file` (an existing one is an error), owner-only from its first byte.
pub fn create(file: &Path, key: &Key) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    imp::create(file, key)
}

/// Whether only this user (and on Windows SYSTEM) may reach `file`.
pub fn owner_only(file: &Path) -> bool {
    imp::owner_only(file)
}

#[cfg(unix)]
mod imp {
    use std::io::Write;
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    use std::path::Path;

    pub fn create(file: &Path, key: &super::Key) -> std::io::Result<()> {
        std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(file)?.write_all(key)
    }

    pub fn owner_only(file: &Path) -> bool {
        // SAFETY: geteuid has no preconditions and can't fail.
        let me = unsafe { libc::geteuid() };
        std::fs::symlink_metadata(file).is_ok_and(|m| m.is_file() && m.uid() == me && m.mode() & 0o777 == 0o600)
    }
}

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use std::io::Write;
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::FromRawHandle;
    use std::path::Path;
    use std::ptr::null_mut;

    use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, ERROR_SUCCESS, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, GetNamedSecurityInfoW, SDDL_REVISION_1, SE_FILE_OBJECT,
    };
    use windows_sys::Win32::Security::{
        AclSizeInformation, CreateWellKnownSid, EqualSid, GetAce, GetAclInformation, GetTokenInformation, TokenUser, WinLocalSystemSid, ACCESS_ALLOWED_ACE, ACE_HEADER, ACL,
        ACL_SIZE_INFORMATION, DACL_SECURITY_INFORMATION, OWNER_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
    };
    use windows_sys::Win32::Storage::FileSystem::{CreateFileW, CREATE_NEW, FILE_ATTRIBUTE_NORMAL};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    /// The ACE types (winnt.h): an allow and a deny.
    const ACCESS_ALLOWED_ACE_TYPE: u8 = 0;
    const ACCESS_DENIED_ACE_TYPE: u8 = 1;
    const MAX_SID: usize = 68;

    fn wide(path: &Path) -> Vec<u16> {
        path.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
    }

    /// This process's user SID, in a buffer that holds its TOKEN_USER.
    struct User(Vec<u64>);

    impl User {
        fn current() -> Option<Self> {
            // SAFETY: the token handle is closed below; the buffer is sized by the first call and outlives every use of
            // the SID it holds (`sid` borrows it).
            unsafe {
                let mut token: HANDLE = null_mut();
                if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                    return None;
                }
                let mut len = 0u32;
                GetTokenInformation(token, TokenUser, null_mut(), 0, &mut len);
                let mut buf = vec![0u64; (len as usize).div_ceil(8).max(1)];
                let ok = GetTokenInformation(token, TokenUser, buf.as_mut_ptr().cast(), len, &mut len) != 0;
                CloseHandle(token);
                ok.then_some(Self(buf))
            }
        }

        fn sid(&self) -> PSID {
            // SAFETY: the buffer was filled with a TOKEN_USER by GetTokenInformation.
            unsafe { (*self.0.as_ptr().cast::<TOKEN_USER>()).User.Sid }
        }

        fn sid_string(&self) -> Option<String> {
            // SAFETY: ConvertSidToStringSidW allocates the string, freed with LocalFree after it is copied.
            unsafe {
                let mut text: *mut u16 = null_mut();
                if ConvertSidToStringSidW(self.sid(), &mut text) == 0 {
                    return None;
                }
                let len = (0..).take_while(|&i| *text.add(i) != 0).count();
                let out = String::from_utf16_lossy(std::slice::from_raw_parts(text, len));
                LocalFree(text.cast());
                Some(out)
            }
        }
    }

    fn system_sid() -> Option<[u8; MAX_SID]> {
        let mut buf = [0u8; MAX_SID];
        let mut len = MAX_SID as u32;
        // SAFETY: the buffer is MAX_SID bytes, the most a SID takes.
        (unsafe { CreateWellKnownSid(WinLocalSystemSid, null_mut(), buf.as_mut_ptr().cast(), &mut len) } != 0).then_some(buf)
    }

    pub fn create(file: &Path, key: &super::Key) -> std::io::Result<()> {
        let user = User::current().ok_or_else(std::io::Error::last_os_error)?;
        let sid = user.sid_string().ok_or_else(std::io::Error::last_os_error)?;
        // owner: this user; DACL protected (P: nothing inherited), full access for this user and SYSTEM only
        let sddl: Vec<u16> = format!("O:{sid}D:P(A;;FA;;;{sid})(A;;FA;;;SY)").encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: the descriptor is freed with LocalFree once the file exists; the handle is owned by the File.
        unsafe {
            let mut sd: PSECURITY_DESCRIPTOR = null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(), SDDL_REVISION_1, &mut sd, null_mut()) == 0 {
                return Err(std::io::Error::last_os_error());
            }
            let attributes = SECURITY_ATTRIBUTES { nLength: size_of::<SECURITY_ATTRIBUTES>() as u32, lpSecurityDescriptor: sd, bInheritHandle: 0 };
            let handle = CreateFileW(wide(file).as_ptr(), GENERIC_WRITE, 0, &attributes, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, null_mut());
            let error = std::io::Error::last_os_error();
            LocalFree(sd);
            if handle == INVALID_HANDLE_VALUE {
                return Err(error);
            }
            std::fs::File::from_raw_handle(handle).write_all(key)
        }
    }

    pub fn owner_only(file: &Path) -> bool {
        let (Some(user), Some(mut system)) = (User::current(), system_sid()) else { return false };
        let system: PSID = system.as_mut_ptr().cast();
        // SAFETY: GetNamedSecurityInfoW returns pointers into `sd`, freed with LocalFree at the end; each ACE is read within
        // the DACL's count.
        unsafe {
            let (mut owner, mut dacl, mut sd): (PSID, *mut ACL, PSECURITY_DESCRIPTOR) = (null_mut(), null_mut(), null_mut());
            let what = OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION;
            if GetNamedSecurityInfoW(wide(file).as_ptr(), SE_FILE_OBJECT, what, &mut owner, null_mut(), &mut dacl, null_mut(), &mut sd) != ERROR_SUCCESS {
                return false;
            }
            let ok = (|| {
                // no DACL at all grants everyone
                if owner.is_null() || dacl.is_null() || EqualSid(owner, user.sid()) == 0 {
                    return false;
                }
                let mut info: ACL_SIZE_INFORMATION = std::mem::zeroed();
                if GetAclInformation(dacl, (&raw mut info).cast(), size_of::<ACL_SIZE_INFORMATION>() as u32, AclSizeInformation) == 0 {
                    return false;
                }
                (0..info.AceCount).all(|i| {
                    let mut ace: *mut c_void = null_mut();
                    if GetAce(dacl, i, &mut ace) == 0 {
                        return false;
                    }
                    match (*ace.cast::<ACE_HEADER>()).AceType {
                        ACCESS_DENIED_ACE_TYPE => true,
                        ACCESS_ALLOWED_ACE_TYPE => {
                            let sid: PSID = (&raw mut (*ace.cast::<ACCESS_ALLOWED_ACE>()).SidStart).cast();
                            EqualSid(sid, user.sid()) != 0 || EqualSid(sid, system) != 0
                        }
                        // any other kind (an object or callback entry) is more than this file should have
                        _ => false,
                    }
                })
            })();
            LocalFree(sd);
            ok
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lives_in_the_users_own_folder_whatever_the_data_folder() {
        assert_eq!(key_file_for(Some("E:/scratch"), Some("C:/L"), None, None), Path::new("E:/scratch").join(KEY_FILE));
        if cfg!(windows) {
            assert_eq!(key_file_for(None, Some("C:/L"), None, None), Path::new("C:/L").join(WINDOWS_DIR).join(KEY_FILE));
        } else {
            assert_eq!(key_file_for(Some(""), None, Some("/x"), Some("/home/me")), Path::new("/x").join(UNIX_DIR).join(KEY_FILE));
            assert_eq!(key_file_for(None, None, None, Some("/home/me")), Path::new("/home/me/.config").join(UNIX_DIR).join(KEY_FILE));
        }
    }

    #[test]
    fn a_key_it_makes_is_owner_only_and_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(KEY_FILE);
        assert_eq!(read(&file), Err(Refused::Missing));
        create(&file, &[5u8; KEY_BYTES]).unwrap();
        assert!(owner_only(&file));
        assert_eq!(read(&file), Ok([5u8; KEY_BYTES]));
        // never over an existing file
        assert!(create(&file, &[6u8; KEY_BYTES]).is_err());
    }

    #[test]
    fn a_key_others_may_read_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(KEY_FILE);
        // a plain write: the folder's inherited entries on Windows (Administrators among them), 0644 or so on Unix
        std::fs::write(&file, [5u8; KEY_BYTES]).unwrap();
        #[cfg(unix)]
        std::fs::set_permissions(&file, std::os::unix::fs::PermissionsExt::from_mode(0o644)).unwrap();
        assert!(!owner_only(&file));
        assert_eq!(read(&file), Err(Refused::NotOwnerOnly));
    }

    #[test]
    fn an_owner_only_file_of_the_wrong_length_is_damaged() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(KEY_FILE);
        create(&file, &[5u8; KEY_BYTES]).unwrap();
        let mut f = std::fs::OpenOptions::new().append(true).open(&file).unwrap();
        std::io::Write::write_all(&mut f, b"x").unwrap();
        assert_eq!(read(&file), Err(Refused::Damaged));
    }
}
