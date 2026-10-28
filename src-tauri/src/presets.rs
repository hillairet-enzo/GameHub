//! Known emulators and consoles. Presets only pre-fill the form: every value
//! stays editable by the user.

use crate::model::Preset;

struct Def {
    id: &'static str,
    title: &'static str,
    emulator: &'static str,
    extensions: &'static [&'static str],
    args: &'static str,
    exe_hints: &'static [&'static str],
}

const DEFS: &[Def] = &[
    Def { id: "ps1", title: "PlayStation", emulator: "DuckStation", extensions: &["cue", "chd", "pbp", "iso", "m3u", "bin"], args: "-batch -fullscreen -- {rom}", exe_hints: &["duckstation"] },
    Def { id: "ps2", title: "PlayStation 2", emulator: "PCSX2", extensions: &["iso", "chd", "cso", "zso", "gz", "bin"], args: "-batch -fullscreen -- {rom}", exe_hints: &["pcsx2"] },
    Def { id: "ps3", title: "PlayStation 3", emulator: "RPCS3", extensions: &["iso"], args: "--no-gui {rom}", exe_hints: &["rpcs3"] },
    Def { id: "psp", title: "PSP", emulator: "PPSSPP", extensions: &["iso", "cso", "chd", "pbp"], args: "--fullscreen {rom}", exe_hints: &["ppsspp"] },
    Def { id: "gamecube", title: "GameCube", emulator: "Dolphin", extensions: &["iso", "gcm", "rvz", "ciso", "gcz"], args: "-b -e {rom}", exe_hints: &["dolphin"] },
    Def { id: "wii", title: "Wii", emulator: "Dolphin", extensions: &["iso", "wbfs", "rvz", "wad", "ciso", "gcz"], args: "-b -e {rom}", exe_hints: &["dolphin"] },
    Def { id: "xbox360", title: "Xbox 360", emulator: "Xenia", extensions: &["iso", "xex", "zar"], args: "{rom}", exe_hints: &["xenia"] },
    Def { id: "n64", title: "Nintendo 64", emulator: "simple64 / Project64", extensions: &["z64", "n64", "v64"], args: "{rom}", exe_hints: &["simple64", "project64"] },
    Def { id: "nds", title: "Nintendo DS", emulator: "melonDS", extensions: &["nds", "dsi"], args: "{rom}", exe_hints: &["melonds"] },
    Def { id: "gba", title: "Game Boy Advance", emulator: "mGBA", extensions: &["gba", "gb", "gbc", "zip"], args: "-f {rom}", exe_hints: &["mgba"] },
    Def { id: "snes", title: "Super Nintendo", emulator: "Snes9x", extensions: &["sfc", "smc", "zip"], args: "{rom}", exe_hints: &["snes9x"] },
];

pub fn all() -> Vec<Preset> {
    DEFS.iter().map(to_preset).collect()
}

pub fn find(id: &str) -> Option<Preset> {
    DEFS.iter().find(|d| d.id == id).map(to_preset)
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
    DEFS.iter()
        .find(|d| d.exe_hints.iter().any(|h| name.contains(h)))
        .map(|d| d.args.to_string())
}

/// Extensions used when nothing better is known.
pub fn generic_extensions() -> Vec<String> {
    ["iso", "chd", "cue", "cso", "gcm", "rvz", "wbfs", "wad", "z64", "n64", "nds", "gba", "sfc", "smc", "xex"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

fn to_preset(d: &Def) -> Preset {
    Preset {
        id: d.id.into(),
        title: d.title.into(),
        emulator: d.emulator.into(),
        extensions: d.extensions.iter().map(|s| s.to_string()).collect(),
        args: d.args.into(),
        exe_hints: d.exe_hints.iter().map(|s| s.to_string()).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guesses_from_exe_name() {
        assert_eq!(guess_args(r"C:\Emu\PCSX2\pcsx2-qt.exe").as_deref(), Some("-batch -fullscreen -- {rom}"));
        assert_eq!(guess_args("/opt/dolphin-emu/Dolphin.exe").as_deref(), Some("-b -e {rom}"));
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
    }
}
