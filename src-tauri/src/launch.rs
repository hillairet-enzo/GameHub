//! Starting an emulator. The UI only sends a console id and a game path
//! relative to that console's ROM folder: the executable and the arguments
//! always come from the saved settings, never from the web view.

use crate::model::{Console, LaunchOutcome};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Sessions shorter than this are not counted in the statistics.
pub const MIN_COUNTED_SECONDS: u64 = 10;
/// An emulator that dies with an error within this delay is reported as a failed launch.
const EARLY_EXIT: Duration = Duration::from_secs(4);
/// GameHub stays on screen (showing its launch screen) this long after the emulator
/// has started, then steps aside so the emulator window is not hidden behind it.
pub const INTRO_GRACE: Duration = Duration::from_secs(4);

#[derive(Debug)]
pub struct Prepared {
    pub emulator: PathBuf,
    pub args: Vec<String>,
    pub working_dir: PathBuf,
}

/// Splits an argument string like a shell would, honouring double and single quotes.
pub fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut has_token = false;
    for c in input.chars() {
        match (quote, c) {
            (Some(q), ch) if ch == q => quote = None,
            (Some(_), ch) => current.push(ch),
            (None, '"') | (None, '\'') => {
                quote = Some(c);
                has_token = true;
            }
            (None, ch) if ch.is_whitespace() => {
                if has_token || !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            (None, ch) => current.push(ch),
        }
    }
    if has_token || !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

/// Replaces `{rom}` in the template. If the template never mentions the game, it is appended.
pub fn build_args(template: &str, rom: &str) -> Vec<String> {
    let mut tokens = tokenize(template);
    if !tokens.iter().any(|t| t.contains("{rom}")) {
        tokens.push("{rom}".into());
    }
    tokens.into_iter().map(|t| t.replace("{rom}", rom)).collect()
}

/// Resolves a game inside the ROM folder and refuses anything that escapes it.
pub fn resolve_rom(rom_root: &Path, rel_path: &str) -> Result<PathBuf, String> {
    let rel = Path::new(rel_path);
    if rel_path.is_empty() || rel.is_absolute() || rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("rom_outside|{}", rel_path));
    }
    let full = rom_root.join(rel);
    if !full.is_file() {
        return Err(format!("rom_missing|{}", full.display()));
    }
    // Canonical paths are only used for the check: emulators dislike `\\?\` paths.
    let root_real = rom_root.canonicalize().map_err(|e| format!("rom_missing|{}", e))?;
    let full_real = full.canonicalize().map_err(|e| format!("rom_missing|{}", e))?;
    if !full_real.starts_with(&root_real) {
        return Err(format!("rom_outside|{}", rel_path));
    }
    Ok(full)
}

/// The program to start for an emulator path. On macOS an emulator is usually an `.app`
/// bundle, which is a folder: the program is the file inside `Contents/MacOS`.
pub fn resolve_executable(path: &Path) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    let is_bundle = path.is_dir() && path.extension().map(|e| e.eq_ignore_ascii_case("app")).unwrap_or(false);
    if !is_bundle {
        return None;
    }
    let mut programs: Vec<PathBuf> = fs::read_dir(path.join("Contents").join("MacOS")).ok()?.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect();
    programs.sort();
    // Prefer the one named like the bundle (PCSX2.app -> PCSX2), otherwise the first one.
    let stem = path.file_stem()?.to_string_lossy().to_lowercase();
    let same_name = programs.iter().position(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase() == stem).unwrap_or(false));
    match same_name {
        Some(i) => Some(programs.swap_remove(i)),
        None => programs.into_iter().next(),
    }
}

/// Programs that can be started by themselves (PC games). Shortcuts and scripts go through the shell.
const PROGRAM_EXTS: [&str; 4] = ["exe", "lnk", "bat", "cmd"];

/// Arguments for a program started by itself: the template without the game path.
pub fn build_direct_args(template: &str) -> Vec<String> {
    tokenize(template).into_iter().filter(|t| !t.contains("{rom}")).collect()
}

/// A game that is itself a program (`.exe`, shortcut or script): started directly.
fn prepare_program(console: &Console, rel_path: &str) -> Result<Prepared, String> {
    if console.rom_path.is_empty() {
        return Err("rom_folder_missing|".into());
    }
    let rom = resolve_rom(Path::new(&console.rom_path), rel_path)?;
    let ext = rom.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !PROGRAM_EXTS.contains(&ext.as_str()) {
        return Err(format!("emulator_missing|{}", console.emulator_path));
    }
    let working_dir = rom.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    let extra = build_direct_args(&console.args);
    if ext == "exe" {
        return Ok(Prepared { emulator: rom, args: extra, working_dir });
    }
    // Shortcuts and scripts: let Windows open them, and wait until the game is closed.
    let mut args = vec!["/C".to_string(), "start".into(), "/wait".into(), String::new(), rom.to_string_lossy().to_string()];
    args.extend(extra);
    Ok(Prepared { emulator: PathBuf::from("cmd"), args, working_dir })
}

pub fn prepare(console: &Console, rel_path: &str) -> Result<Prepared, String> {
    // No emulator chosen: the games must be programs (a PC console).
    if console.emulator_path.trim().is_empty() {
        return prepare_program(console, rel_path);
    }
    let emulator = match resolve_executable(Path::new(&console.emulator_path)) {
        Some(program) if !console.emulator_path.is_empty() => program,
        _ => return Err(format!("emulator_missing|{}", console.emulator_path)),
    };
    if console.rom_path.is_empty() {
        return Err("rom_folder_missing|".into());
    }
    let rom = resolve_rom(Path::new(&console.rom_path), rel_path)?;
    let working_dir = emulator.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
    Ok(Prepared { args: build_args(&console.args, &rom.to_string_lossy()), emulator, working_dir })
}

/// Starts the emulator and blocks until it exits.
///
/// `on_settled` is called once, after `grace`, if the emulator is still running. It is
/// not called when the emulator already quit by then, so the launcher stays in front
/// and can report the problem.
pub fn run(prepared: Prepared, grace: Duration, on_settled: impl FnOnce()) -> Result<LaunchOutcome, String> {
    let started = Instant::now();
    let mut child = Command::new(&prepared.emulator)
        .args(&prepared.args)
        .current_dir(&prepared.working_dir)
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn|{}", e))?;

    let mut finished = None;
    while started.elapsed() < grace {
        if let Some(status) = child.try_wait().map_err(|e| format!("spawn|{}", e))? {
            finished = Some(status);
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let status = match finished {
        Some(status) => status,
        None => {
            on_settled();
            child.wait().map_err(|e| format!("spawn|{}", e))?
        }
    };

    let elapsed = started.elapsed();
    let seconds = elapsed.as_secs();
    Ok(LaunchOutcome {
        seconds,
        exit_code: status.code(),
        failed_early: !status.success() && elapsed < EARLY_EXIT,
        counted: seconds >= MIN_COUNTED_SECONDS,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::temp_store;
    use std::fs;

    #[test]
    fn tokenizer_handles_quotes_and_spaces() {
        assert_eq!(tokenize("-batch -fullscreen -- {rom}"), vec!["-batch", "-fullscreen", "--", "{rom}"]);
        assert_eq!(tokenize(r#"--cfg "C:\My Files\a.ini" {rom}"#), vec!["--cfg", r"C:\My Files\a.ini", "{rom}"]);
        assert_eq!(tokenize("  a   'b c' "), vec!["a", "b c"]);
        assert_eq!(tokenize(r#"x "" y"#), vec!["x", "", "y"]);
        assert!(tokenize("   ").is_empty());
    }

    #[test]
    fn pc_games_start_by_themselves() {
        let store = temp_store("program");
        let games = store.root.join("games");
        fs::create_dir_all(games.join("Hades")).unwrap();
        fs::write(games.join("Hades").join("Hades.exe"), b"x").unwrap();
        fs::write(games.join("Hades").join("Hades.lnk"), b"x").unwrap();
        fs::write(games.join("disc.iso"), b"x").unwrap();
        let pc = Console { id: "pc".into(), rom_path: games.to_string_lossy().to_string(), args: "{rom} -windowed".into(), ..Default::default() };

        let exe = prepare(&pc, "Hades/Hades.exe").unwrap();
        assert_eq!(exe.emulator, games.join("Hades").join("Hades.exe"));
        assert_eq!(exe.args, vec!["-windowed"]);
        assert_eq!(exe.working_dir, games.join("Hades"));

        let link = prepare(&pc, "Hades/Hades.lnk").unwrap();
        assert_eq!(link.emulator, PathBuf::from("cmd"));
        assert_eq!(&link.args[..4], &["/C", "start", "/wait", ""]);
        assert!(link.args[4].ends_with("Hades.lnk"));

        // Something that is not a program needs an emulator, and the path rules still apply.
        assert!(prepare(&pc, "disc.iso").unwrap_err().starts_with("emulator_missing"));
        assert!(prepare(&pc, "../x.exe").unwrap_err().starts_with("rom_outside"));
        assert!(prepare(&pc, "nope.exe").unwrap_err().starts_with("rom_missing"));
        assert!(build_direct_args("{rom}").is_empty());
    }

    #[test]
    fn rom_placeholder_is_substituted_or_appended() {
        let rom = r"C:\Games\My Game.iso";
        assert_eq!(build_args("-b -e {rom}", rom), vec!["-b", "-e", rom]);
        assert_eq!(build_args("--rom={rom} -f", rom), vec![format!("--rom={}", rom), "-f".to_string()]);
        assert_eq!(build_args("-f", rom), vec!["-f", rom]);
        assert_eq!(build_args("", rom), vec![rom]);
    }

    #[test]
    fn game_paths_cannot_escape_the_rom_folder() {
        let store = temp_store("launch");
        let roms = store.root.join("roms");
        fs::create_dir_all(roms.join("sub")).unwrap();
        fs::write(roms.join("sub").join("ok.iso"), b"x").unwrap();
        fs::write(store.root.join("secret.txt"), b"x").unwrap();

        assert!(resolve_rom(&roms, "sub/ok.iso").is_ok());
        assert!(resolve_rom(&roms, "../secret.txt").unwrap_err().starts_with("rom_outside"));
        assert!(resolve_rom(&roms, "sub/../../secret.txt").unwrap_err().starts_with("rom_outside"));
        assert!(resolve_rom(&roms, "").unwrap_err().starts_with("rom_outside"));
        let absolute = store.root.join("secret.txt");
        assert!(resolve_rom(&roms, absolute.to_str().unwrap()).unwrap_err().starts_with("rom_outside"));
        assert!(resolve_rom(&roms, "nope.iso").unwrap_err().starts_with("rom_missing"));
    }

    #[test]
    fn mac_app_bundles_resolve_to_the_program_inside() {
        let store = temp_store("bundle");
        let bundle = store.root.join("PCSX2.app");
        let macos = bundle.join("Contents").join("MacOS");
        fs::create_dir_all(&macos).unwrap();
        fs::write(macos.join("helper"), b"x").unwrap();
        fs::write(macos.join("PCSX2"), b"x").unwrap();
        assert_eq!(resolve_executable(&bundle), Some(macos.join("PCSX2")));

        let other = store.root.join("Odd.app");
        fs::create_dir_all(other.join("Contents").join("MacOS")).unwrap();
        fs::write(other.join("Contents").join("MacOS").join("run"), b"x").unwrap();
        assert_eq!(resolve_executable(&other), Some(other.join("Contents").join("MacOS").join("run")));

        let plain = store.root.join("tool");
        fs::write(&plain, b"x").unwrap();
        assert_eq!(resolve_executable(&plain), Some(plain.clone()));
        assert_eq!(resolve_executable(&store.root.join("missing.app")), None);
        assert_eq!(resolve_executable(&store.root), None);
    }

    #[test]
    fn prepare_requires_a_real_emulator() {
        let store = temp_store("prepare");
        let roms = store.root.join("roms");
        fs::create_dir_all(&roms).unwrap();
        fs::write(roms.join("a.iso"), b"x").unwrap();
        let mut console = Console { id: "ps2".into(), rom_path: roms.to_string_lossy().to_string(), args: "{rom}".into(), ..Default::default() };
        assert!(prepare(&console, "a.iso").unwrap_err().starts_with("emulator_missing"));
        let emu = store.root.join("emu.exe");
        fs::write(&emu, b"x").unwrap();
        console.emulator_path = emu.to_string_lossy().to_string();
        let p = prepare(&console, "a.iso").unwrap();
        assert_eq!(p.working_dir, store.root);
        assert!(p.args[0].ends_with("a.iso"));
    }

    #[cfg(unix)]
    #[test]
    fn running_reports_exit_status() {
        use std::os::unix::fs::PermissionsExt;
        let store = temp_store("run");
        let script = store.root.join("fail.sh");
        fs::write(&script, "#!/bin/sh\nexit 3\n").unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let outcome = run(Prepared { emulator: script, args: vec![], working_dir: store.root.clone() }, Duration::ZERO, || {}).unwrap();
        assert_eq!(outcome.exit_code, Some(3));
        assert!(outcome.failed_early);
        assert!(!outcome.counted);

        let ok = store.root.join("ok.sh");
        fs::write(&ok, "#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&ok, fs::Permissions::from_mode(0o755)).unwrap();
        let outcome = run(Prepared { emulator: ok, args: vec![], working_dir: store.root.clone() }, Duration::ZERO, || {}).unwrap();
        assert!(!outcome.failed_early);
    }

    #[cfg(unix)]
    #[test]
    fn launcher_steps_aside_only_if_the_emulator_keeps_running() {
        use std::cell::Cell;
        use std::os::unix::fs::PermissionsExt;
        let store = temp_store("grace");
        let slow = store.root.join("slow.sh");
        fs::write(&slow, "#!/bin/sh\nsleep 1\n").unwrap();
        fs::set_permissions(&slow, fs::Permissions::from_mode(0o755)).unwrap();
        let called = Cell::new(false);
        run(Prepared { emulator: slow, args: vec![], working_dir: store.root.clone() }, Duration::from_millis(200), || called.set(true)).unwrap();
        assert!(called.get(), "still running after the grace period");

        let quick = store.root.join("quick.sh");
        fs::write(&quick, "#!/bin/sh\nexit 1\n").unwrap();
        fs::set_permissions(&quick, fs::Permissions::from_mode(0o755)).unwrap();
        let called = Cell::new(false);
        let outcome = run(Prepared { emulator: quick, args: vec![], working_dir: store.root.clone() }, Duration::from_secs(2), || called.set(true)).unwrap();
        assert!(!called.get(), "quit before the grace period ended");
        assert!(outcome.failed_early);
    }
}
