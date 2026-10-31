// The audio state kiosks read (GET /api/audio, /events/audio): Windows' own endpoints and per-app sessions, and Elgato
// Wave Link's channels and mixes. Levels are whole percents (0-100).

use serde::Serialize;

/// An output or input endpoint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Dev {
    pub id: String,
    pub name: String,
    pub volume: u8,
    pub muted: bool,
    #[serde(rename = "default")]
    pub is_default: bool,
}

/// An app's audio: every session of one executable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct App {
    /// The executable's name, lowercase (`discord.exe`).
    pub id: String,
    pub name: String,
    pub volume: u8,
    pub muted: bool,
    /// The output endpoint the app plays on.
    #[serde(rename = "deviceId")]
    pub device_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct WindowsState {
    pub available: bool,
    pub outputs: Vec<Dev>,
    pub inputs: Vec<Dev>,
    pub apps: Vec<App>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WlStatus {
    /// Wave Link isn't there (no `ws-info.json`).
    Absent,
    /// It left its port but doesn't answer.
    Down,
    Up,
}

/// A channel's level and mute on one mix.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WlRoute {
    pub id: String,
    pub level: u8,
    pub muted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WlChannel {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub level: u8,
    pub muted: bool,
    pub mixes: Vec<WlRoute>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WlMix {
    pub id: String,
    pub name: String,
    pub level: u8,
    pub muted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WaveLinkState {
    pub status: WlStatus,
    pub channels: Vec<WlChannel>,
    pub mixes: Vec<WlMix>,
}

impl WaveLinkState {
    pub const fn new(status: WlStatus) -> Self {
        Self {
            status,
            channels: Vec::new(),
            mixes: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AudioState {
    pub windows: WindowsState,
    pub wavelink: WaveLinkState,
}
