// Box art from SteamGridDB, using the player's own free API key (see Settings → Covers).

import { api } from './api.js';
import { errorMessage, t } from './i18n.js';
import { openModal } from './modal.js';
import { refreshLibrary, store } from './state.js';
import type { Game } from './types.js';
import { h, icon, toast } from './ui.js';

export const hasCoverKey = (): boolean => store.settings.ui.steamgriddbKey.length > 0;

/** Errors after which trying the next game is pointless. */
const STOPPING = ['sgdb_nokey|', 'sgdb_key|', 'sgdb_busy|', 'net|'];

const isNotFound = (error: unknown): boolean => String(error instanceof Error ? error.message : error).startsWith('sgdb_notfound|');

/** One game, with a toast for the outcome. Returns true when a cover was saved. */
export async function fetchCoverFor(game: Game): Promise<boolean> {
  try {
    toast(t('cover.searching', { title: game.title }));
    await api.fetchGameCover(game.consoleId, game.relPath, game.title);
    await refreshLibrary();
    toast(t('lib.coverSaved'), 'ok');
    return true;
  } catch (error) {
    toast(errorMessage(error), 'error');
    return false;
  }
}

let running = false;

/** Every game that still has no cover, one after the other (the service asks for gentle use). */
export async function fetchMissingCovers(): Promise<void> {
  if (running) return;
  const todo = store.games.filter((g) => !g.cover);
  if (!todo.length) {
    toast(t('cover.nothingMissing'), 'ok');
    return;
  }
  running = true;
  let saved = 0;
  let missed = 0;
  let stopped: string | null = null;
  try {
    for (const [i, game] of todo.entries()) {
      if (i % 4 === 0) toast(t('cover.progress', { done: i, total: todo.length }), 'info', 2400);
      try {
        await api.fetchGameCover(game.consoleId, game.relPath, game.title);
        saved += 1;
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        if (isNotFound(error)) missed += 1;
        else if (STOPPING.some((code) => raw.startsWith(code))) {
          stopped = errorMessage(error);
          break;
        } else missed += 1;
      }
    }
  } finally {
    running = false;
    await refreshLibrary();
  }
  if (stopped) toast(t('cover.stopped', { saved, reason: stopped }), 'error', 6000);
  else toast(t('cover.done', { saved, missed }), saved ? 'ok' : 'info', 5000);
}

/** Asked when X is pressed on a game and a key is set. */
export function askCoverSource(): Promise<'online' | 'file' | null> {
  return new Promise((resolve) => {
    const answer = (value: 'online' | 'file' | null) => () => void resolve(value); // later calls are ignored
    openModal({
      title: t('cover.sourceTitle'),
      message: t('cover.sourceText'),
      buttons: [
        { label: t('common.cancel'), kind: 'ghost', onClick: answer(null) },
        { label: t('cover.fromFile'), kind: 'ghost', onClick: answer('file') },
        { label: t('cover.fromWeb'), kind: 'primary', onClick: answer('online') },
      ],
      onBack: answer(null),
    });
  });
}

const SITE = 'https://www.steamgriddb.com/';

/** Explains where to find the key, opens the site on request and asks for the pasted key. */
export function askCoverKey(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { class: 'field-input', type: 'text', value: current, placeholder: t('cover.keyPlaceholder'), spellcheck: false, autocomplete: 'off', maxlength: 64, 'data-focus': '' }) as HTMLInputElement;
    const open = h('button', { class: 'btn btn-ghost', type: 'button', 'data-focus': '' }, icon('refresh', 16), t('cover.openSite'));
    open.addEventListener('click', () => {
      api.openUrl(`${SITE}profile/preferences/api`).catch((error) => toast(errorMessage(error), 'error'));
    });
    const steps = h('ol', { class: 'key-steps' }, [t('cover.step1'), t('cover.step2'), t('cover.step3')].map((text) => h('li', null, text)));
    const answer = (value: string | null) => () => void resolve(value); // later calls are ignored
    openModal({
      title: t('settings.sgdbKey'),
      wide: true,
      body: h('div', { class: 'key-dialog' }, h('p', { class: 'modal-message' }, t('cover.keyIntro')), steps, h('div', { class: 'm-row' }, open), h('div', { class: 'm-row field' }, h('label', { class: 'field-label' }, t('cover.keyLabel')), input)),
      buttons: [
        { label: t('common.cancel'), kind: 'ghost', onClick: answer(null) },
        { label: t('common.save'), kind: 'primary', onClick: () => void resolve(input.value.trim()) },
      ],
      initialFocus: () => open,
      onBack: answer(null),
    });
  });
}
