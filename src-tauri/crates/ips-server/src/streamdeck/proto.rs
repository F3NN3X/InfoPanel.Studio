// The VSD2 messages this client sends and reads, written by hand with prost's derives (no protoc in the build). The
// reference is `vsd2.proto` beside this file (the schema embedded in StreamDeck.exe); every field keeps its number from
// there, and a message or field we never use is left out (prost skips unknown fields when it reads).

/// `ImageFormat`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, prost::Enumeration)]
#[repr(i32)]
pub enum ImageFormat {
    Lzf = 0,
    Lzfse = 1,
    Lz4 = 2,
    Bmp = 3,
    Jpg = 4,
    Png = 5,
    Invalid = 100,
}

/// `Size`: width = 1, height = 2.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Size {
    #[prost(uint32, tag = "1")]
    pub width: u32,
    #[prost(uint32, tag = "2")]
    pub height: u32,
}

/// `Image`: format = 1, type = 2, size = 3, rowBytes = 4, image = 5.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Image {
    #[prost(enumeration = "ImageFormat", tag = "1")]
    pub format: i32,
    #[prost(int32, tag = "2")]
    pub r#type: i32,
    #[prost(message, optional, tag = "3")]
    pub size: Option<Size>,
    #[prost(uint32, tag = "4")]
    pub row_bytes: u32,
    #[prost(bytes = "vec", tag = "5")]
    pub image: Vec<u8>,
}

/// `ClientInformation`: name = 1, userAgent = 2, protocolVersion = 3, deviceModel = 4, osName = 5, osVersion = 6.
#[derive(Clone, PartialEq, prost::Message)]
pub struct ClientInformation {
    #[prost(string, tag = "1")]
    pub name: String,
    #[prost(string, tag = "2")]
    pub user_agent: String,
    #[prost(uint32, tag = "3")]
    pub protocol_version: u32,
    #[prost(string, tag = "4")]
    pub device_model: String,
    #[prost(string, tag = "5")]
    pub os_name: String,
    #[prost(string, tag = "6")]
    pub os_version: String,
}

/// `HelloFromClient`: publicKey = 1, clientInformation = 2.
#[derive(Clone, PartialEq, prost::Message)]
pub struct HelloFromClient {
    #[prost(bytes = "vec", tag = "1")]
    pub public_key: Vec<u8>,
    #[prost(message, optional, tag = "2")]
    pub client_information: Option<ClientInformation>,
}

/// `Authenticate`: requestID = 1.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Authenticate {
    #[prost(uint32, tag = "1")]
    pub request_id: u32,
}

/// `KeypadConfig`: supportedIconImageFormats = 1, iconSize = 2, pressedIconSize = 3, highDPI = 4, overscale = 5,
/// layoutCrop = 6, enableContextAPI = 7.
#[derive(Clone, PartialEq, prost::Message)]
pub struct KeypadConfig {
    #[prost(enumeration = "ImageFormat", repeated, tag = "1")]
    pub supported_icon_image_formats: Vec<i32>,
    #[prost(message, optional, tag = "2")]
    pub icon_size: Option<Size>,
    #[prost(message, optional, tag = "3")]
    pub pressed_icon_size: Option<Size>,
    #[prost(bool, tag = "4")]
    pub high_dpi: bool,
    #[prost(bool, tag = "5")]
    pub overscale: bool,
    #[prost(message, optional, tag = "6")]
    pub layout_crop: Option<Size>,
    #[prost(bool, tag = "7")]
    pub enable_context_api: bool,
}

/// `UpdateKeypadConfig`: iconSize = 1, pressedIconSize = 2, highDPI = 3, layoutCrop = 4.
#[derive(Clone, PartialEq, prost::Message)]
pub struct UpdateKeypadConfig {
    #[prost(message, optional, tag = "1")]
    pub icon_size: Option<Size>,
    #[prost(message, optional, tag = "2")]
    pub pressed_icon_size: Option<Size>,
    #[prost(bool, tag = "3")]
    pub high_dpi: bool,
    #[prost(message, optional, tag = "4")]
    pub layout_crop: Option<Size>,
}

/// `Error`: requestID = 1, code = 2 (`Error.Code`: DeviceNotFound = 0 ... InvalidState = 5), reason = 3.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Error {
    #[prost(uint32, tag = "1")]
    pub request_id: u32,
    #[prost(int32, tag = "2")]
    pub code: i32,
    #[prost(string, tag = "3")]
    pub reason: String,
}

/// `Ok`: requestID = 1.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Ok {
    #[prost(uint32, tag = "1")]
    pub request_id: u32,
}

/// `VirtualDevice`: id = 1, name = 2.
#[derive(Clone, PartialEq, prost::Message)]
pub struct VirtualDevice {
    #[prost(string, tag = "1")]
    pub id: String,
    #[prost(string, tag = "2")]
    pub name: String,
}

/// `CreateVirtualDevice`: requestID = 1, name = 2, keypadConfig = 3, skipUniquenessOfNameValidation = 4.
#[derive(Clone, PartialEq, prost::Message)]
pub struct CreateVirtualDevice {
    #[prost(uint32, tag = "1")]
    pub request_id: u32,
    #[prost(string, tag = "2")]
    pub name: String,
    #[prost(message, optional, tag = "3")]
    pub keypad_config: Option<KeypadConfig>,
    #[prost(bool, tag = "4")]
    pub skip_uniqueness_of_name_validation: bool,
}

/// `OpenVirtualDevice`: requestID = 1, deviceID = 2, keypadConfig = 3.
#[derive(Clone, PartialEq, prost::Message)]
pub struct OpenVirtualDevice {
    #[prost(uint32, tag = "1")]
    pub request_id: u32,
    #[prost(string, tag = "2")]
    pub device_id: String,
    #[prost(message, optional, tag = "3")]
    pub keypad_config: Option<KeypadConfig>,
}

/// `DeleteVirtualDevice`: no fields; deletes the device the session has open.
#[derive(Clone, PartialEq, prost::Message)]
pub struct DeleteVirtualDevice {}

/// `VirtualDeviceOpened`: requestID = 1, device = 2.
#[derive(Clone, PartialEq, prost::Message)]
pub struct VirtualDeviceOpened {
    #[prost(uint32, tag = "1")]
    pub request_id: u32,
    #[prost(message, optional, tag = "2")]
    pub device: Option<VirtualDevice>,
}

/// `VirtualDeviceList`: devices = 1.
#[derive(Clone, PartialEq, prost::Message)]
pub struct VirtualDeviceList {
    #[prost(message, repeated, tag = "1")]
    pub devices: Vec<VirtualDevice>,
}

/// `ClientCapabilities`: isUserPro = 1.
#[derive(Clone, PartialEq, prost::Message)]
pub struct ClientCapabilities {
    #[prost(bool, tag = "1")]
    pub is_user_pro: bool,
}

/// `HelloFromServer`, the two fields read: publicKey = 5, clientNeedsAuthentication = 6.
#[derive(Clone, PartialEq, prost::Message)]
pub struct HelloFromServer {
    #[prost(bytes = "vec", tag = "5")]
    pub public_key: Vec<u8>,
    #[prost(bool, tag = "6")]
    pub client_needs_authentication: bool,
}

/// `Icon`: index = 1, image = 2.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Icon {
    #[prost(uint32, tag = "1")]
    pub index: u32,
    #[prost(message, optional, tag = "2")]
    pub image: Option<Image>,
}

/// `KeyPress`: index = 1, pressed = 2.
#[derive(Clone, PartialEq, prost::Message)]
pub struct KeyPress {
    #[prost(uint32, tag = "1")]
    pub index: u32,
    #[prost(bool, tag = "2")]
    pub pressed: bool,
}

/// `NextPage`: no fields.
#[derive(Clone, PartialEq, prost::Message)]
pub struct NextPage {}

/// `PreviousPage`: no fields.
#[derive(Clone, PartialEq, prost::Message)]
pub struct PreviousPage {}

/// `PageByIndex`: index = 1.
#[derive(Clone, PartialEq, prost::Message)]
pub struct PageByIndex {
    #[prost(uint32, tag = "1")]
    pub index: u32,
}

/// `Action`: index = 1, title = 2, name = 3, category = 4, shortcutID = 5.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Action {
    #[prost(uint32, tag = "1")]
    pub index: u32,
    #[prost(string, tag = "2")]
    pub title: String,
    #[prost(string, tag = "3")]
    pub name: String,
    #[prost(string, tag = "4")]
    pub category: String,
    #[prost(string, tag = "5")]
    pub shortcut_id: String,
}

/// `Context`: profileID = 1, totalPages = 2, currentPage = 3, actions = 4.
#[derive(Clone, PartialEq, prost::Message)]
pub struct Context {
    #[prost(string, tag = "1")]
    pub profile_id: String,
    #[prost(uint32, tag = "2")]
    pub total_pages: u32,
    #[prost(uint32, tag = "3")]
    pub current_page: u32,
    #[prost(message, repeated, tag = "4")]
    pub actions: Vec<Action>,
}

/// `ContextUpdate`: profileID = 1, replace = 2, remove = 3.
#[derive(Clone, PartialEq, prost::Message)]
pub struct ContextUpdate {
    #[prost(string, tag = "1")]
    pub profile_id: String,
    #[prost(message, repeated, tag = "2")]
    pub replace: Vec<Action>,
    #[prost(uint32, repeated, tag = "3")]
    pub remove: Vec<u32>,
}

/// `ServerMessage`'s oneof, the payloads read (Shortcuts = 32 and ShortcutsUpdate = 33 are skipped as unknown).
#[derive(Clone, PartialEq, prost::Message)]
pub struct ServerMessage {
    #[prost(
        oneof = "server_message::Payload",
        tags = "1, 2, 10, 20, 21, 30, 31, 40"
    )]
    pub payload: Option<server_message::Payload>,
}

pub mod server_message {
    #[derive(Clone, PartialEq, prost::Oneof)]
    pub enum Payload {
        #[prost(message, tag = "1")]
        Error(super::Error),
        #[prost(message, tag = "2")]
        Ok(super::Ok),
        #[prost(message, tag = "10")]
        Hello(super::HelloFromServer),
        #[prost(message, tag = "20")]
        VirtualDeviceList(super::VirtualDeviceList),
        #[prost(message, tag = "21")]
        VirtualDeviceOpened(super::VirtualDeviceOpened),
        #[prost(message, tag = "30")]
        Context(super::Context),
        #[prost(message, tag = "31")]
        ContextUpdate(super::ContextUpdate),
        #[prost(message, tag = "40")]
        Icon(super::Icon),
    }
}

/// `ClientMessage`'s oneof, the payloads sent.
#[derive(Clone, PartialEq, prost::Message)]
pub struct ClientMessage {
    #[prost(
        oneof = "client_message::Payload",
        tags = "1, 2, 10, 11, 12, 20, 21, 22, 23, 30, 100"
    )]
    pub payload: Option<client_message::Payload>,
}

pub mod client_message {
    #[derive(Clone, PartialEq, prost::Oneof)]
    pub enum Payload {
        #[prost(message, tag = "1")]
        Hello(super::HelloFromClient),
        #[prost(message, tag = "2")]
        Authenticate(super::Authenticate),
        #[prost(message, tag = "10")]
        CreateVirtualDevice(super::CreateVirtualDevice),
        #[prost(message, tag = "11")]
        OpenVirtualDevice(super::OpenVirtualDevice),
        #[prost(message, tag = "12")]
        DeleteVirtualDevice(super::DeleteVirtualDevice),
        #[prost(message, tag = "20")]
        KeyPress(super::KeyPress),
        #[prost(message, tag = "21")]
        NextPage(super::NextPage),
        #[prost(message, tag = "22")]
        PreviousPage(super::PreviousPage),
        #[prost(message, tag = "23")]
        PageByIndex(super::PageByIndex),
        #[prost(message, tag = "30")]
        UpdateKeypadConfig(super::UpdateKeypadConfig),
        #[prost(message, tag = "100")]
        ClientCapabilities(super::ClientCapabilities),
    }
}

/// A client message around `payload`.
pub fn client(payload: client_message::Payload) -> ClientMessage {
    ClientMessage {
        payload: Some(payload),
    }
}

/// The icon size asked for, plain and pressed: 144 x 144, the Stream Deck XL's.
pub const ICON_SIZE: u32 = 144;

fn icon_size() -> Option<Size> {
    Some(Size {
        width: ICON_SIZE,
        height: ICON_SIZE,
    })
}

/// The keypad a device is opened or created with: LZ4 icons (lossless, the format the app compresses best), the icon
/// size, the grid, and the context API on (titles and pages).
pub fn keypad_config(cols: u32, rows: u32) -> KeypadConfig {
    KeypadConfig {
        supported_icon_image_formats: vec![ImageFormat::Lz4 as i32],
        icon_size: icon_size(),
        pressed_icon_size: icon_size(),
        high_dpi: false,
        overscale: false,
        layout_crop: Some(Size {
            width: cols,
            height: rows,
        }),
        enable_context_api: true,
    }
}

/// The grid change for an open device (re-opening a device does not apply a new layout).
pub fn keypad_update(cols: u32, rows: u32) -> UpdateKeypadConfig {
    UpdateKeypadConfig {
        icon_size: icon_size(),
        pressed_icon_size: icon_size(),
        high_dpi: false,
        layout_crop: Some(Size {
            width: cols,
            height: rows,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::client_message::Payload as C;
    use super::server_message::Payload as S;
    use super::*;
    use prost::Message as _;

    // The reference bytes were encoded by prost-build's code for `vsd2.proto` (the VSD2 prototype's build), with the same
    // values as below.

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    fn unhex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn encodes_each_client_message_as_the_schema_does() {
        let cases = [
            (
                C::Hello(HelloFromClient {
                    public_key: vec![7; 32],
                    client_information: Some(ClientInformation {
                        name: "InfoPanel Studio".into(),
                        user_agent: "InfoPanel Studio".into(),
                        protocol_version: 2,
                        device_model: "PC".into(),
                        os_name: "Windows".into(),
                        os_version: String::new(),
                    }),
                }),
                "0a570a20070707070707070707070707070707070707070707070707070707070707070712330a10496e666f50616e656c2053747564696f1210496e666f50616e656c2053747564696f1802220250432a0757696e646f7773",
            ),
            (C::Authenticate(Authenticate { request_id: 0 }), "1200"),
            (
                C::CreateVirtualDevice(CreateVirtualDevice { request_id: 3, name: "IPStudio 2".into(), keypad_config: Some(keypad_config(5, 3)), skip_uniqueness_of_name_validation: true }),
                "522d0803120a495053747564696f20321a1b0a010212060890011090011a0608900110900132040805100338012001",
            ),
            (
                C::OpenVirtualDevice(OpenVirtualDevice { request_id: 1, device_id: "abc".into(), keypad_config: Some(keypad_config(8, 8)) }),
                "5a24080112036162631a1b0a010212060890011090011a060890011090013204080810083801",
            ),
            (C::DeleteVirtualDevice(DeleteVirtualDevice {}), "6200"),
            (C::KeyPress(KeyPress { index: 7, pressed: true }), "a2010408071001"),
            (C::NextPage(NextPage {}), "aa0100"),
            (C::PreviousPage(PreviousPage {}), "b20100"),
            (C::PageByIndex(PageByIndex { index: 2 }), "ba01020802"),
            (C::UpdateKeypadConfig(keypad_update(4, 2)), "f201160a060890011090011206089001109001220408041002"),
            (C::ClientCapabilities(ClientCapabilities { is_user_pro: false }), "a20600"),
        ];
        for (payload, want) in cases {
            let message = client(payload);
            assert_eq!(hex(&message.encode_to_vec()), want, "{message:?}");
            assert_eq!(ClientMessage::decode(&unhex(want)[..]).unwrap(), message);
        }
    }

    #[test]
    fn decodes_each_server_message_as_the_schema_encodes_it() {
        let decode = |h: &str| ServerMessage::decode(&unhex(h)[..]).unwrap().payload;
        // A hello with every field set: the two read come through, the rest is skipped.
        let hello = "52500a027773120270631a03372e3020022a20090909090909090909090909090909090909090909090909090909090909090930013a0757696e646f7773420231314a0e0a0831302e302e302e3210a6dc01";
        assert_eq!(
            decode(hello),
            Some(S::Hello(HelloFromServer {
                public_key: vec![9; 32],
                client_needs_authentication: true
            }))
        );
        let action = |index, title: &str| Action {
            index,
            title: title.into(),
            ..Action::default()
        };
        let cases = [
            (
                "0a0a080110011a046e6f7065",
                S::Error(Error {
                    request_id: 1,
                    code: 1,
                    reason: "nope".into(),
                }),
            ),
            ("1200", S::Ok(Ok { request_id: 0 })),
            (
                "a2011b0a0d0a01611208495053747564696f0a0a0a016212054f74686572",
                S::VirtualDeviceList(VirtualDeviceList {
                    devices: vec![
                        VirtualDevice {
                            id: "a".into(),
                            name: "IPStudio".into(),
                        },
                        VirtualDevice {
                            id: "b".into(),
                            name: "Other".into(),
                        },
                    ],
                }),
            ),
            (
                "aa01110801120d0a01611208495053747564696f",
                S::VirtualDeviceOpened(VirtualDeviceOpened {
                    request_id: 1,
                    device: Some(VirtualDevice {
                        id: "a".into(),
                        name: "IPStudio".into(),
                    }),
                }),
            ),
            (
                "f201200a01701003180122171202476f1a06486f746b6579220653797374656d2a0173",
                S::Context(Context {
                    profile_id: "p".into(),
                    total_pages: 3,
                    current_page: 1,
                    actions: vec![Action {
                        index: 0,
                        title: "Go".into(),
                        name: "Hotkey".into(),
                        category: "System".into(),
                        shortcut_id: "s".into(),
                    }],
                }),
            ),
            (
                "fa010e0a0170120508021201581a020405",
                S::ContextUpdate(ContextUpdate {
                    profile_id: "p".into(),
                    replace: vec![action(2, "X")],
                    remove: vec![4, 5],
                }),
            ),
            (
                "c2021808031214080210011a0608900110900120c0042a03010203",
                S::Icon(Icon {
                    index: 3,
                    image: Some(Image {
                        format: ImageFormat::Lz4 as i32,
                        r#type: 1,
                        size: Some(Size {
                            width: 144,
                            height: 144,
                        }),
                        row_bytes: 576,
                        image: vec![1, 2, 3],
                    }),
                }),
            ),
        ];
        for (bytes, want) in cases {
            assert_eq!(decode(bytes), Some(want.clone()));
            assert_eq!(
                hex(&ServerMessage {
                    payload: Some(want)
                }
                .encode_to_vec()),
                bytes
            );
        }
        // A payload this client doesn't read (Shortcuts) decodes as none instead of failing.
        assert_eq!(decode("8202050a030a0178"), None);
    }
}
