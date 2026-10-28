// Demo backend used when the UI runs in a normal browser (npm run dev).
// It mimics src-tauri so the whole interface can be developed and tested without Rust.

import type { Console, Game, LaunchOutcome, Preset, ScanResult, Settings, Stats } from './types.js';

const STORAGE_KEY = 'gamehub-demo-v1';
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

const PRESETS: Preset[] = [
  { id: 'ps1', title: 'PlayStation', emulator: 'DuckStation', extensions: ['cue', 'chd', 'pbp', 'iso', 'm3u', 'bin'], args: '-batch -fullscreen -- {rom}', exeHints: ['duckstation'] },
  { id: 'ps2', title: 'PlayStation 2', emulator: 'PCSX2', extensions: ['iso', 'chd', 'cso', 'zso', 'gz', 'bin'], args: '-batch -fullscreen -- {rom}', exeHints: ['pcsx2'] },
  { id: 'ps3', title: 'PlayStation 3', emulator: 'RPCS3', extensions: ['iso'], args: '--no-gui {rom}', exeHints: ['rpcs3'] },
  { id: 'psp', title: 'PSP', emulator: 'PPSSPP', extensions: ['iso', 'cso', 'chd', 'pbp'], args: '--fullscreen {rom}', exeHints: ['ppsspp'] },
  { id: 'gamecube', title: 'GameCube', emulator: 'Dolphin', extensions: ['iso', 'gcm', 'rvz', 'ciso', 'gcz'], args: '-b -e {rom}', exeHints: ['dolphin'] },
  { id: 'wii', title: 'Wii', emulator: 'Dolphin', extensions: ['iso', 'wbfs', 'rvz', 'wad', 'ciso', 'gcz'], args: '-b -e {rom}', exeHints: ['dolphin'] },
  { id: 'xbox360', title: 'Xbox 360', emulator: 'Xenia', extensions: ['iso', 'xex', 'zar'], args: '{rom}', exeHints: ['xenia'] },
  { id: 'n64', title: 'Nintendo 64', emulator: 'simple64 / Project64', extensions: ['z64', 'n64', 'v64'], args: '{rom}', exeHints: ['simple64', 'project64'] },
  { id: 'nds', title: 'Nintendo DS', emulator: 'melonDS', extensions: ['nds', 'dsi'], args: '{rom}', exeHints: ['melonds'] },
  { id: 'gba', title: 'Game Boy Advance', emulator: 'mGBA', extensions: ['gba', 'gb', 'gbc', 'zip'], args: '-f {rom}', exeHints: ['mgba'] },
  { id: 'snes', title: 'Super Nintendo', emulator: 'Snes9x', extensions: ['sfc', 'smc', 'zip'], args: '{rom}', exeHints: ['snes9x'] },
];

// Invented titles only: the demo ships no real game names or artwork.
const TITLES = [
  'Neon Drift Racers', 'Skyward Blade', 'Echoes of Hollow Pine', 'Crimson Harbor', 'Orbit Breakers',
  'Midnight Courier', 'Paper Kingdoms', 'Steel Garden (Europe)', 'Lantern Run', 'Velvet Static (USA)',
  'Tidal Archive', 'Copper Saints', 'Glass Meridian', 'Ember & Ash', 'Hollow Signal (Japan)', 'Starlit Foundry',
];

interface DemoState {
  settings: Settings;
  stats: Stats;
  covers: Record<string, string>;
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function seedConsole(preset: string, title: string, image: string | null): Console {
  const p = PRESETS.find((x) => x.id === preset)!;
  return {
    id: preset,
    title,
    preset,
    emulatorPath: `C:\\Emulators\\${p.emulator.split(' ')[0]}\\${p.emulator.split(' ')[0].toLowerCase()}.exe`,
    romPath: `C:\\Games\\${title.replace(/\s/g, '')}`,
    args: p.args,
    extensions: p.extensions,
    image,
  };
}

function seed(): DemoState {
  const empty = params.has('empty');
  const consoles = empty
    ? []
    : [seedConsole('ps2', 'PlayStation 2', null), seedConsole('psp', 'PSP', null), seedConsole('wii', 'Wii', null)];
  const settings: Settings = {
    version: 2,
    onboarded: !empty,
    tutorialSeen: !empty,
    profile: { username: 'Alex', avatar: 'mock:200:1', banner: 'mock:210:1' },
    ui: { language: params.get('lang') === 'en' ? 'en' : params.get('lang') === 'fr' ? 'fr' : 'auto', theme: (params.get('theme') as Settings['ui']['theme']) || 'ocean', clock24: true, sound: false, volume: 0.6, scanlines: true, reduceMotion: false, fullscreen: false, accent: /^#[0-9a-f]{6}$/i.test(params.get('accent') ?? '') ? params.get('accent')! : '' },
    consoles,
  };
  const stats: Stats = { totalSeconds: 0, totalSessions: 0, games: {} };
  if (!empty) {
    const now = Math.floor(Date.now() / 1000);
    const plays: [string, number, number, number][] = [
      ['ps2/Crimson Harbor.iso', 41520, 14, now - 3600 * 5],
      ['ps2/Orbit Breakers.iso', 22800, 9, now - 86400 * 2],
      ['ps2/Tidal Archive.iso', 1800, 2, now - 86400 * 20],
      ['ps2/Glass Meridian.iso', 5200, 4, now - 86400 * 9],
      ['psp/Lantern Run.iso', 9300, 6, now - 86400 * 6],
      ['wii/Paper Kingdoms.wbfs', 4100, 3, now - 86400 * 12],
    ];
    for (const [key, seconds, launches, lastPlayed] of plays) {
      stats.games[key] = { seconds, launches, lastPlayed };
      stats.totalSeconds += seconds;
      stats.totalSessions += launches;
    }
  }
  return { settings, stats, covers: {} };
}

let state: DemoState = load();

function load(): DemoState {
  if (!params.has('fresh')) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && !params.has('empty')) return JSON.parse(raw) as DemoState;
    } catch {
      /* storage can be unavailable */
    }
  }
  return seed();
}

function persist(): void {
  try {
    if (!params.has('empty')) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function gamesFor(console: Console): Game[] {
  if (!console.romPath) return [];
  const count = console.id === 'ps2' ? 12 : console.id === 'psp' ? 8 : console.id === 'wii' ? 7 : 5 + (hash(console.id) % 4);
  const ext = console.extensions[0] ?? 'iso';
  const start = hash(console.id) % TITLES.length;
  const games: Game[] = [];
  for (let i = 0; i < count; i++) {
    const raw = TITLES[(start + i) % TITLES.length];
    const rel = `${raw}.${ext}`;
    const key = `${console.id}/${rel}`;
    const tag = /\((\w+)\)/.exec(raw)?.[1];
    const region = tag === 'Europe' ? 'EU' : tag === 'USA' ? 'US' : tag === 'Japan' ? 'JP' : null;
    const hue = hash(rel) % 360;
    games.push({
      consoleId: console.id,
      consoleTitle: console.title,
      relPath: rel,
      fileName: rel,
      key,
      title: raw.replace(/\s*\(.*\)/, ''),
      region,
      size: 700_000_000 + (hash(rel) % 3_000_000_000),
      cover: state.covers[key] ?? (i % 4 === 3 ? null : `mock:${hue}:${hash(rel) % 4}`),
    });
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockPick(kind: 'image' | 'folder' | 'file'): Promise<string | null> {
  await delay(120);
  if (kind === 'image') return `mock:${Math.floor(Math.random() * 360)}:${Math.floor(Math.random() * 4)}`;
  if (kind === 'folder') return 'C:\\Games\\Demo ROMs';
  return 'C:\\Emulators\\Demo\\demo-emulator.exe';
}

export async function mockInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await delay(30);
  switch (cmd) {
    case 'get_app_info':
      return { version: '0.2.0-demo', dataDir: 'C:\\Users\\you\\AppData\\Local\\com.gamehub.app\\GameHub_Data', os: 'demo' };
    case 'get_settings':
      return state.settings;
    case 'save_settings': {
      const incoming = args.settings as Settings;
      const seen = new Set<string>();
      incoming.consoles = incoming.consoles.map((c) => {
        let id = (c.id || c.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'console';
        const base = id;
        for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
        seen.add(id);
        return { ...c, id };
      });
      state.settings = incoming;
      persist();
      return state.settings;
    }
    case 'get_stats':
      return state.stats;
    case 'import_legacy':
      return null;
    case 'list_presets':
      return PRESETS;
    case 'guess_args': {
      const name = String(args.emulatorPath ?? '').split(/[\\/]/).pop()!.toLowerCase();
      return PRESETS.find((p) => p.exeHints.some((h) => name.includes(h)))?.args ?? null;
    }
    case 'scan_library': {
      const result: ScanResult = { games: [], errors: [] };
      for (const c of state.settings.consoles) result.games.push(...gamesFor(c));
      return result;
    }
    case 'set_game_cover': {
      const name = String(args.sourcePath);
      state.covers[`${args.consoleId}/${args.relPath}`] = name;
      persist();
      return name;
    }
    case 'clear_game_cover':
      state.covers[`${args.consoleId}/${args.relPath}`] = '';
      persist();
      return null;
    case 'set_image':
      return String(args.sourcePath);
    case 'launch_game': {
      await delay(5600);
      const key = `${args.consoleId}/${args.relPath}`;
      const seconds = 600;
      const entry = (state.stats.games[key] ??= { seconds: 0, launches: 0, lastPlayed: 0 });
      entry.seconds += seconds;
      entry.launches += 1;
      entry.lastPlayed = Math.floor(Date.now() / 1000);
      state.stats.totalSeconds += seconds;
      state.stats.totalSessions += 1;
      persist();
      const outcome: LaunchOutcome = { seconds, exitCode: 0, failedEarly: false, counted: true };
      return outcome;
    }
    case 'set_fullscreen':
    case 'open_data_dir':
    case 'quit_app':
      return null;
    case 'is_fullscreen':
      return false;
    default:
      throw new Error(`unknown_command|${cmd}`);
  }
}
