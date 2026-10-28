//! Copies user-picked images into the app data folder so the UI never needs
//! access to arbitrary places on the disk.

use crate::library::cover_hash;
use crate::store::{now_ms, Store};
use std::fs;
use std::path::Path;

const IMAGE_EXTS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
const MAX_BYTES: u64 = 25 * 1024 * 1024;

fn validated_extension(source: &Path) -> Result<String, String> {
    if !source.is_file() {
        return Err(format!("image_missing|{}", source.display()));
    }
    let ext = source.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err(format!("image_type|{}", ext));
    }
    let size = fs::metadata(source).map(|m| m.len()).map_err(|e| format!("image_missing|{}", e))?;
    if size > MAX_BYTES {
        return Err("image_too_big|25".into());
    }
    Ok(ext)
}

/// `kind` is `avatar`, `banner` or `console`. Returns the new file name inside `Images`.
pub fn import_image(store: &Store, kind: &str, owner: &str, source: &str) -> Result<String, String> {
    if !["avatar", "banner", "console"].contains(&kind) {
        return Err(format!("image_kind|{}", kind));
    }
    let ext = validated_extension(Path::new(source))?;
    store.ensure_dirs()?;
    let tag: String = owner.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(32).collect();
    let name = if tag.is_empty() { format!("{}-{}.{}", kind, now_ms(), ext) } else { format!("{}-{}-{}.{}", kind, tag, now_ms(), ext) };
    fs::copy(source, store.images_dir().join(&name)).map_err(|e| format!("copy|{}", e))?;
    Ok(name)
}

fn remove_covers(store: &Store, console_id: &str, rel_path: &str, except: Option<&str>) {
    let prefix = format!("{}_", cover_hash(console_id, rel_path));
    let stem = rel_path.rsplit('/').next().unwrap_or(rel_path);
    let stem = stem.rsplit_once('.').map(|(s, _)| s).unwrap_or(stem);
    let legacy = format!("{}__COVER__", crate::library::legacy_safe_name(stem));
    if let Ok(entries) = fs::read_dir(store.covers_dir()) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if (name.starts_with(&prefix) || name.starts_with(&legacy)) && Some(name.as_str()) != except {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

/// Stores a new cover and removes the previous ones. Returns the new file name inside `Covers`.
pub fn set_cover(store: &Store, console_id: &str, rel_path: &str, source: &str) -> Result<String, String> {
    let ext = validated_extension(Path::new(source))?;
    store.ensure_dirs()?;
    let name = format!("{}_{}.{}", cover_hash(console_id, rel_path), now_ms(), ext);
    fs::copy(source, store.covers_dir().join(&name)).map_err(|e| format!("copy|{}", e))?;
    remove_covers(store, console_id, rel_path, Some(&name));
    Ok(name)
}

pub fn clear_cover(store: &Store, console_id: &str, rel_path: &str) {
    remove_covers(store, console_id, rel_path, None);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::temp_store;

    #[test]
    fn covers_replace_each_other() {
        let store = temp_store("cover-set");
        let src = store.root.join("pic.png");
        fs::write(&src, b"png").unwrap();
        let first = set_cover(&store, "ps2", "Game.iso", src.to_str().unwrap()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        let second = set_cover(&store, "ps2", "Game.iso", src.to_str().unwrap()).unwrap();
        assert_ne!(first, second);
        assert!(!store.covers_dir().join(&first).exists());
        assert!(store.covers_dir().join(&second).exists());
        clear_cover(&store, "ps2", "Game.iso");
        assert!(!store.covers_dir().join(&second).exists());
    }

    #[test]
    fn only_images_are_accepted() {
        let store = temp_store("cover-bad");
        let exe = store.root.join("evil.exe");
        fs::write(&exe, b"MZ").unwrap();
        assert!(set_cover(&store, "ps2", "a.iso", exe.to_str().unwrap()).unwrap_err().starts_with("image_type"));
        assert!(import_image(&store, "avatar", "", "/nope/missing.png").unwrap_err().starts_with("image_missing"));
        assert!(import_image(&store, "weird", "", exe.to_str().unwrap()).unwrap_err().starts_with("image_kind"));
    }

    #[test]
    fn import_image_names_are_sanitised() {
        let store = temp_store("img");
        let src = store.root.join("me.JPG");
        fs::write(&src, b"jpg").unwrap();
        let name = import_image(&store, "console", "../ps2", src.to_str().unwrap()).unwrap();
        assert!(name.starts_with("console-ps2-") && name.ends_with(".jpg"));
        assert!(store.images_dir().join(name).exists());
    }
}
