// Starts a game with a full-screen "launching" overlay, then reports problems in plain words.

import { api, AppError, assetUrl } from './api.js';
import { sfx } from './audio.js';
import { errorMessage, t } from './i18n.js';
import { pushInput } from './input.js';
import { openModal } from './modal.js';
import { go } from './router.js';
import { refreshStats } from './state.js';
import type { Game } from './types.js';
import { h, wait } from './ui.js';
import { gameArt } from './art.js';

let busy = false;

export async function launchGame(game: Game): Promise<void> {
  if (busy) return;
  busy = true;
  sfx('select');
  const release = pushInput(() => true); // nothing reacts while the emulator starts

  const title = h('h2', { class: 'launch-title' }, h('small', null, t('launch.starting')), h('span', null, game.title));
  const overlay = h(
    'div',
    { class: 'launch-overlay', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'launch-content' }, h('div', { class: 'launch-cover' }, gameArt(game, assetUrl('Covers', game.cover))), title, h('div', { class: 'loading-bar' }, h('i'))),
  );
  document.getElementById('layer-modal')!.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-in'));

  const reduced = document.documentElement.dataset.motion === 'reduced';
  // The launch screen is shown for a moment before the emulator starts; the app then
  // stays on it for a few seconds more (see INTRO_GRACE in launch.rs) before stepping aside.
  await wait(reduced ? 300 : 1400);

  let error: AppError | null = null;
  let failedCode: number | null | undefined;
  let failed = false;
  try {
    const outcome = await api.launch(game.consoleId, game.relPath);
    failed = outcome.failedEarly;
    failedCode = outcome.exitCode;
  } catch (e) {
    error = e instanceof AppError ? e : new AppError(e);
  }
  void refreshStats().catch(() => undefined);

  if (!error && !failed) {
    title.replaceChildren(h('small', null, t('launch.backTo')), h('span', null, t('launch.library')));
    await wait(reduced ? 100 : 750);
  }
  overlay.classList.remove('is-in');
  setTimeout(() => overlay.remove(), 450);
  release();
  busy = false;

  if (error || failed) {
    const message = error ? errorMessage(error) : t('launch.failedEarly', { code: failedCode ?? '?' });
    openModal({
      title: t('launch.errorTitle'),
      message,
      buttons: [
        { label: t('common.close'), kind: 'ghost' },
        { label: t('launch.openSettings'), kind: 'primary', onClick: () => go('/settings/consoles') },
      ],
    });
  }
}
