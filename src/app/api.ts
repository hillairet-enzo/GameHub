// Single entry point to the backend. Inside the desktop app the calls go to Rust;
// in a plain browser (npm run dev) they go to a small in-memory demo backend.

import { isMockName, mockArt } from './mockart.js';
import type { AppInfo, LaunchOutcome, LegacyImport, Preset, ScanResult, Settings, Stats, UpdateInfo } from './types.js';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Backend errors look like `code|detail`. */
export class AppError extends Error {
  code: string;
  detail: string;
  constructor(raw: unknown) {
    const text = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw);
    const [code, ...rest] = text.split('|');
    super(text);
    this.code = rest.length ? code : 'unknown';
    this.detail = rest.length ? rest.join('|') : text;
  }
}

type Convert = (path: string) => string;
let convertFileSrc: Convert | null = null;
let dataDir = '';

export async function initApi(): Promise<void> {
  if (isTauri) {
    const core = await import('@tauri-apps/api/core');
    convertFileSrc = core.convertFileSrc;
  }
}

export function setDataDir(dir: string): void {
  dataDir = dir.replace(/\\/g, '/').replace(/\/$/, '');
}

/** URL of an image stored by the backend, or null when there is none. */
export function assetUrl(folder: 'Covers' | 'Images', name: string | null | undefined): string | null {
  if (!name) return null;
  if (isMockName(name)) return mockArt(name);
  if (!convertFileSrc) return null;
  return convertFileSrc(`${dataDir}/${folder}/${name}`);
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(cmd, args);
    }
    const { mockInvoke } = await import('./mock.js');
    return (await mockInvoke(cmd, args)) as T;
  } catch (error) {
    throw new AppError(error);
  }
}

export const api = {
  appInfo: () => call<AppInfo>('get_app_info'),
  getSettings: () => call<Settings>('get_settings'),
  saveSettings: (settings: Settings) => call<Settings>('save_settings', { settings }),
  getStats: () => call<Stats>('get_stats'),
  importLegacy: (legacy: LegacyImport) => call<void>('import_legacy', { legacy }),
  presets: () => call<Preset[]>('list_presets'),
  fetchGameCover: (consoleId: string, relPath: string, title: string) => call<string>('fetch_game_cover', { consoleId, relPath, title }),
  matchConsole: (name: string) => call<Preset>('match_console', { name }),
  guessArgs: (emulatorPath: string) => call<string | null>('guess_args', { emulatorPath }),
  scan: () => call<ScanResult>('scan_library'),
  setGameCover: (consoleId: string, relPath: string, sourcePath: string) =>
    call<string>('set_game_cover', { consoleId, relPath, sourcePath }),
  clearGameCover: (consoleId: string, relPath: string) => call<void>('clear_game_cover', { consoleId, relPath }),
  setImage: (kind: 'avatar' | 'banner' | 'console' | 'wallpaper', owner: string, sourcePath: string) =>
    call<string>('set_image', { kind, owner, sourcePath }),
  launch: (consoleId: string, relPath: string) => call<LaunchOutcome>('launch_game', { consoleId, relPath }),
  setFullscreen: (enabled: boolean) => call<void>('set_fullscreen', { enabled }),
  isFullscreen: () => call<boolean>('is_fullscreen'),
  checkUpdate: () => call<UpdateInfo | null>('check_update'),
  installUpdate: () => call<void>('install_update'),
  openUrl: (url: string) => call<void>('open_url', { url }),
  openDataDir: () => call<void>('open_data_dir'),
  quit: () => call<void>('quit_app'),
};

// ---------- native pickers ----------

const IMAGE_FILTER = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }];

type PickKind = 'image' | 'folder' | 'file';

async function pick(kind: PickKind, title?: string, filters?: { name: string; extensions: string[] }[]) {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({ multiple: false, directory: kind === 'folder', title, filters });
    return typeof result === 'string' ? result : null;
  }
  const { mockPick } = await import('./mock.js');
  return mockPick(kind);
}

export const pickImage = (title?: string) => pick('image', title, IMAGE_FILTER);
export const pickFolder = (title?: string) => pick('folder', title);
export const pickExecutable = (title?: string) =>
  pick('file', title, navigator.userAgent.includes('Windows') ? [{ name: 'Executable', extensions: ['exe', 'bat', 'cmd'] }] : undefined);

/** Last path segment, for both `/` and `\` separators. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
