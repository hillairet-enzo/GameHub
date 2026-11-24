//! Known consoles and emulators. Presets only pre-fill the form: every value
//! stays editable by the user. The person types the name of their console and
//! GameHub recognises it (`match_name`) to fill in file types, launch options
//! and the shape of the covers.

use crate::model::Preset;

struct Def {
    id: &'static str,
    title: &'static str,
    emulator: &'static str,
    extensions: &'static [&'static str],
    args: &'static str,
    exe_hints: &'static [&'static str],
    /// Other ways to write the console's name, lower case and without spaces or punctuation.
    aliases: &'static [&'static str],
    /// Usual shape of the covers (see `SHAPES`).
    shape: &'static str,
    /// Games are programs that run by themselves.
    native: bool,
}

/// Cover shapes, kept in sync with `src/app/shapes.ts`.
pub const SHAPES: &[&str] = &["dvd", "bluray", "tall", "small", "square", "wide", "poster"];

const DEFS: &[Def] = &[
    Def { id: "ps1", title: "PlayStation", emulator: "DuckStation", extensions: &["cue", "chd", "pbp", "iso", "m3u", "bin"], args: "-batch -fullscreen -- {rom}", exe_hints: &["duckstation"], aliases: &["ps1", "psx", "psone", "playstation", "playstation1"], shape: "square", native: false },
    Def { id: "ps2", title: "PlayStation 2", emulator: "PCSX2", extensions: &["iso", "chd", "cso", "zso", "gz", "bin"], args: "-batch -fullscreen -- {rom}", exe_hints: &["pcsx2"], aliases: &["ps2", "playstation2"], shape: "dvd", native: false },
    Def { id: "ps3", title: "PlayStation 3", emulator: "RPCS3", extensions: &["iso"], args: "--no-gui {rom}", exe_hints: &["rpcs3"], aliases: &["ps3", "playstation3"], shape: "bluray", native: false },
    Def { id: "ps4", title: "PlayStation 4", emulator: "shadPS4", extensions: &["bin", "pkg"], args: "-g {rom}", exe_hints: &["shadps4"], aliases: &["ps4", "playstation4"], shape: "bluray", native: false },
    Def { id: "psp", title: "PSP", emulator: "PPSSPP", extensions: &["iso", "cso", "chd", "pbp"], args: "--fullscreen {rom}", exe_hints: &["ppsspp"], aliases: &["psp", "playstationportable"], shape: "tall", native: false },
    Def { id: "gamecube", title: "GameCube", emulator: "Dolphin", extensions: &["iso", "gcm", "rvz", "ciso", "gcz"], args: "-b -e {rom}", exe_hints: &["dolphin"], aliases: &["gamecube", "gc", "ngc", "nintendogamecube"], shape: "dvd", native: false },
    Def { id: "wii", title: "Wii", emulator: "Dolphin", extensions: &["iso", "wbfs", "rvz", "wad", "ciso", "gcz"], args: "-b -e {rom}", exe_hints: &["dolphin"], aliases: &["wii", "nintendowii"], shape: "dvd", native: false },
    Def { id: "wiiu", title: "Wii U", emulator: "Cemu", extensions: &["wua", "wud", "wux", "rpx", "wad"], args: "-f -g {rom}", exe_hints: &["cemu"], aliases: &["wiiu", "nintendowiiu"], shape: "bluray", native: false },
    Def { id: "switch", title: "Nintendo Switch", emulator: "Eden / Ryujinx", extensions: &["nsp", "xci", "nsz", "xcz"], args: "-f -g {rom}", exe_hints: &["eden", "yuzu", "citron", "sudachi", "suyu", "ryujinx", "ryubing"], aliases: &["switch", "nintendoswitch", "nsw", "switch1", "nintendoswitch1"], shape: "tall", native: false },
    Def { id: "switch2", title: "Nintendo Switch 2", emulator: "Switch 2 emulator", extensions: &["nsp", "xci", "nsz", "xcz"], args: "{rom}", exe_hints: &[], aliases: &["switch2", "nintendoswitch2", "ns2"], shape: "tall", native: false },
    Def { id: "3ds", title: "Nintendo 3DS", emulator: "Azahar", extensions: &["3ds", "cci", "cxi", "cia", "3dsx"], args: "-f {rom}", exe_hints: &["azahar", "citra", "lime3ds"], aliases: &["3ds", "nintendo3ds", "n3ds", "2ds", "new3ds"], shape: "small", native: false },
    Def { id: "nds", title: "Nintendo DS", emulator: "melonDS", extensions: &["nds", "dsi"], args: "{rom}", exe_hints: &["melonds"], aliases: &["nds", "ds", "nintendods", "dsi"], shape: "small", native: false },
    Def { id: "xbox", title: "Xbox", emulator: "xemu", extensions: &["iso", "xiso"], args: "-dvd_path {rom}", exe_hints: &["xemu"], aliases: &["xbox", "xboxoriginal", "originalxbox", "xboxclassic"], shape: "dvd", native: false },
    Def { id: "xbox360", title: "Xbox 360", emulator: "Xenia", extensions: &["iso", "xex", "zar"], args: "{rom}", exe_hints: &["xenia"], aliases: &["xbox360", "x360", "360"], shape: "dvd", native: false },
    Def { id: "n64", title: "Nintendo 64", emulator: "simple64 / Project64", extensions: &["z64", "n64", "v64"], args: "{rom}", exe_hints: &["simple64", "project64"], aliases: &["n64", "nintendo64"], shape: "wide", native: false },
    Def { id: "gba", title: "Game Boy Advance", emulator: "mGBA", extensions: &["gba", "gb", "gbc", "zip"], args: "-f {rom}", exe_hints: &["mgba"], aliases: &["gba", "gameboyadvance", "gameboy", "gb", "gbc", "gameboycolor"], shape: "square", native: false },
    Def { id: "snes", title: "Super Nintendo", emulator: "Snes9x", extensions: &["sfc", "smc", "zip"], args: "{rom}", exe_hints: &["snes9x"], aliases: &["snes", "supernintendo", "supernes", "superfamicom", "sfc"], shape: "wide", native: false },
    Def { id: "nes", title: "NES", emulator: "Mesen", extensions: &["nes", "fds", "unf"], args: "{rom}", exe_hints: &["mesen", "fceux"], aliases: &["nes", "famicom", "nintendoentertainmentsystem"], shape: "wide", native: false },
    Def { id: "megadrive", title: "Mega Drive", emulator: "BlastEm", extensions: &["md", "gen", "smd"], args: "{rom}", exe_hints: &["blastem", "kega"], aliases: &["megadrive", "genesis", "segagenesis", "segamegadrive"], shape: "dvd", native: false },
    Def { id: "dreamcast", title: "Dreamcast", emulator: "Flycast", extensions: &["gdi", "cdi", "chd", "cue"], args: "{rom}", exe_hints: &["flycast"], aliases: &["dreamcast", "dc", "segadreamcast"], shape: "square", native: false },
    Def { id: "pc", title: "PC", emulator: "", extensions: &["exe", "lnk", "bat"], args: "{rom}", exe_hints: &[], aliases: &["pc", "exe", "windows", "win", "jeuxpc", "jeuxexe", "pcgames", "computer", "ordinateur", "steam", "epic", "gog"], shape: "poster", native: true },
];

/// Used when a console name is not recognised.
const OTHER: Def = Def { id: "other", title: "", emulator: "", extensions: &["iso", "chd", "cue", "cso", "gcm", "rvz", "wbfs", "wad", "z64", "n64", "nds", "gba", "sfc", "smc", "xex", "nsp", "xci"], args: "{rom}", exe_hints: &[], aliases: &[], shape: "dvd", native: false };

pub fn all() -> Vec<Preset> {
    DEFS.iter().map(to_preset).collect()
}

pub fn find(id: &str) -> Option<Preset> {
    DEFS.iter().find(|d| d.id == id).map(to_preset)
}

/// Lower case letters and digits only: "Nintendo  Switch 2!" -> "nintendoswitch2".
fn squash(text: &str) -> String {
    text.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

/// Recognises a console from the name the person typed. The longest matching name wins, so
/// "Switch 2" is not mistaken for "Switch". Returns `None` for names GameHub does not know.
pub fn match_name(name: &str) -> Option<Preset> {
    let whole = squash(name);
    if whole.is_empty() {
        return None;
    }
    let words: Vec<String> = name.split(|c: char| !c.is_alphanumeric()).map(squash).filter(|w| !w.is_empty()).collect();
    let mut best: Option<(&Def, usize)> = None;
    for def in DEFS {
        for alias in def.aliases {
            // The whole name is the alias (or starts/ends with it), or one of its words is.
            // Very short aliases only count as a whole word, so "ds" is not found inside "xbox ds4".
            let long_enough = alias.len() >= 4;
            let hit = words.iter().any(|w| w == alias) || (long_enough && (whole.starts_with(alias) || whole.ends_with(alias)));
            // "nintendo switch 2" has the words "nintendo", "switch", "2": try pairs of adjacent words too.
            let joined = words.windows(2).any(|w| format!("{}{}", w[0], w[1]) == *alias) || words.windows(3).any(|w| format!("{}{}{}", w[0], w[1], w[2]) == *alias);
            if (hit || joined) && best.map(|(_, len)| alias.len() > len).unwrap_or(true) {
                best = Some((def, alias.len()));
            }
        }
    }
    best.map(|(def, _)| to_preset(def))
}

/// What to pre-fill for a name GameHub does not know.
pub fn other() -> Preset {
    to_preset(&OTHER)
}

/// Guess the best arguments from an emulator executable path.
pub fn guess_args(emulator_path: &str) -> Option<String> {
    let name = emulator_path
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or("")
        .to_lowercase();
    if name.is_empty() {
        return None;
    }
    if name.contains("cemu") {
        return Some("-f -g {rom}".into());
    }
    if name.contains("ryujinx") || name.contains("ryubing") {
        return Some("{rom}".into());
    }
    DEFS.iter()
        .find(|d| d.exe_hints.iter().any(|h| name.contains(h)))
        .map(|d| d.args.to_string())
}

/// Extensions used when nothing better is known.
pub fn generic_extensions() -> Vec<String> {
    OTHER.extensions.iter().map(|s| s.to_string()).collect()
}

fn to_preset(d: &Def) -> Preset {
    Preset {
        id: d.id.into(),
        title: d.title.into(),
        emulator: d.emulator.into(),
        extensions: d.extensions.iter().map(|s| s.to_string()).collect(),
        args: d.args.into(),
        exe_hints: d.exe_hints.iter().map(|s| s.to_string()).collect(),
        shape: d.shape.into(),
        native: d.native,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_from_exe_name() {
        assert_eq!(guess_args(r"C:\Emu\PCSX2\pcsx2-qt.exe").as_deref(), Some("-batch -fullscreen -- {rom}"));
        assert_eq!(guess_args("/opt/dolphin-emu/Dolphin.exe").as_deref(), Some("-b -e {rom}"));
        assert_eq!(guess_args(r"C:\Emu\Ryujinx\Ryujinx.exe").as_deref(), Some("{rom}"));
        assert_eq!(guess_args(r"C:\Emu\Eden\eden.exe").as_deref(), Some("-f -g {rom}"));
        assert_eq!(guess_args("whatever.exe"), None);
    }

    #[test]
    fn a_folder_called_pcsx2_does_not_confuse_the_guess() {
        assert_eq!(guess_args(r"C:\Users\pcsx2fan\Emu\other.exe"), None);
    }

    #[test]
    fn presets_are_unique_and_have_rom_placeholder() {
        let all = all();
        let mut ids: Vec<_> = all.iter().map(|p| p.id.clone()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), all.len());
        assert!(all.iter().all(|p| p.args.contains("{rom}")));
        assert!(all.iter().all(|p| SHAPES.contains(&p.shape.as_str())));
        assert!(SHAPES.contains(&other().shape.as_str()));
    }

    #[test]
    fn names_typed_by_people_are_recognised() {
        let id = |name: &str| match_name(name).map(|p| p.id);
        assert_eq!(id("Switch"), Some("switch".into()));
        assert_eq!(id("Nintendo Switch"), Some("switch".into()));
        assert_eq!(id("Nintendo Switch 2"), Some("switch2".into()));
        assert_eq!(id("switch2"), Some("switch2".into()));
        assert_eq!(id("PS3"), Some("ps3".into()));
        assert_eq!(id("Ma PS4"), Some("ps4".into()));
        assert_eq!(id("PlayStation 2"), Some("ps2".into()));
        assert_eq!(id("Playstation"), Some("ps1".into()));
        assert_eq!(id("Sony PlayStation 3"), Some("ps3".into()));
        assert_eq!(id("Wii U"), Some("wiiu".into()));
        assert_eq!(id("Wii"), Some("wii".into()));
        assert_eq!(id("Xbox 360"), Some("xbox360".into()));
        assert_eq!(id("Xbox"), Some("xbox".into()));
        assert_eq!(id("Nintendo DS"), Some("nds".into()));
        assert_eq!(id("DS"), Some("nds".into()));
        assert_eq!(id("3DS"), Some("3ds".into()));
        assert_eq!(id("Super Nintendo"), Some("snes".into()));
        assert_eq!(id("SNES"), Some("snes".into()));
        assert_eq!(id("Game Boy Advance"), Some("gba".into()));
        assert_eq!(id("Jeux PC"), Some("pc".into()));
        assert_eq!(id("PC"), Some("pc".into()));
        assert_eq!(id("Mega Drive"), Some("megadrive".into()));
    }

    #[test]
    fn exe_style_names_mean_pc() {
        for name in [".exe", "EXE", "Jeux PC", "Windows", "Steam"] {
            assert_eq!(match_name(name).map(|p| p.id), Some("pc".to_string()), "{}", name);
        }
    }

    #[test]
    fn unknown_names_are_left_alone() {
        assert!(match_name("").is_none());
        assert!(match_name("   ").is_none());
        assert!(match_name("Ma console de salon").is_none());
        // A short name hidden inside another word is not a match.
        assert!(match_name("Chinese games").is_none());
        assert!(match_name("Atari 2600").is_none());
        assert_eq!(other().id, "other");
        assert!(!other().extensions.is_empty());
    }

    #[test]
    fn pc_games_run_by_themselves_and_switch_files_are_listed() {
        let pc = find("pc").unwrap();
        assert!(pc.native && pc.extensions.contains(&"exe".to_string()));
        let sw = find("switch").unwrap();
        assert!(["nsp", "xci", "nsz", "xcz"].iter().all(|e| sw.extensions.contains(&e.to_string())));
        assert!(!sw.native);
    }
}
