// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod images;
mod launch;
mod library;
mod migrate;
mod model;
mod presets;
mod store;

use model::*;
use std::sync::atomic::{AtomicBool, Ordering};
use store::Store;
use tauri::{AppHandle, Manager, State, WebviewWindow};

/// Errors are sent to the UI as `code|detail` so the UI can translate them.
type CmdResult<T> = Result<T, String>;

struct AppState {
    launching: AtomicBool,
}

/// Every user gets their own data folder (`%LOCALAPPDATA%`, `~/Library/Application Support`, `~/.local/share`).
fn store(app: &AppHandle) -> CmdResult<Store> {
    let base = app.path().app_local_data_dir().map_err(|e| format!("data_dir|{}", e))?;
    let store = Store::new(base.join("GameHub_Data"));
    store.ensure_dirs()?;
    Ok(store)
}

#[tauri::command]
fn get_app_info(app: AppHandle) -> CmdResult<AppInfo> {
    let store = store(&app)?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: store.root.to_string_lossy().to_string(),
        os: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
fn get_settings(app: AppHandle) -> CmdResult<Settings> {
    store(&app)?.load_settings()
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> CmdResult<Settings> {
    store(&app)?.save_settings(&settings)
}

#[tauri::command]
fn get_stats(app: AppHandle) -> CmdResult<Stats> {
    Ok(store(&app)?.load_stats())
}

#[tauri::command]
fn import_legacy(app: AppHandle, legacy: LegacyImport) -> CmdResult<()> {
    store(&app)?.import_legacy(&legacy)
}

#[tauri::command]
fn list_presets() -> Vec<Preset> {
    presets::all()
}

#[tauri::command]
fn guess_args(emulator_path: String) -> Option<String> {
    presets::guess_args(&emulator_path)
}

/// Scans the ROM folder of every console.
#[tauri::command]
async fn scan_library(app: AppHandle) -> CmdResult<ScanResult> {
    let store = store(&app)?;
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<ScanResult> {
        let settings = store.load_settings()?;
        let covers = library::CoverIndex::load(&store.covers_dir());
        let mut result = ScanResult::default();
        for console in &settings.consoles {
            match library::scan_console(console, &covers) {
                Ok(mut games) => result.games.append(&mut games),
                Err(error) => result.errors.push(ScanError { console_id: console.id.clone(), error }),
            }
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command(async)]
fn set_game_cover(app: AppHandle, console_id: String, rel_path: String, source_path: String) -> CmdResult<String> {
    images::set_cover(&store(&app)?, &console_id, &rel_path, &source_path)
}

#[tauri::command(async)]
fn clear_game_cover(app: AppHandle, console_id: String, rel_path: String) -> CmdResult<()> {
    images::clear_cover(&store(&app)?, &console_id, &rel_path);
    Ok(())
}

/// `kind` is `avatar`, `banner` or `console`. Returns the stored file name.
#[tauri::command(async)]
fn set_image(app: AppHandle, kind: String, owner: String, source_path: String) -> CmdResult<String> {
    images::import_image(&store(&app)?, &kind, &owner, &source_path)
}

#[tauri::command]
async fn launch_game(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    console_id: String,
    rel_path: String,
) -> CmdResult<LaunchOutcome> {
    if state.launching.swap(true, Ordering::SeqCst) {
        return Err("already_running|".into());
    }
    let result = run_game(&app, &window, &console_id, &rel_path).await;
    state.launching.store(false, Ordering::SeqCst);
    result
}

async fn run_game(app: &AppHandle, window: &WebviewWindow, console_id: &str, rel_path: &str) -> CmdResult<LaunchOutcome> {
    let store = store(app)?;
    let settings = store.load_settings()?;
    let console = settings
        .consoles
        .iter()
        .find(|c| c.id == console_id)
        .cloned()
        .ok_or_else(|| format!("console_missing|{}", console_id))?;
    let prepared = launch::prepare(&console, rel_path)?;

    // GameHub stays visible on its launch screen for a few seconds, then minimises (not
    // hides) so it can always be brought back from the taskbar.
    let was_fullscreen = window.is_fullscreen().unwrap_or(false);
    let to_minimise = window.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        launch::run(prepared, launch::INTRO_GRACE, move || {
            // macOS cannot minimise a window that is in native full screen: leave it first.
            #[cfg(target_os = "macos")]
            if was_fullscreen {
                let _ = to_minimise.set_fullscreen(false);
                std::thread::sleep(std::time::Duration::from_millis(900));
            }
            let _ = to_minimise.minimize();
        })
    })
    .await
    .map_err(|e| e.to_string());

    let _ = window.unminimize();
    let _ = window.show();
    if was_fullscreen {
        let _ = window.set_fullscreen(true);
    }
    let _ = window.set_focus();

    let outcome = outcome??;
    if outcome.counted {
        let _ = store.record_session(&format!("{}/{}", console_id, rel_path), outcome.seconds);
    }
    Ok(outcome)
}

#[tauri::command]
fn set_fullscreen(window: WebviewWindow, enabled: bool) -> CmdResult<()> {
    window.set_fullscreen(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_fullscreen(window: WebviewWindow) -> bool {
    window.is_fullscreen().unwrap_or(false)
}

#[tauri::command]
fn open_data_dir(app: AppHandle) -> CmdResult<()> {
    let dir = store(&app)?.root;
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    std::process::Command::new(program).arg(dir).spawn().map(|_| ()).map_err(|e| format!("spawn|{}", e))
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { launching: AtomicBool::new(false) })
        .setup(|app| {
            if let Ok(store) = store(app.handle()) {
                if let Ok(settings) = store.load_settings() {
                    store.collect_garbage(&settings);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_fullscreen(settings.ui.fullscreen);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_settings,
            save_settings,
            get_stats,
            import_legacy,
            list_presets,
            guess_args,
            scan_library,
            set_game_cover,
            clear_game_cover,
            set_image,
            launch_game,
            set_fullscreen,
            is_fullscreen,
            open_data_dir,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running GameHub");
}
