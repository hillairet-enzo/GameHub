//! Persistence: `settings.json` and `stats.json` inside the per-user data folder.
//! Nothing here depends on Tauri so it can be unit-tested.

use crate::model::*;
use crate::presets;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug)]
pub struct Store {
    pub root: PathBuf,
}

pub fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

pub fn now_secs() -> u64 {
    (now_ms() / 1000) as u64
}

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Store { root }
    }

    pub fn ensure_dirs(&self) -> Result<(), String> {
        for dir in [self.root.clone(), self.covers_dir(), self.images_dir()] {
            fs::create_dir_all(&dir).map_err(|e| format!("data_dir|{}: {}", dir.display(), e))?;
        }
        Ok(())
    }

    pub fn covers_dir(&self) -> PathBuf {
        self.root.join("Covers")
    }
    pub fn images_dir(&self) -> PathBuf {
        self.root.join("Images")
    }
    pub fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }
    pub fn stats_path(&self) -> PathBuf {
        self.root.join("stats.json")
    }
    pub fn legacy_consoles_path(&self) -> PathBuf {
        self.root.join("consoles.json")
    }

    // ---------- settings ----------

    /// Loads the settings. On first launch the legacy (v1) data is migrated,
    /// otherwise a fresh profile named after the OS user is created.
    pub fn load_settings(&self) -> Result<Settings, String> {
        self.ensure_dirs()?;
        let path = self.settings_path();
        if path.exists() {
            let raw = fs::read_to_string(&path).map_err(|e| format!("read|{}", e))?;
            match serde_json::from_str::<Settings>(&raw) {
                Ok(s) => return Ok(normalize(s)),
                Err(_) => {
                    // Keep the broken file for the user and start clean.
                    let _ = fs::rename(&path, self.root.join("settings.corrupt.json"));
                }
            }
        }
        let initial = crate::migrate::initial_settings(self);
        self.save_settings(&initial)?;
        Ok(initial)
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<Settings, String> {
        self.ensure_dirs()?;
        let clean = normalize(settings.clone());
        let json = serde_json::to_string_pretty(&clean).map_err(|e| format!("serialize|{}", e))?;
        write_atomic(&self.settings_path(), &json)?;
        Ok(clean)
    }

    // ---------- stats ----------

    pub fn load_stats(&self) -> Stats {
        fs::read_to_string(self.stats_path())
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save_stats(&self, stats: &Stats) -> Result<(), String> {
        let json = serde_json::to_string(stats).map_err(|e| format!("serialize|{}", e))?;
        write_atomic(&self.stats_path(), &json)
    }

    pub fn record_session(&self, game_key: &str, seconds: u64) -> Result<Stats, String> {
        let mut stats = self.load_stats();
        stats.total_seconds += seconds;
        stats.total_sessions += 1;
        let entry = stats.games.entry(game_key.to_string()).or_default();
        entry.seconds += seconds;
        entry.launches += 1;
        entry.last_played = now_secs();
        self.save_stats(&stats)?;
        Ok(stats)
    }

    pub fn import_legacy(&self, legacy: &LegacyImport) -> Result<(), String> {
        let mut settings = self.load_settings()?;
        if let Some(name) = legacy.username.as_ref().map(|n| n.trim()).filter(|n| !n.is_empty()) {
            settings.profile.username = name.chars().take(32).collect();
            self.save_settings(&settings)?;
        }
        let mut stats = self.load_stats();
        if stats.total_seconds == 0 && stats.total_sessions == 0 {
            stats.total_seconds = legacy.total_seconds;
            stats.total_sessions = legacy.total_sessions;
            self.save_stats(&stats)?;
        }
        Ok(())
    }

    /// Removes images that are no longer referenced by the settings.
    pub fn collect_garbage(&self, settings: &Settings) {
        let mut keep: Vec<&str> = Vec::new();
        if let Some(a) = &settings.profile.avatar {
            keep.push(a);
        }
        if let Some(b) = &settings.profile.banner {
            keep.push(b);
        }
        for c in &settings.consoles {
            if let Some(i) = &c.image {
                keep.push(i);
            }
        }
        if let Ok(entries) = fs::read_dir(self.images_dir()) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !keep.contains(&name.as_str()) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
}

/// Write to a temporary file then rename, so a crash never leaves a half-written file.
pub fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, content).map_err(|e| format!("write|{}", e))?;
    fs::rename(&tmp, path).map_err(|e| format!("write|{}", e))
}

pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut last_dash = true;
    for c in input.trim().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        "console".into()
    } else {
        out.chars().take(32).collect()
    }
}

/// `#rrggbb`, nothing else (the value ends up in CSS, so it must stay strict).
fn is_hex_colour(value: &str) -> bool {
    value.len() == 7 && value.starts_with('#') && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Cleans user input: unique ids, sane extensions, bounded values.
pub fn normalize(mut s: Settings) -> Settings {
    s.version = SETTINGS_VERSION;
    s.profile.username = s.profile.username.trim().chars().take(32).collect();

    if !THEMES.contains(&s.ui.theme.as_str()) {
        s.ui.theme = "ocean".into();
    }
    if !LANGUAGES.contains(&s.ui.language.as_str()) {
        s.ui.language = "auto".into();
    }
    if !is_hex_colour(&s.ui.accent) {
        s.ui.accent = String::new();
    }
    s.ui.volume = if s.ui.volume.is_finite() { s.ui.volume.clamp(0.0, 1.0) } else { 0.6 };

    let mut seen: Vec<String> = Vec::new();
    for c in s.consoles.iter_mut() {
        c.title = c.title.trim().chars().take(40).collect();
        if c.title.is_empty() {
            c.title = "Console".into();
        }
        let base = if c.id.trim().is_empty() { slugify(&c.title) } else { slugify(&c.id) };
        let mut id = base.clone();
        let mut n = 2;
        while seen.contains(&id) {
            id = format!("{}-{}", base, n);
            n += 1;
        }
        seen.push(id.clone());
        c.id = id;

        c.emulator_path = c.emulator_path.trim().to_string();
        c.rom_path = c.rom_path.trim().to_string();
        c.args = c.args.trim().to_string();

        let mut exts: Vec<String> = c
            .extensions
            .iter()
            .map(|e| e.trim().trim_start_matches('.').to_lowercase())
            .filter(|e| !e.is_empty() && e.len() <= 8 && e.chars().all(|ch| ch.is_ascii_alphanumeric()))
            .collect();
        let mut unique: Vec<String> = Vec::new();
        for e in exts.drain(..) {
            if !unique.contains(&e) {
                unique.push(e);
            }
        }
        exts = unique;
        if exts.is_empty() {
            exts = c
                .preset
                .as_deref()
                .and_then(presets::find)
                .map(|p| p.extensions)
                .unwrap_or_else(presets::generic_extensions);
        }
        c.extensions = exts;
    }
    s
}

#[cfg(test)]
pub fn temp_store(tag: &str) -> Store {
    let dir = std::env::temp_dir().join(format!("gamehub-test-{}-{}-{}", tag, std::process::id(), now_ms()));
    let _ = fs::remove_dir_all(&dir);
    let store = Store::new(dir);
    store.ensure_dirs().unwrap();
    store
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_is_safe() {
        assert_eq!(slugify("  Nintendo 64! "), "nintendo-64");
        assert_eq!(slugify("../../etc"), "etc");
        assert_eq!(slugify("🎮"), "console");
    }

    #[test]
    fn normalize_makes_ids_unique_and_fixes_extensions() {
        let mut s = Settings::default();
        s.consoles = vec![
            Console { title: "PS2".into(), extensions: vec![".ISO".into(), "iso".into(), "bad ext".into()], ..Default::default() },
            Console { title: "PS2".into(), ..Default::default() },
        ];
        s.ui.theme = "nope".into();
        s.ui.volume = 9.0;
        s.ui.accent = "red; background:url(x)".into();
        let n = normalize(s);
        assert_eq!(n.consoles[0].id, "ps2");
        assert_eq!(n.consoles[1].id, "ps2-2");
        assert_eq!(n.consoles[0].extensions, vec!["iso"]);
        assert!(!n.consoles[1].extensions.is_empty());
        assert_eq!(n.ui.theme, "ocean");
        assert_eq!(n.ui.volume, 1.0);
        assert_eq!(n.ui.accent, "");

        let mut ok = Settings::default();
        ok.ui.accent = "#F43F5E".into();
        let n = normalize(ok);
        assert_eq!(n.ui.accent, "#F43F5E");
    }

    #[test]
    fn settings_roundtrip_and_corrupt_file_recovery() {
        let store = temp_store("settings");
        let first = store.load_settings().unwrap();
        assert_eq!(first.version, SETTINGS_VERSION);
        let mut changed = first.clone();
        changed.profile.username = "Sam".into();
        store.save_settings(&changed).unwrap();
        assert_eq!(store.load_settings().unwrap().profile.username, "Sam");

        fs::write(store.settings_path(), "{ not json").unwrap();
        let recovered = store.load_settings().unwrap();
        assert_eq!(recovered.version, SETTINGS_VERSION);
        assert!(store.root.join("settings.corrupt.json").exists());
    }

    #[test]
    fn sessions_accumulate() {
        let store = temp_store("stats");
        store.record_session("ps2/a.iso", 100).unwrap();
        let stats = store.record_session("ps2/a.iso", 50).unwrap();
        assert_eq!(stats.total_seconds, 150);
        assert_eq!(stats.total_sessions, 2);
        assert_eq!(stats.games["ps2/a.iso"].launches, 2);
        assert!(stats.games["ps2/a.iso"].last_played > 0);
    }

    #[test]
    fn legacy_import_only_fills_empty_stats() {
        let store = temp_store("legacy");
        store.load_settings().unwrap();
        let legacy = LegacyImport { username: Some("Ana".into()), total_seconds: 3600, total_sessions: 4 };
        store.import_legacy(&legacy).unwrap();
        assert_eq!(store.load_stats().total_seconds, 3600);
        store.import_legacy(&LegacyImport { username: None, total_seconds: 9, total_sessions: 9 }).unwrap();
        assert_eq!(store.load_stats().total_seconds, 3600);
        assert_eq!(store.load_settings().unwrap().profile.username, "Ana");
    }
}
