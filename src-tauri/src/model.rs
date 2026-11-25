//! Data structures shared between the backend and the UI.
//! Everything is serialised as camelCase JSON.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const SETTINGS_VERSION: u32 = 2;
pub const THEMES: [&str; 10] = ["ocean", "matrix", "cyberpunk", "midnight", "sunset", "rose", "violet", "lagoon", "gold", "custom"];
pub const LANGUAGES: [&str; 3] = ["auto", "fr", "en"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    /// True once the first-launch tutorial has been shown.
    pub tutorial_seen: bool,
    pub profile: Profile,
    pub ui: UiPrefs,
    pub consoles: Vec<Console>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: SETTINGS_VERSION,
            tutorial_seen: false,
            profile: Profile::default(),
            ui: UiPrefs::default(),
            consoles: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub username: String,
    /// File name inside the `Images` folder.
    pub avatar: Option<String>,
    /// File name inside the `Images` folder.
    pub banner: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct UiPrefs {
    pub language: String,
    pub theme: String,
    pub clock24: bool,
    pub sound: bool,
    pub volume: f32,
    pub scanlines: bool,
    pub reduce_motion: bool,
    pub fullscreen: bool,
    /// Colour of the "custom" theme, as `#rrggbb`.
    pub accent: String,
    /// Wallpaper behind the launcher: file name inside the `Images` folder.
    pub wallpaper: Option<String>,
    /// How much the wallpaper is darkened, 0 to 90 (per cent).
    pub wallpaper_dim: u8,
    /// Personal SteamGridDB API key, used to download missing covers. Empty = feature off.
    pub steamgriddb_key: String,
    /// Look for a new version when GameHub starts.
    pub auto_update: bool,
    /// Show the running game on the player's Discord profile.
    pub discord_presence: bool,
}

impl Default for UiPrefs {
    fn default() -> Self {
        UiPrefs {
            language: "auto".into(),
            theme: "ocean".into(),
            clock24: true,
            sound: true,
            volume: 0.6,
            scanlines: true,
            reduce_motion: false,
            fullscreen: true,
            accent: String::new(),
            wallpaper: None,
            wallpaper_dim: 45,
            steamgriddb_key: String::new(),
            auto_update: true,
            discord_presence: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Console {
    pub id: String,
    pub title: String,
    /// Id of the preset this console was created from, if any.
    pub preset: Option<String>,
    pub emulator_path: String,
    pub rom_path: String,
    /// Command-line arguments. `{rom}` is replaced by the game path.
    pub args: String,
    /// Lower-case extensions without the dot.
    pub extensions: Vec<String>,
    /// File name inside the `Images` folder.
    pub image: Option<String>,
    /// Shape of the game covers (`dvd`, `bluray`, `tall`, `small`, `square`, `wide`, `poster`).
    /// Empty means "the usual shape of this console".
    pub cover_shape: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub console_id: String,
    pub console_title: String,
    /// Path relative to the console ROM folder, always with `/` separators.
    pub rel_path: String,
    pub file_name: String,
    /// `consoleId/relPath`, unique and stable. Used as key for stats.
    pub key: String,
    /// Display title (tags removed).
    pub title: String,
    pub region: Option<String>,
    pub size: u64,
    /// File name inside the `Covers` folder.
    pub cover: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct GameStat {
    pub seconds: u64,
    pub launches: u32,
    /// Unix time in seconds.
    pub last_played: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Stats {
    pub total_seconds: u64,
    pub total_sessions: u32,
    pub games: HashMap<String, GameStat>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOutcome {
    pub seconds: u64,
    pub exit_code: Option<i32>,
    /// The emulator closed almost immediately with an error code.
    pub failed_early: bool,
    /// The session was long enough to be counted in the stats.
    pub counted: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub os: String,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LegacyImport {
    pub username: Option<String>,
    pub total_seconds: u64,
    pub total_sessions: u32,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub title: String,
    pub emulator: String,
    pub extensions: Vec<String>,
    pub args: String,
    /// Executable name fragments used to recognise the emulator.
    pub exe_hints: Vec<String>,
    /// Usual shape of the covers of this console.
    pub shape: String,
    /// The games are programs that run by themselves: no emulator needed (PC).
    pub native: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanError {
    pub console_id: String,
    pub error: String,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub games: Vec<Game>,
    pub errors: Vec<ScanError>,
}
