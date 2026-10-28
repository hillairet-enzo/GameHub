// Entry point: loads the data, builds the shell and starts the router.

import { api, isTauri } from './api.js';
import { startInput } from './input.js';
import { openTutorial } from './tutorial.js';
import { errorMessage } from './i18n.js';
import { go, route, startRouter } from './router.js';
import { homeScreen } from './screens/home.js';
import { libraryScreen } from './screens/library.js';
import { settingsScreen } from './screens/settings.js';
import { buildShell, runBoot } from './shell.js';
import { bootstrap, store, updateSettings } from './state.js';
import { h } from './ui.js';

async function toggleFullscreen(): Promise<void> {
  try {
    if (isTauri) {
      const next = !(await api.isFullscreen());
      await api.setFullscreen(next);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    /* not available here */
  }
}

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  try {
    await bootstrap();
  } catch (error) {
    root.replaceChildren(h('div', { class: 'fatal' }, h('h1', null, 'GameHub'), h('p', null, errorMessage(error))));
    return;
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'F11' || (event.altKey && event.key === 'Enter')) {
      event.preventDefault();
      void toggleFullscreen();
    }
  });
  // Sorting out accidental text selection and the browser menu keeps it app-like.
  window.addEventListener('contextmenu', (event) => {
    if (isTauri && !import.meta.env.DEV) event.preventDefault();
  });

  startInput();
  route('home', homeScreen);
  route('library', libraryScreen);
  route('settings', settingsScreen);

  const shell = buildShell(root, () => go('/settings/profile'));
  startRouter(shell);
  // First launch: a short tutorial once the boot animation is over.
  void runBoot(root).then(async () => {
    if (store.settings.tutorialSeen || store.settings.consoles.length > 0) return;
    await openTutorial();
    await updateSettings((s) => (s.tutorialSeen = true)).catch(() => undefined);
  });
}

void main();
