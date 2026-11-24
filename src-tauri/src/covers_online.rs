//! Fetches missing box art from SteamGridDB (https://www.steamgriddb.com).
//!
//! The user brings their own free API key. Only the game title is sent, and only
//! images hosted on steamgriddb.com are ever downloaded.

use crate::images::store_cover_bytes;
use crate::store::Store;
use serde_json::Value;
use std::io::Read;
use std::time::Duration;

const API: &str = "https://www.steamgriddb.com/api/v2";
const MAX_BYTES: u64 = 8 * 1024 * 1024;

/// Percent-encodes everything but unreserved characters, so a title can sit in a URL path.
pub fn encode_path(text: &str) -> String {
    let mut out = String::new();
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

/// "Crimson_Harbor.v2" -> "Crimson Harbor v2": file names rarely read like titles.
pub fn search_term(title: &str) -> String {
    title.replace(['_', '.'], " ").split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Vertical boxes everywhere except square media (CDs, cartridges).
pub fn dimensions(shape: &str) -> &'static str {
    if shape == "square" {
        "512x512,1024x1024"
    } else {
        "600x900,342x482,660x930"
    }
}

/// Only HTTPS links to steamgriddb.com (and its CDN sub-domains) are followed.
pub fn allowed_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split('/').next().unwrap_or("");
    if host.is_empty() || host.contains(['@', ':', '?', '#', '\\']) {
        return false;
    }
    host == "steamgriddb.com" || host.ends_with(".steamgriddb.com")
}

/// First game of an autocomplete answer.
pub fn first_game_id(body: &str) -> Option<u64> {
    let json: Value = serde_json::from_str(body).ok()?;
    json.get("data")?.as_array()?.first()?.get("id")?.as_u64()
}

/// First usable image link of a grids answer.
pub fn first_grid_url(body: &str) -> Option<String> {
    let json: Value = serde_json::from_str(body).ok()?;
    json.get("data")?
        .as_array()?
        .iter()
        .filter_map(|g| g.get("url").and_then(|u| u.as_str()))
        .find(|u| allowed_url(u))
        .map(|u| u.to_string())
}

/// The kind of image, from its first bytes (a link's extension proves nothing).
pub fn sniff_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

fn agent() -> ureq::Agent {
    // No redirects: a link must not be able to lead somewhere that was not checked.
    ureq::AgentBuilder::new().timeout(Duration::from_secs(15)).redirects(0).user_agent("GameHub").build()
}

fn api_get(agent: &ureq::Agent, key: &str, url: &str) -> Result<String, String> {
    match agent.get(url).set("Authorization", &format!("Bearer {}", key)).call() {
        Ok(response) => response.into_string().map_err(|e| format!("net|{}", e)),
        Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => Err("sgdb_key|".into()),
        Err(ureq::Error::Status(429, _)) => Err("sgdb_busy|".into()),
        Err(ureq::Error::Status(code, _)) => Err(format!("sgdb_http|{}", code)),
        Err(error) => Err(format!("net|{}", error)),
    }
}

fn download(agent: &ureq::Agent, url: &str) -> Result<Vec<u8>, String> {
    let response = match agent.get(url).call() {
        Ok(r) => r,
        Err(ureq::Error::Status(code, _)) => return Err(format!("sgdb_http|{}", code)),
        Err(error) => return Err(format!("net|{}", error)),
    };
    let mut bytes = Vec::new();
    response.into_reader().take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|e| format!("net|{}", e))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("image_too_big|8".into());
    }
    Ok(bytes)
}

/// Looks the game up, downloads the best box art and stores it as the game's cover.
/// Returns the new file name inside `Covers`.
pub fn fetch_cover(store: &Store, key: &str, console_id: &str, rel_path: &str, title: &str, shape: &str) -> Result<String, String> {
    if key.is_empty() {
        return Err("sgdb_nokey|".into());
    }
    let term = search_term(title);
    if term.is_empty() {
        return Err(format!("sgdb_notfound|{}", title));
    }
    let agent = agent();
    let found = api_get(&agent, key, &format!("{}/search/autocomplete/{}", API, encode_path(&term)))?;
    let id = first_game_id(&found).ok_or_else(|| format!("sgdb_notfound|{}", title))?;
    let filters = "types=static&nsfw=false&humor=false";
    let mut grids = api_get(&agent, key, &format!("{}/grids/game/{}?dimensions={}&{}", API, id, dimensions(shape), filters))?;
    let mut url = first_grid_url(&grids);
    if url.is_none() {
        // Nothing in the preferred sizes: take whatever the community uploaded.
        grids = api_get(&agent, key, &format!("{}/grids/game/{}?{}", API, id, filters))?;
        url = first_grid_url(&grids);
    }
    let url = url.ok_or_else(|| format!("sgdb_notfound|{}", title))?;
    let bytes = download(&agent, &url)?;
    let ext = sniff_extension(&bytes).ok_or("image_type|unknown")?;
    store_cover_bytes(store, console_id, rel_path, ext, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_are_url_safe() {
        assert_eq!(encode_path("Ratchet & Clank/2"), "Ratchet%20%26%20Clank%2F2");
        assert_eq!(search_term("Crimson_Harbor.v2  "), "Crimson Harbor v2");
        assert_eq!(encode_path("Pokémon"), "Pok%C3%A9mon");
    }

    #[test]
    fn only_steamgriddb_links_are_followed() {
        assert!(allowed_url("https://cdn2.steamgriddb.com/grid/abc.png"));
        assert!(allowed_url("https://steamgriddb.com/x.png"));
        assert!(!allowed_url("http://cdn2.steamgriddb.com/grid/abc.png"));
        assert!(!allowed_url("https://steamgriddb.com.evil.test/x.png"));
        assert!(!allowed_url("https://evil.test/steamgriddb.com/x.png"));
        assert!(!allowed_url("https://cdn2.steamgriddb.com@evil.test/x.png"));
        assert!(!allowed_url("https://127.0.0.1:8080/x.png"));
    }

    #[test]
    fn answers_are_read() {
        assert_eq!(first_game_id(r#"{"success":true,"data":[{"id":5254,"name":"X"},{"id":9}]}"#), Some(5254));
        assert_eq!(first_game_id(r#"{"success":true,"data":[]}"#), None);
        assert_eq!(first_game_id("not json"), None);
        let grids = r#"{"data":[{"url":"https://evil.test/a.png"},{"url":"https://cdn2.steamgriddb.com/grid/b.png"}]}"#;
        assert_eq!(first_grid_url(grids).as_deref(), Some("https://cdn2.steamgriddb.com/grid/b.png"));
        assert_eq!(first_grid_url(r#"{"data":[{"url":"https://evil.test/a.png"}]}"#), None);
    }

    #[test]
    fn images_are_recognised_by_content() {
        assert_eq!(sniff_extension(&[0x89, b'P', b'N', b'G', 0, 0]), Some("png"));
        assert_eq!(sniff_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("jpg"));
        assert_eq!(sniff_extension(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        assert_eq!(sniff_extension(b"<html>"), None);
        assert_eq!(sniff_extension(b"MZ\x90\0"), None);
    }

    #[test]
    fn square_media_ask_for_square_art() {
        assert!(dimensions("square").contains("512x512"));
        assert!(dimensions("dvd").contains("600x900"));
    }
}
