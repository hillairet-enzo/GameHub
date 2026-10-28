// Shared application state: settings, stats and the scanned library.

import { api, initApi, isTauri, setDataDir } from './api.js';
import { configureAudio } from './audio.js';
import { accentOf, applyAccent } from './color.js';
import { setLanguage } from './i18n.js';
import type { AppInfo, Console, Game, Preset, Settings, Stats } from './types.js';

type Topic = 'settings' | 'stats' | 'library';

export const store = {
  ready: false,
  scanning: false,
  settings: null as unknown as Settings,
  stats: { totalSeconds: 0, totalSessions: 0, games: {} } as Stats,
  games: [] as Game[],
  scanErrors: {} as Record<string, string>,
  info: null as unknown as AppInfo,
  presets: [] as Preset[],
};

const listeners: Record<Topic, Set<() => void>> = { settings: new Set(), stats: new Set(), library: new Set() };

export function on(topic: Topic, listener: () => void): () => void {
  listeners[topic].add(listener);
  return () => listeners[topic].delete(listener);
}

function emit(topic: Topic): void {
  listeners[topic].forEach((fn) => fn());
}

export function applyPrefs(): void {
  const ui = store.settings.ui;
  const root = document.documentElement;
  root.dataset.theme = ui.theme;
  root.dataset.motion = ui.reduceMotion ? 'reduced' : 'full';
  root.dataset.scanlines = ui.scanlines ? 'on' : 'off';
  applyAccent(root, accentOf(ui.theme, ui.accent));
  setLanguage(ui.language);
  configureAudio(ui.sound, ui.volume);
}

/** Data written by the first versions of GameHub in the web view storage. */
async function importLegacyBrowserData(): Promise<void> {
  if (!isTauri) return;
  try {
    if (localStorage.getItem('gh-legacy-imported')) return;
    const username = localStorage.getItem('userName');
    const totalSeconds = parseInt(localStorage.getItem('globalPlaytime') ?? '0', 10) || 0;
    const totalSessions = parseInt(localStorage.getItem('totalSessions') ?? '0', 10) || 0;
    if (username || totalSeconds || totalSessions) {
      await api.importLegacy({ username, totalSeconds, totalSessions });
      store.settings = await api.getSettings();
      store.stats = await api.getStats();
    }
    localStorage.setItem('gh-legacy-imported', '1');
  } catch {
    /* nothing to import */
  }
}

export async function bootstrap(): Promise<void> {
  await initApi();
  const [info, settings, stats, presets] = await Promise.all([api.appInfo(), api.getSettings(), api.getStats(), api.presets()]);
  store.info = info;
  setDataDir(info.dataDir);
  store.settings = settings;
  store.stats = stats;
  store.presets = presets;
  await importLegacyBrowserData();
  applyPrefs();
  await refreshLibrary();
  store.ready = true;
}

export async function refreshLibrary(): Promise<void> {
  store.scanning = true;
  try {
    const result = await api.scan();
    store.games = result.games;
    store.scanErrors = Object.fromEntries(result.errors.map((e) => [e.consoleId, e.error]));
  } catch (error) {
    console.error('Library scan failed', error);
  } finally {
    store.scanning = false;
    emit('library');
  }
}

export async function refreshStats(): Promise<void> {
  store.stats = await api.getStats();
  emit('stats');
}

export async function updateSettings(mutate: (settings: Settings) => void): Promise<Settings> {
  const next = structuredClone(store.settings);
  mutate(next);
  store.settings = await api.saveSettings(next);
  applyPrefs();
  emit('settings');
  return store.settings;
}

// ---------- selectors ----------

export const consoleById = (id: string): Console | undefined => store.settings.consoles.find((c) => c.id === id);

export const gamesOf = (consoleId?: string | null): Game[] => (consoleId ? store.games.filter((g) => g.consoleId === consoleId) : store.games);

export const statOf = (game: Game) => store.stats.games[game.key] ?? { seconds: 0, launches: 0, lastPlayed: 0 };

export function lastPlayedGame(consoleId?: string | null): Game | null {
  let best: Game | null = null;
  let bestTime = 0;
  for (const game of gamesOf(consoleId)) {
    const played = store.stats.games[game.key]?.lastPlayed ?? 0;
    if (played > bestTime) {
      best = game;
      bestTime = played;
    }
  }
  return best;
}

export function consoleTotals(consoleId: string): { count: number; seconds: number } {
  let seconds = 0;
  const games = gamesOf(consoleId);
  for (const game of games) seconds += store.stats.games[game.key]?.seconds ?? 0;
  return { count: games.length, seconds };
}
