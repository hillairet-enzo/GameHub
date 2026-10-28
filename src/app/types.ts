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
}

export interface Settings {
  version: number;
  onboarded: boolean;
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
