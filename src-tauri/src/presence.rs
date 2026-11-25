//! Discord Rich Presence: shows "Playing GameHub" with the current game on the player's Discord profile.
//!
//! Everything goes through the Discord app running on the same computer. Nothing is sent
//! anywhere else, and nothing happens when Discord is closed or when no application ID is set.

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::mpsc;

/// Application ID from https://discord.com/developers/applications (it is public, not a secret).
/// Its name is what Discord shows after "Playing", and its icon is the large picture.
pub const APP_ID: &str = "1575082869339193414";

#[derive(Clone, Debug, PartialEq)]
pub enum Status {
    /// Nothing is shared.
    Off,
    /// GameHub is open, no game is running.
    Browsing { version: String, since: i64 },
    /// A game is running.
    Playing { title: String, console: String, since: i64 },
}

/// Updates are handled by one background thread, in order, so a slow or missing Discord never freezes the app.
pub struct Presence {
    tx: mpsc::Sender<Status>,
}

impl Presence {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || worker(rx));
        Presence { tx }
    }

    pub fn set(&self, status: Status) {
        let _ = self.tx.send(status);
    }
}

fn worker(rx: mpsc::Receiver<Status>) {
    let mut client: Option<DiscordIpcClient> = None;
    while let Ok(mut status) = rx.recv() {
        // Only the latest state matters.
        while let Ok(next) = rx.try_recv() {
            status = next;
        }
        apply(&mut client, &status);
    }
}

/// Problems are only printed by development builds (`npm run tauri dev`), never shown to players.
fn debug(message: &str) {
    if cfg!(debug_assertions) {
        eprintln!("[discord] {}", message);
    }
}

fn connect() -> Option<DiscordIpcClient> {
    if APP_ID.is_empty() {
        debug("no application ID set in presence.rs");
        return None;
    }
    let mut client = DiscordIpcClient::new(APP_ID);
    match client.connect() {
        Ok(()) => {
            debug("connected to Discord");
            Some(client)
        }
        Err(error) => {
            debug(&format!("cannot connect to Discord (is the app open?): {}", error));
            None
        }
    }
}

fn apply(client: &mut Option<DiscordIpcClient>, status: &Status) {
    if *status == Status::Off {
        if let Some(mut c) = client.take() {
            let _ = c.clear_activity();
            let _ = c.close();
        }
        return;
    }
    // A second try covers a Discord that was restarted since the last update.
    for _ in 0..2 {
        if client.is_none() {
            match connect() {
                Some(c) => *client = Some(c),
                None => return,
            }
        }
        if let Some(c) = client.as_mut() {
            match c.set_activity(build(status)) {
                Ok(()) => {
                    debug(&format!("status sent: {:?}", status));
                    return;
                }
                Err(error) => debug(&format!("Discord refused the status: {}", error)),
            }
        }
        *client = None;
    }
}

fn build(status: &Status) -> activity::Activity<'_> {
    match status {
        Status::Playing { title, console, since } => activity::Activity::new()
            .details(title.as_str())
            .state(console.as_str())
            .timestamps(activity::Timestamps::new().start(*since)),
        Status::Browsing { version, since } => activity::Activity::new().details(version.as_str()).timestamps(activity::Timestamps::new().start(*since)),
        Status::Off => activity::Activity::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_never_block_or_panic_even_without_discord() {
        let presence = Presence::new();
        presence.set(Status::Browsing { version: "GameHub v0.4.1".into(), since: 1 });
        presence.set(Status::Playing { title: "Game".into(), console: "PS2".into(), since: 2 });
        presence.set(Status::Off);
    }
}
