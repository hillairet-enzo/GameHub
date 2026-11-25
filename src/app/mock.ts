// Demo backend used when the UI runs in a normal browser (npm run dev).
// It mimics src-tauri so the whole interface can be developed and tested without Rust.

import type { Console, Game, LaunchOutcome, Preset, ScanResult, Settings, Stats } from './types.js';

const STORAGE_KEY = 'gamehub-demo-v1';
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

const PRESETS: Preset[] = [
  { id: 'ps1', title: 'PlayStation', emulator: 'DuckStation', extensions: ['cue', 'chd', 'pbp', 'iso', 'm3u', 'bin'], args: '-batch -fullscreen -- {rom}', exeHints: ['duckstation'], shape: 'square', native: false },
  { id: 'ps2', title: 'PlayStation 2', emulator: 'PCSX2', extensions: ['iso', 'chd', 'cso', 'zso', 'gz', 'bin'], args: '-batch -fullscreen -- {rom}', exeHints: ['pcsx2'], shape: 'dvd', native: false },
  { id: 'ps3', title: 'PlayStation 3', emulator: 'RPCS3', extensions: ['iso'], args: '--no-gui {rom}', exeHints: ['rpcs3'], shape: 'bluray', native: false },
  { id: 'ps4', title: 'PlayStation 4', emulator: 'shadPS4', extensions: ['bin', 'pkg'], args: '-g {rom}', exeHints: ['shadps4'], shape: 'bluray', native: false },
  { id: 'psp', title: 'PSP', emulator: 'PPSSPP', extensions: ['iso', 'cso', 'chd', 'pbp'], args: '--fullscreen {rom}', exeHints: ['ppsspp'], shape: 'tall', native: false },
  { id: 'gamecube', title: 'GameCube', emulator: 'Dolphin', extensions: ['iso', 'gcm', 'rvz', 'ciso', 'gcz'], args: '-b -e {rom}', exeHints: ['dolphin'], shape: 'dvd', native: false },
  { id: 'wii', title: 'Wii', emulator: 'Dolphin', extensions: ['iso', 'wbfs', 'rvz', 'wad', 'ciso', 'gcz'], args: '-b -e {rom}', exeHints: ['dolphin'], shape: 'dvd', native: false },
  { id: 'wiiu', title: 'Wii U', emulator: 'Cemu', extensions: ['wua', 'wud', 'wux', 'rpx', 'wad'], args: '-f -g {rom}', exeHints: ['cemu'], shape: 'bluray', native: false },
  { id: 'switch', title: 'Nintendo Switch', emulator: 'Eden / Ryujinx', extensions: ['nsp', 'xci', 'nsz', 'xcz'], args: '-f -g {rom}', exeHints: ['eden', 'yuzu', 'citron', 'ryujinx'], shape: 'tall', native: false },
  { id: 'switch2', title: 'Nintendo Switch 2', emulator: 'Switch 2', extensions: ['nsp', 'xci', 'nsz', 'xcz'], args: '{rom}', exeHints: [], shape: 'tall', native: false },
  { id: '3ds', title: 'Nintendo 3DS', emulator: 'Azahar / Citra', extensions: ['3ds', 'cci', 'cxi', 'cia', '3dsx'], args: '-f {rom}', exeHints: ['azahar', 'citra'], shape: 'small', native: false },
  { id: 'nds', title: 'Nintendo DS', emulator: 'melonDS', extensions: ['nds', 'dsi'], args: '{rom}', exeHints: ['melonds'], shape: 'small', native: false },
  { id: 'xbox', title: 'Xbox', emulator: 'xemu', extensions: ['iso', 'xiso'], args: '-dvd_path {rom}', exeHints: ['xemu'], shape: 'dvd', native: false },
  { id: 'xbox360', title: 'Xbox 360', emulator: 'Xenia', extensions: ['iso', 'xex', 'zar'], args: '{rom}', exeHints: ['xenia'], shape: 'dvd', native: false },
  { id: 'n64', title: 'Nintendo 64', emulator: 'simple64 / Project64', extensions: ['z64', 'n64', 'v64'], args: '{rom}', exeHints: ['simple64', 'project64'], shape: 'wide', native: false },
  { id: 'gba', title: 'Game Boy Advance', emulator: 'mGBA', extensions: ['gba', 'gb', 'gbc', 'zip'], args: '-f {rom}', exeHints: ['mgba'], shape: 'square', native: false },
  { id: 'snes', title: 'Super Nintendo', emulator: 'Snes9x', extensions: ['sfc', 'smc', 'zip'], args: '{rom}', exeHints: ['snes9x'], shape: 'wide', native: false },
  { id: 'pc', title: 'PC', emulator: '', extensions: ['exe', 'lnk', 'bat'], args: '{rom}', exeHints: [], shape: 'poster', native: true },
];

const OTHER: Preset = { id: 'other', title: '', emulator: '', extensions: ['iso', 'bin', 'cue', 'chd', 'zip', '7z', 'rom'], args: '{rom}', exeHints: [], shape: 'dvd', native: false };

// Name -> console, like presets::match_name in Rust (simplified).
const ALIASES: Record<string, string[]> = {
  ps1: ['ps1', 'psx', 'psone', 'playstation', 'playstation1'], ps2: ['ps2', 'playstation2'], ps3: ['ps3', 'playstation3'], ps4: ['ps4', 'playstation4'],
  psp: ['psp'], gamecube: ['gamecube', 'gc', 'ngc'], wii: ['wii'], wiiu: ['wiiu'], switch: ['switch', 'switch1', 'nsw', 'nintendoswitch'], switch2: ['switch2', 'ns2', 'nintendoswitch2'],
  '3ds': ['3ds', 'n3ds'], nds: ['nds', 'ds', 'nintendods'], xbox: ['xbox', 'originalxbox'], xbox360: ['xbox360', '360'], n64: ['n64', 'nintendo64'],
  gba: ['gba', 'gameboyadvance'], snes: ['snes', 'supernintendo', 'superfamicom'], pc: ['pc', 'exe', 'windows', 'win', 'steam', 'jeuxpc', 'jeuxexe', 'pcgames', 'epic', 'gog'],
};

function matchConsole(name: string): Preset {
  const q = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let best: [string, number] | null = null;
  for (const [id, list] of Object.entries(ALIASES)) {
    for (const a of list) if (q === a || (a.length >= 4 && q.includes(a))) if (!best || a.length > best[1]) best = [id, a.length];
  }
  return PRESETS.find((p) => p.id === best?.[0]) ?? OTHER;
}

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
    coverShape: '',
  };
}

function seed(): DemoState {
  const empty = params.has('empty');
  const consoles = empty
    ? []
    : [seedConsole('ps2', 'PlayStation 2', null), seedConsole('psp', 'PSP', null), seedConsole('wii', 'Wii', null)];
  const settings: Settings = {
    version: 2,
    tutorialSeen: !empty,
    profile: { username: 'Alex', avatar: 'mock:200:1', banner: 'mock:210:1' },
    ui: { language: params.get('lang') === 'en' ? 'en' : params.get('lang') === 'fr' ? 'fr' : 'auto', theme: (params.get('theme') as Settings['ui']['theme']) || 'ocean', clock24: true, sound: false, volume: 0.6, scanlines: true, reduceMotion: false, fullscreen: false, autoUpdate: true, discordPresence: true, steamgriddbKey: params.has('key') ? 'demo1234' : '', wallpaper: params.has('wallpaper') ? 'mock:300:1' : null, wallpaperDim: 45, accent: /^#[0-9a-f]{6}$/i.test(params.get('accent') ?? '') ? params.get('accent')! : '' },
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
      return { version: '0.2.1-demo', dataDir: 'C:\\Users\\you\\AppData\\Local\\com.gamehub.app\\GameHub_Data', os: 'demo' };
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
    case 'match_console':
      return matchConsole(String(args.name ?? ''));
    case 'guess_args': {
      const name = String(args.emulatorPath ?? '').split(/[\\/]/).pop()!.toLowerCase();
      return PRESETS.find((p) => p.exeHints.some((h) => name.includes(h)))?.args ?? null;
    }
    case 'scan_library': {
      const result: ScanResult = { games: [], errors: [] };
      for (const c of state.settings.consoles) result.games.push(...gamesFor(c));
      return result;
    }
    case 'fetch_game_cover': {
      if (!state.settings.ui.steamgriddbKey) throw new Error('sgdb_nokey|');
      await delay(400);
      const name = `mock:${hash(String(args.title)) % 360}:${1 + (hash(String(args.relPath)) % 3)}`;
      state.covers[`${args.consoleId}/${args.relPath}`] = name;
      persist();
      return name;
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
    case 'check_update':
      await delay(500);
      return params.has('update') ? { version: '0.3.0', notes: '' } : null;
    case 'install_update':
      await delay(1500);
      return null;
    case 'open_url':
      window.open(String(args.url), '_blank');
      return null;
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
