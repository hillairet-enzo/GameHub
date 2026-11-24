# GameHub

A console-style home screen for your emulators. Add your consoles once, and GameHub gives you a clean, gamepad-friendly library that starts the right emulator with the right game.

[Lire en français](README.fr.md)

## Features

- **One home screen for every console.** Each console keeps its own emulator, game folder and launch options.
- **Templates for popular emulators.** PlayStation 1/2/3, PSP, GameCube, Wii, Xbox 360, Nintendo 64/DS, Game Boy Advance and Super Nintendo come with sensible file types and launch options.
- **Your library builds itself.** GameHub scans your game folders, cleans up titles, hides the `.bin` files that belong to a `.cue` sheet and keeps multi-disc games apart.
- **Made for a gamepad and a keyboard.** Navigate everything with a controller, the keyboard or the mouse. The hints at the bottom switch to the device you use.
- **Covers, profile, stats.** Add your own cover art, a profile picture and banner, and see how long you play.
- **Ten themes, your own color, two languages.** Ocean, Matrix, Cyberpunk, Midnight, Sunset, Rose, Violet, Lagoon, Gold, or pick any color you like. English and French, picked from your system by default.
- **A tutorial when you start.** A short illustrated guide appears on first launch and can be replayed any time from **Settings → Tutorial**.
- **Safe by design.** The interface never sends a program path to the backend: it only asks to start "this game of this console". The emulator and its arguments always come from your saved settings, and game paths cannot leave the console folder.
- **Portable data.** Settings, covers and stats live in one folder you can copy to back up.

## Install

### From a release

Download the installer for your system from the [Releases](../../releases) page:

| System | File to download |
| --- | --- |
| Windows | the `.exe` (or `.msi`) installer |
| macOS 12 or newer | the `.dmg` file (works on Apple Silicon and Intel Macs) |

GameHub does not include any game, BIOS or emulator. Install the emulators you want to use first, then add them in GameHub.

#### Installing on a Mac

1. Download the `.dmg` file from [Releases](../../releases) and open it.
2. Drag **GameHub** onto the **Applications** folder.
3. The app is not signed by Apple, so macOS blocks it the first time. **Right-click** GameHub in Applications, choose **Open**, then confirm **Open** in the dialog. You only have to do this once.
4. If macOS says the app is *damaged* or cannot be opened, open **Terminal** and run the line below, then try again:
   ```bash
   xattr -cr /Applications/GameHub.app
   ```
5. Install an emulator for Mac (for example Dolphin, PCSX2, PPSSPP, mGBA or melonDS). In GameHub, when asked for the emulator, pick its `.app` file, usually in **Applications**.

Good to know on macOS:
- Full screen: use the green button of the window or <kbd>Ctrl</kbd> + <kbd>Cmd</kbd> + <kbd>F</kbd> (<kbd>F11</kbd> is reserved by the system).
- Your data is in `~/Library/Application Support/com.gamehub.app/GameHub_Data`.
- The Mac version is new and has had little testing. If something does not work, please open an issue and describe what you see.

### From source

You need [Node.js 22.12 or newer](https://nodejs.org), [Rust](https://rustup.rs) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system (on a Mac: the Xcode command line tools, installed with `xcode-select --install`). Windows is the main target and macOS is supported.

```bash
npm install
npm run tauri dev      # run the desktop app
npm run tauri build    # build an installer
```

`npm run dev` alone starts the interface in a normal browser with a demo backend and invented games. It is the fastest way to work on the design.

## First steps

1. Open GameHub and choose **Add a console**.
2. Tap your console in the grid (or **Other** to name your own).
3. Choose the emulator program and the folder that holds your games. Both are optional and can be set later in **Settings → Consoles**, where you can also change the launch options, file types and picture.
4. Press **Add**. Your games appear in the library.
5. Select a game and press <kbd>Enter</kbd> (or **A** on a controller). GameHub shows a launch screen for a few seconds, then steps aside for the emulator and comes back when you quit it.

### Launch options

The launch options are the arguments passed to the emulator. Write `{rom}` where the game file should go:

```text
-batch -fullscreen -- {rom}
```

If `{rom}` is missing, the game path is added at the end. Quotes keep arguments that contain spaces together.

## Controls

| Action | Keyboard | Controller |
| --- | --- | --- |
| Move | Arrow keys or WASD | D-pad or left stick |
| Confirm | Enter | A |
| Back | Esc | B |
| Change cover / reset | X | X |
| Sort / resume last game | Y | Y |
| Previous / next console | Q / E | LB / RB |
| Settings | M | Start |
| Full screen | F11 or Alt+Enter (macOS: Ctrl+Cmd+F) | |

## Your data

Everything GameHub saves is in the `GameHub_Data` folder inside the application data folder of your system. On Windows that is `%LOCALAPPDATA%\com.gamehub.app\GameHub_Data`, on macOS `~/Library/Application Support/com.gamehub.app/GameHub_Data`. **Settings → About → Data folder** opens it.

| File or folder | Content |
| --- | --- |
| `settings.json` | Profile, appearance and consoles |
| `stats.json` | Play time and last played |
| `Covers/` | Cover images you added |
| `Images/` | Avatar, banner and console pictures |

If `settings.json` is ever damaged, GameHub keeps it as `settings.corrupt.json` and starts again from a clean file.

## Project layout

```text
src/
  app/            Interface (TypeScript): screens, input, dialogs, texts
  pages/          The single Astro page that hosts the app
  styles/         Design tokens, base, components and screens
src-tauri/src/
  library.rs      Folder scan and title cleanup
  launch.rs       Starting an emulator safely
  store.rs        Settings and stats files
  presets.rs      Console templates
  images.rs       Covers, avatar and banner
  migrate.rs      Import of data from earlier versions
```

Run the Rust tests with `cargo test --manifest-path src-tauri/Cargo.toml`.

## Sounds

The three menu sounds in `public/sounds` are royalty-free sounds. You can replace them with your own files (same names: `move.mp3`, `select.mp3`, `back.mp3`).

## License

[MIT](LICENSE). GameHub is not affiliated with any console maker or emulator project. Names of consoles and emulators belong to their owners and are used only to describe compatibility.

## Automatic updates (for maintainers)

GameHub checks GitHub for a newer release at start-up and installs it on request. The data folder is never touched, so players keep their consoles, covers and settings.

One-time setup:

1. Generate a signing key pair: `npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\gamehub.key"` (PowerShell; in `cmd` write `%USERPROFILE%` instead of `$env:USERPROFILE`) (choose a password). Keep the `.key` file private and backed up: without it, installed copies can no longer be updated.
2. Paste the **public** key (the `.key.pub` file content) into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
3. In the GitHub repository, add two secrets (Settings → Secrets and variables → Actions): `TAURI_SIGNING_PRIVATE_KEY` (content of the `.key` file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

To publish a version: raise `version` in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, push a tag such as `v0.3.0`, then **publish** the draft release. Never change the `identifier` (`com.gamehub.app`).
