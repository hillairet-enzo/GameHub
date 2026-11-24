//! ROM discovery and cover lookup.

use crate::model::{Console, Game};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_DEPTH: usize = 4;

/// Stable 64-bit FNV-1a hash (std's hasher is not guaranteed to stay the same between releases).
pub fn fnv1a(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

pub fn cover_hash(console_id: &str, rel_path: &str) -> String {
    format!("{:016x}", fnv1a(&format!("{}/{}", console_id, rel_path.to_lowercase())))
}

/// Name used by the first versions of GameHub for cover files.
pub fn legacy_safe_name(file_stem: &str) -> String {
    file_stem.chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect()
}

// ---------- covers ----------

pub struct CoverIndex {
    files: Vec<(String, u128)>,
}

impl CoverIndex {
    pub fn load(dir: &Path) -> Self {
        let mut files = Vec::new();
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                let modified = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis())
                    .unwrap_or(0);
                files.push((name, modified));
            }
        }
        CoverIndex { files }
    }

    /// Newest cover for a game: current format first, then the legacy names.
    pub fn find(&self, hash: &str, legacy_safe: &str) -> Option<String> {
        let current = format!("{}_", hash);
        let legacy = format!("{}__COVER__", legacy_safe);
        let plain = format!("{}.", legacy_safe);
        let mut best: Option<(&String, u128)> = None;
        for (name, modified) in &self.files {
            let stamp = if let Some(rest) = name.strip_prefix(&current) {
                leading_number(rest).unwrap_or(*modified)
            } else if let Some(rest) = name.strip_prefix(&legacy) {
                leading_number(rest).unwrap_or(*modified)
            } else if name.starts_with(&plain) {
                *modified
            } else {
                continue;
            };
            if best.map(|(_, s)| stamp >= s).unwrap_or(true) {
                best = Some((name, stamp));
            }
        }
        best.map(|(n, _)| n.clone())
    }
}

fn leading_number(s: &str) -> Option<u128> {
    let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

// ---------- titles ----------

pub fn clean_title(stem: &str) -> (String, Option<String>) {
    let mut title = String::new();
    let mut region: Option<String> = None;
    let mut closing: Option<char> = None;
    let mut group = String::new();

    for c in stem.chars() {
        match (closing, c) {
            (None, '(') | (None, '[') => {
                closing = Some(if c == '(' { ')' } else { ']' });
                group.clear();
            }
            (Some(close), ch) if ch == close => {
                let g = group.trim().to_string();
                if is_disc_tag(&g) {
                    title.push_str(&format!("({})", g));
                } else if region.is_none() {
                    region = detect_region(&g);
                }
                closing = None;
            }
            (Some(_), ch) => group.push(ch),
            (None, ch) => title.push(ch),
        }
    }

    let mut cleaned = if title.contains(' ') { title } else { title.replace('_', " ") };
    cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = cleaned.trim_matches(|c: char| c == '-' || c == ' ').to_string();
    if cleaned.is_empty() {
        let fallback = stem.replace('_', " ");
        (fallback.trim().to_string(), region)
    } else {
        (cleaned, region)
    }
}

fn is_disc_tag(g: &str) -> bool {
    let l = g.to_lowercase();
    ["disc ", "disk ", "cd "].iter().any(|p| l.starts_with(p) && l[p.len()..].starts_with(|c: char| c.is_ascii_digit()))
}

fn detect_region(group: &str) -> Option<String> {
    let first = group.split(',').next()?.trim().to_lowercase();
    let code = match first.as_str() {
        "europe" => "EU",
        "usa" | "us" => "US",
        "japan" => "JP",
        "france" => "FR",
        "germany" => "DE",
        "spain" => "ES",
        "italy" => "IT",
        "uk" => "UK",
        "korea" => "KR",
        "asia" => "AS",
        "brazil" => "BR",
        "australia" => "AU",
        "world" => "WORLD",
        _ => return None,
    };
    Some(code.to_string())
}

// ---------- scanning ----------

pub fn rel_to_slash(rel: &Path) -> String {
    rel.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect::<Vec<_>>().join("/")
}

fn walk(dir: &Path, rel: &Path, depth: usize, wanted: &HashSet<String>, out: &mut Vec<(PathBuf, String)>) {
    if depth > MAX_DEPTH {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let child_rel = rel.join(&name);
        if path.is_dir() {
            walk(&path, &child_rel, depth + 1, wanted, out);
        } else if path.is_file() {
            let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if wanted.contains(&ext) {
                out.push((path, rel_to_slash(&child_rel)));
            }
        }
    }
}

/// Programs found next to a PC game that are not the game itself (uninstallers, installers of
/// runtime libraries, crash reporters...).
fn is_helper_program(stem: &str) -> bool {
    let name = stem.to_lowercase();
    const HELPERS: [&str; 15] = [
        "unins", "uninstall", "setup", "installer", "vcredist", "vc_redist", "dxsetup", "dotnet", "ndp", "crashhandler", "crashreport", "crashpad", "unitycrashhandler", "redist", "oalinst",
    ];
    HELPERS.iter().any(|h| name.starts_with(h) || name.contains(h) && *h != "setup" && *h != "ndp")
}

/// Games made of several files are launched through one of them: `eboot.bin` of a PS4 game is
/// named after its folder rather than after itself.
fn title_stem(path: &Path, stem: &str) -> String {
    if stem.eq_ignore_ascii_case("eboot") {
        if let Some(folder) = path.parent().and_then(|p| p.file_name()) {
            return folder.to_string_lossy().to_string();
        }
    }
    stem.to_string()
}

/// Files that other files already point to (tracks of a `.cue`, discs of an `.m3u`).
fn referenced_files(found: &[(PathBuf, String)]) -> HashSet<String> {
    let mut referenced = HashSet::new();
    for (path, rel) in found {
        let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if ext != "cue" && ext != "m3u" {
            continue;
        }
        let text = match fs::read(path) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(_) => continue,
        };
        let parent = rel.rsplit_once('/').map(|(p, _)| p.to_string());
        for line in text.lines() {
            let line = line.trim();
            let target = if ext == "cue" {
                if !line.to_uppercase().starts_with("FILE") {
                    continue;
                }
                match (line.find('"'), line.rfind('"')) {
                    (Some(a), Some(b)) if b > a => line[a + 1..b].to_string(),
                    _ => match line.split_whitespace().nth(1) {
                        Some(t) => t.to_string(),
                        None => continue,
                    },
                }
            } else {
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                line.to_string()
            };
            let target = target.replace('\\', "/");
            let full = match &parent {
                Some(p) => format!("{}/{}", p, target),
                None => target,
            };
            referenced.insert(full.to_lowercase());
        }
    }
    referenced
}

pub fn scan_console(console: &Console, covers: &CoverIndex) -> Result<Vec<Game>, String> {
    let root = Path::new(&console.rom_path);
    if console.rom_path.is_empty() {
        return Ok(Vec::new());
    }
    if !root.is_dir() {
        return Err(format!("rom_folder_missing|{}", console.rom_path));
    }

    let mut wanted: HashSet<String> = console.extensions.iter().cloned().collect();
    wanted.insert("cue".into());
    wanted.insert("m3u".into());

    let mut found = Vec::new();
    walk(root, Path::new(""), 0, &wanted, &mut found);
    let referenced = referenced_files(&found);

    let mut games = Vec::new();
    for (path, rel) in found {
        let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !console.extensions.contains(&ext) || referenced.contains(&rel.to_lowercase()) {
            continue;
        }
        let file_name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let stem = path.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| file_name.clone());
        if ext == "exe" && is_helper_program(&stem) {
            continue;
        }
        let (title, region) = clean_title(&title_stem(&path, &stem));
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let hash = cover_hash(&console.id, &rel);
        games.push(Game {
            console_id: console.id.clone(),
            console_title: console.title.clone(),
            key: format!("{}/{}", console.id, rel),
            cover: covers.find(&hash, &legacy_safe_name(&stem)),
            rel_path: rel,
            file_name,
            title,
            region,
            size,
        });
    }
    games.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()).then(a.rel_path.cmp(&b.rel_path)));
    Ok(games)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::temp_store;

    #[test]
    fn pc_folders_list_games_not_installers() {
        for helper in ["unins000", "Uninstall", "vcredist_x64", "VC_redist.x64", "dxsetup", "UnityCrashHandler64", "crashpad_handler", "setup", "dotNetFx45_Full_setup"] {
            assert!(is_helper_program(helper), "{}", helper);
        }
        for game in ["Hades", "Celeste", "Game", "Launcher", "SupermarketSimulator", "NeedForSpeedUnbound"] {
            assert!(!is_helper_program(game), "{}", game);
        }
    }

    #[test]
    fn exe_games_are_scanned_and_ps4_games_take_their_folder_name() {
        let store = temp_store("pcgames");
        let root = store.root.join("games");
        fs::create_dir_all(root.join("Hades")).unwrap();
        fs::write(root.join("Hades").join("Hades.exe"), b"x").unwrap();
        fs::write(root.join("Hades").join("unins000.exe"), b"x").unwrap();
        fs::create_dir_all(root.join("CUSA00001 Bloodborne")).unwrap();
        fs::write(root.join("CUSA00001 Bloodborne").join("eboot.bin"), b"x").unwrap();
        let pc = Console { id: "pc".into(), title: "PC".into(), rom_path: root.to_string_lossy().to_string(), extensions: vec!["exe".into(), "bin".into()], ..Default::default() };
        let covers = CoverIndex::load(&store.covers_dir());
        let games = scan_console(&pc, &covers).unwrap();
        let titles: Vec<&str> = games.iter().map(|g| g.title.as_str()).collect();
        assert_eq!(titles, vec!["CUSA00001 Bloodborne", "Hades"]);
    }

    #[test]
    fn hash_is_stable_and_case_insensitive_on_path() {
        assert_eq!(cover_hash("ps2", "A/B.iso"), cover_hash("ps2", "a/b.ISO"));
        assert_ne!(cover_hash("ps2", "x.iso"), cover_hash("wii", "x.iso"));
        assert_eq!(fnv1a("hello"), 0xa430d84680aabd0b);
    }

    #[test]
    fn titles_lose_tags_but_keep_disc_numbers() {
        assert_eq!(clean_title("Shin Megami Tensei - Persona 3 Portable (Europe)"), ("Shin Megami Tensei - Persona 3 Portable".into(), Some("EU".into())));
        assert_eq!(clean_title("Devil_May_Cry").0, "Devil May Cry");
        assert_eq!(clean_title("Final Fantasy VII (USA) (Disc 2) [!]").0, "Final Fantasy VII (Disc 2)");
        assert_eq!(clean_title("(Europe)").0, "(Europe)");
    }

    #[test]
    fn newest_cover_wins_and_legacy_names_are_found() {
        let store = temp_store("covers");
        let dir = store.covers_dir();
        for name in ["abc_100.jpg", "abc_300.png", "abc_200.jpg", "Old_Game__COVER__50.jpg", "other_999.jpg"] {
            fs::write(dir.join(name), b"x").unwrap();
        }
        let index = CoverIndex::load(&dir);
        assert_eq!(index.find("abc", "zzz").as_deref(), Some("abc_300.png"));
        assert_eq!(index.find("nohash", "Old_Game").as_deref(), Some("Old_Game__COVER__50.jpg"));
        assert_eq!(index.find("nohash", "nothing"), None);
    }

    fn console(root: &Path, exts: &[&str]) -> Console {
        Console {
            id: "ps1".into(),
            title: "PS1".into(),
            rom_path: root.to_string_lossy().to_string(),
            extensions: exts.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn cue_and_bin_are_a_single_game() {
        let store = temp_store("scan-cue");
        let roms = store.root.join("roms");
        fs::create_dir_all(roms.join("Multi")).unwrap();
        fs::write(roms.join("Persona.bin"), b"data").unwrap();
        fs::write(roms.join("Persona.cue"), "FILE \"Persona.bin\" BINARY\n  TRACK 01 MODE2/2352\n").unwrap();
        fs::write(roms.join("Multi").join("Game (Track 1).bin"), b"1").unwrap();
        fs::write(roms.join("Multi").join("Game (Track 2).bin"), b"2").unwrap();
        fs::write(
            roms.join("Multi").join("Game.cue"),
            "FILE \"Game (Track 1).bin\" BINARY\nFILE \"Game (Track 2).bin\" BINARY\n",
        )
        .unwrap();
        fs::write(roms.join("notes.txt"), b"nope").unwrap();

        let games = scan_console(&console(&roms, &["cue", "bin", "chd"]), &CoverIndex::load(&store.covers_dir())).unwrap();
        let names: Vec<_> = games.iter().map(|g| g.rel_path.clone()).collect();
        assert_eq!(names, vec!["Multi/Game.cue", "Persona.cue"]);
        assert_eq!(games[1].title, "Persona");
        assert_eq!(games[0].key, "ps1/Multi/Game.cue");
    }

    #[test]
    fn bins_are_listed_when_there_is_no_cue() {
        let store = temp_store("scan-bin");
        let roms = store.root.join("roms");
        fs::create_dir_all(&roms).unwrap();
        fs::write(roms.join("lonely.bin"), b"data").unwrap();
        let games = scan_console(&console(&roms, &["bin"]), &CoverIndex::load(&store.covers_dir())).unwrap();
        assert_eq!(games.len(), 1);
    }

    #[test]
    fn upper_case_extensions_are_recognised_and_stripped() {
        let store = temp_store("scan-upper");
        let roms = store.root.join("roms");
        fs::create_dir_all(&roms).unwrap();
        fs::write(roms.join("GAME.ISO"), b"data").unwrap();
        let games = scan_console(&console(&roms, &["iso"]), &CoverIndex::load(&store.covers_dir())).unwrap();
        assert_eq!(games[0].title, "GAME");
        assert_eq!(games[0].file_name, "GAME.ISO");
    }

    #[test]
    fn m3u_hides_its_discs() {
        let store = temp_store("scan-m3u");
        let roms = store.root.join("roms");
        fs::create_dir_all(&roms).unwrap();
        for f in ["FF7 (Disc 1).chd", "FF7 (Disc 2).chd", "FF7.m3u"] {
            fs::write(roms.join(f), b"x").unwrap();
        }
        fs::write(roms.join("FF7.m3u"), "FF7 (Disc 1).chd\nFF7 (Disc 2).chd\n").unwrap();
        let games = scan_console(&console(&roms, &["chd", "m3u"]), &CoverIndex::load(&store.covers_dir())).unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].file_name, "FF7.m3u");
    }

    #[test]
    fn missing_folder_is_an_error_and_empty_path_is_not() {
        let mut c = console(Path::new("/definitely/not/here"), &["iso"]);
        let idx = CoverIndex { files: vec![] };
        assert!(scan_console(&c, &idx).unwrap_err().starts_with("rom_folder_missing"));
        c.rom_path.clear();
        assert!(scan_console(&c, &idx).unwrap().is_empty());
    }
}
