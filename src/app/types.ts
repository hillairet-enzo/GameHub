// Shapes exchanged with the Rust backend (see src-tauri/src/model.rs).

export type ThemeId = 'ocean' | 'matrix' | 'cyberpunk' | 'midnight' | 'sunset' | 'rose' | 'violet' | 'lagoon' | 'gold' | 'custom';
export type LanguagePref = 'auto' | 'fr' | 'en';

export interface Profile {
  username: string;
  avatar: string | null;
  banner: string | null;
}

export interface UiPrefs {
  language: LanguagePref;
  theme: ThemeId;
  clock24: boolean;
  sound: boolean;
  volume: number;
  scanlines: boolean;
  reduceMotion: boolean;
  fullscreen: boolean;
  /** Colour of the "custom" theme, as `#rrggbb`. */
  accent: string;
  /** Wallpaper: file name inside the Images folder. */
  wallpaper: string | null;
  /** How much the wallpaper is darkened, 0 to 90. */
  wallpaperDim: number;
  steamgriddbKey: string;
  autoUpdate: boolean;
}

export interface Console {
  id: string;
  title: string;
  preset: string | null;
  emulatorPath: string;
  romPath: string;
  args: string;
  extensions: string[];
  image: string | null;
  /** Shape of the covers; empty means the usual one for this console. */
  coverShape: string;
}

export interface Settings {
  version: number;
  /** True once the first-launch tutorial has been shown. */
  tutorialSeen: boolean;
  profile: Profile;
  ui: UiPrefs;
  consoles: Console[];
}

export interface Game {
  consoleId: string;
  consoleTitle: string;
  relPath: string;
  fileName: string;
  key: string;
  title: string;
  region: string | null;
  size: number;
  cover: string | null;
}

export interface GameStat {
  seconds: number;
  launches: number;
  lastPlayed: number;
}

export interface Stats {
  totalSeconds: number;
  totalSessions: number;
  games: Record<string, GameStat>;
}

export interface LaunchOutcome {
  seconds: number;
  exitCode: number | null;
  failedEarly: boolean;
  counted: boolean;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  os: string;
}

export interface Preset {
  id: string;
  title: string;
  emulator: string;
  extensions: string[];
  args: string;
  exeHints: string[];
  /** Usual cover shape of this console. */
  shape: string;
  /** The games are programs that run by themselves (PC): no emulator needed. */
  native: boolean;
}

export interface ScanResult {
  games: Game[];
  errors: { consoleId: string; error: string }[];
}

export interface LegacyImport {
  username: string | null;
  totalSeconds: number;
  totalSessions: number;
}

export interface UpdateInfo {
  version: string;
  notes: string;
}
