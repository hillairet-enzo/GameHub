//! First launch: build the initial settings. If the folder contains data from
//! the first versions of GameHub (`consoles.json`, `avatar.jpg`, covers) it is
//! imported; otherwise the user starts from a clean slate.

use crate::images::import_image;
use crate::model::{Console, Settings};
use crate::presets;
use crate::store::{slugify, Store};
use serde::Deserialize;
use std::fs;

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct LegacyConsole {
    id: String,
    title: String,
    emulator_path: String,
    rom_path: String,
    image: Option<String>,
}

fn os_username() -> String {
    ["USERNAME", "USER"]
        .iter()
        .filter_map(|k| std::env::var(k).ok())
        .map(|v| v.trim().to_string())
        .find(|v| !v.is_empty())
        .map(|v| v.chars().take(32).collect())
        .unwrap_or_else(|| "Player".to_string())
}

pub fn initial_settings(store: &Store) -> Settings {
    let mut settings = Settings::default();
    settings.profile.username = os_username();

    if let Some(consoles) = read_legacy_consoles(store) {
        settings.onboarded = !consoles.is_empty();
        for old in consoles {
            let id = slugify(if old.id.is_empty() { &old.title } else { &old.id });
            let preset = presets::find(&id);
            let args = preset
                .as_ref()
                .map(|p| p.args.clone())
                .or_else(|| presets::guess_args(&old.emulator_path))
                .unwrap_or_else(|| "{rom}".into());
            let extensions = preset.as_ref().map(|p| p.extensions.clone()).unwrap_or_else(presets::generic_extensions);
            let image = old
                .image
                .as_deref()
                .filter(|p| !p.is_empty())
                .and_then(|p| import_image(store, "console", &id, p).ok());
            settings.consoles.push(Console {
                title: if old.title.is_empty() { id.to_uppercase() } else { old.title },
                id: id.clone(),
                preset: preset.map(|p| p.id),
                emulator_path: old.emulator_path,
                rom_path: old.rom_path,
                args,
                extensions,
                image,
            });
        }
    }

    // Avatar and banner of the first versions.
    let legacy_avatar = store.root.join("avatar.jpg");
    if legacy_avatar.is_file() {
        settings.profile.avatar = import_image(store, "avatar", "", &legacy_avatar.to_string_lossy()).ok();
    }
    if let Some(banner) = newest_legacy_banner(store) {
        settings.profile.banner = import_image(store, "banner", "", &banner).ok();
    }
    settings
}

fn read_legacy_consoles(store: &Store) -> Option<Vec<LegacyConsole>> {
    let raw = fs::read_to_string(store.legacy_consoles_path()).ok()?;
    serde_json::from_str(&raw).ok()
}

fn newest_legacy_banner(store: &Store) -> Option<String> {
    let mut best: Option<(u128, String)> = None;
    for entry in fs::read_dir(store.covers_dir()).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(rest) = name.strip_prefix("profile_banner__COVER__") {
            let stamp: u128 = rest.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0);
            if best.as_ref().map(|(s, _)| stamp >= *s).unwrap_or(true) {
                best = Some((stamp, entry.path().to_string_lossy().to_string()));
            }
        }
    }
    best.map(|(_, p)| p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::temp_store;

    #[test]
    fn fresh_install_has_no_consoles_and_is_not_onboarded() {
        let store = temp_store("fresh");
        let s = store.load_settings().unwrap();
        assert!(s.consoles.is_empty());
        assert!(!s.onboarded);
        assert!(!s.profile.username.is_empty());
    }

    #[test]
    fn v1_data_is_imported() {
        let store = temp_store("v1");
        fs::write(
            store.legacy_consoles_path(),
            r#"[{"id":"ps2","title":"PS2","emulatorPath":"C:\\Emu\\pcsx2-qt.exe","romPath":"C:\\Roms\\PS2","image":""},
                {"id":"wii","title":"Wii","emulatorPath":"C:\\Emu\\Dolphin.exe","romPath":"C:\\Roms\\Wii"},
                {"id":"saturn","title":"Saturn","emulatorPath":"","romPath":""}]"#,
        )
        .unwrap();
        fs::write(store.root.join("avatar.jpg"), b"jpg").unwrap();
        fs::write(store.covers_dir().join("profile_banner__COVER__100.png"), b"a").unwrap();
        fs::write(store.covers_dir().join("profile_banner__COVER__200.jpg"), b"b").unwrap();

        let s = store.load_settings().unwrap();
        assert!(s.onboarded);
        assert_eq!(s.consoles.len(), 3);
        assert_eq!(s.consoles[0].args, "-batch -fullscreen -- {rom}");
        assert_eq!(s.consoles[1].args, "-b -e {rom}");
        assert_eq!(s.consoles[2].args, "{rom}");
        assert!(s.consoles[0].extensions.contains(&"iso".to_string()));
        let avatar = s.profile.avatar.expect("avatar imported");
        assert!(store.images_dir().join(avatar).exists());
        let banner = s.profile.banner.expect("banner imported");
        assert!(banner.ends_with(".jpg"), "newest banner wins: {}", banner);
        // The old files are left untouched.
        assert!(store.legacy_consoles_path().exists());
    }
}
