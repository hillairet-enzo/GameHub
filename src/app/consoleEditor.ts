// "Add your console" dialog: one screen.
//   1. type the name of the console: GameHub recognises it (Switch, Switch 2, PS3, PS4, PC...)
//      and fills in the file types, the launch options and the shape of the covers,
//   2. optionally point to the emulator and the game folder, then add.
// Everything else (launch options, file types, picture) lives in Settings.

import { api, pickExecutable, pickFolder } from './api.js';
import { consoleEmblem } from './emblem.js';
import { errorMessage, t } from './i18n.js';
import { openModal } from './modal.js';
import { refreshLibrary, updateSettings } from './state.js';
import type { Preset } from './types.js';
import { h, icon, toast } from './ui.js';

const GENERIC_ARGS = '{rom}';

export function addConsoleWizard(): Promise<boolean> {
  return new Promise((resolve) => {
    let emulatorPath = '';
    let romPath = '';
    let guessedArgs: string | null = null;
    let saved = false;
    // What GameHub recognised from the name; `other` means "not a console it knows".
    let detected: Preset | null = null;
    let detectTimer: number | undefined;

    const error = h('p', { class: 'field-error', hidden: true });
    const showError = (message: string) => {
      error.hidden = false;
      error.textContent = message;
    };

    // ---------- the name, and what GameHub makes of it ----------

    const nameInput = h('input', {
      class: 'field-input name-input',
      type: 'text',
      placeholder: t('wizard.namePlaceholder'),
      spellcheck: false,
      autocomplete: 'off',
      maxlength: 40,
      'data-focus': '',
      oninput: () => {
        error.hidden = true;
        window.clearTimeout(detectTimer);
        detectTimer = window.setTimeout(() => void detect(), 140);
      },
    }) as HTMLInputElement;

    // The picture changes with the name; the field itself is never rebuilt, so typing is not interrupted.
    const heroArt = h('div', { class: 'hero-art' });
    const hero = h('div', { class: 'hero' }, heroArt, h('div', { class: 'm-row hero-text' }, nameInput));
    const detectLine = h('p', { class: 'wizard-detect' });
    const emulatorBox = h('div', { class: 'm-row-box' });

    const known = () => (detected && detected.id !== 'other' ? detected : null);

    const paintHero = () => {
      const name = nameInput.value.trim();
      const art = name
        ? consoleEmblem({ id: known()?.id ?? 'x', preset: known()?.id ?? null, title: name, image: null }, 'emblem-hero')
        : h('div', { class: 'emblem emblem-hero emblem-symbol' }, h('div', { class: 'emblem-orb' }, icon('plus', 34)));
      heroArt.replaceChildren(art);
    };

    const paintDetected = () => {
      const name = nameInput.value.trim();
      const preset = known();
      if (!name) detectLine.textContent = t('wizard.nameHint');
      else if (!preset) detectLine.textContent = t('wizard.unknown');
      else if (preset.native) detectLine.textContent = t('wizard.detectedNative', { console: preset.title, types: preset.extensions.map((e) => '.' + e).join(' ') });
      else detectLine.textContent = t('wizard.detected', { console: preset.title, types: preset.extensions.map((e) => '.' + e).join(' ') });
      detectLine.classList.toggle('is-found', !!preset);
      // A PC game is a program: there is no emulator to choose.
      emulatorBox.hidden = !!preset?.native;
    };

    async function detect(): Promise<void> {
      const name = nameInput.value.trim();
      try {
        detected = name ? await api.matchConsole(name) : null;
      } catch {
        detected = null;
      }
      paintHero();
      paintDetected();
    }

    // ---------- optional: emulator and game folder ----------

    const pickRow = (iconName: string, label: string, empty: string, choosePath: () => Promise<string | null>, apply: (path: string) => void) => {
      const value = h('span', { class: 'pick-value' }, empty);
      const check = h('span', { class: 'pick-state' }, icon('plus', 18));
      const button = h(
        'button',
        {
          class: 'pick-row',
          type: 'button',
          'data-focus': '',
          onclick: async () => {
            const path = await choosePath();
            if (!path) return;
            apply(path);
            value.textContent = path;
            value.title = path;
            button.classList.add('is-set');
            check.replaceChildren(icon('check', 18));
          },
        },
        h('span', { class: 'pick-icon' }, icon(iconName, 22)),
        h('span', { class: 'pick-text' }, h('span', { class: 'pick-label' }, label), value),
        check,
      );
      return h('div', { class: 'm-row' }, button);
    };

    emulatorBox.append(
      pickRow('gamepad', t('wizard.emulator'), t('wizard.pickEmulator'), () => pickExecutable(t('wizard.emulator')), (path) => {
        emulatorPath = path;
        void api.guessArgs(path).then((guess) => (guessedArgs = guess));
      }),
    );

    const body = h(
      'div',
      { class: 'wizard' },
      hero,
      detectLine,
      emulatorBox,
      pickRow('folder', t('wizard.romFolder'), t('wizard.pickFolder'), () => pickFolder(t('wizard.romFolder')), (path) => (romPath = path)),
      h('p', { class: 'field-hint' }, t('wizard.laterHint')),
      error,
    );
    paintHero();
    paintDetected();

    // ---------- the dialog ----------

    const modal = openModal({
      title: t('wizard.title'),
      body,
      wide: true,
      buttons: [
        { label: t('common.cancel'), kind: 'ghost' },
        {
          label: t('wizard.add'),
          kind: 'primary',
          onClick: async () => {
            const title = nameInput.value.trim();
            if (!title) {
              showError(t('wizard.nameRequired'));
              nameInput.focus();
              return false;
            }
            window.clearTimeout(detectTimer);
            try {
              // The name may have changed a moment ago: look at what it says now.
              detected = await api.matchConsole(title);
              const preset = known();
              const types = detected?.extensions ?? [];
              await updateSettings((s) => {
                s.consoles.push({
                  id: '',
                  title,
                  preset: preset ? preset.id : null,
                  emulatorPath: preset?.native ? '' : emulatorPath,
                  romPath,
                  args: preset?.native ? (preset.args || GENERIC_ARGS) : guessedArgs ?? detected?.args ?? GENERIC_ARGS,
                  extensions: [...types],
                  image: null,
                  coverShape: '',
                });
              });
              await refreshLibrary();
              saved = true;
              toast(t('wizard.added', { name: title }), 'ok');
              return true;
            } catch (e) {
              showError(errorMessage(e));
              return false;
            }
          },
        },
      ],
      initialFocus: () => nameInput,
    });

    // Resolve once the dialog is gone, whichever way it was closed.
    const watcher = new MutationObserver(() => {
      if (!modal.el.isConnected) {
        watcher.disconnect();
        window.clearTimeout(detectTimer);
        resolve(saved);
      }
    });
    watcher.observe(document.getElementById('layer-modal')!, { childList: true, subtree: true });
  });
}
