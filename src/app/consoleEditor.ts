// "Add a console" dialog, in two quick screens:
//   1. tap the console you want,
//   2. optionally point to the emulator and the game folder, then add.
// Everything else (launch options, file types, picture) lives in Settings.

import { api, pickExecutable, pickFolder } from './api.js';
import { consoleEmblem } from './emblem.js';
import { errorMessage, t } from './i18n.js';
import { openModal } from './modal.js';
import { refreshLibrary, store, updateSettings } from './state.js';
import { h, icon, toast } from './ui.js';

const GENERIC_ARGS = '{rom}';
const TILES_PER_ROW = 6;

export function addConsoleWizard(): Promise<boolean> {
  return new Promise((resolve) => {
    // null = "Other" (the person names it themselves).
    let choice: { id: string | null; title: string } | null = null;
    let emulatorPath = '';
    let romPath = '';
    let guessedArgs: string | null = null;
    let saved = false;
    let step: 'pick' | 'details' = 'pick';

    const pickView = h('div', { class: 'wizard-pick' });
    const detailView = h('div', { class: 'wizard-details', hidden: true });
    const error = h('p', { class: 'field-error', hidden: true });
    const body = h('div', { class: 'wizard' }, pickView, detailView, error);

    const showError = (message: string) => {
      error.hidden = false;
      error.textContent = message;
    };

    // ---------- screen 1: the console grid ----------

    const tiles: HTMLElement[] = [];
    const tile = (id: string | null, title: string): HTMLElement => {
      const art =
        id === null
          ? h('div', { class: 'emblem emblem-tile emblem-symbol' }, h('div', { class: 'emblem-orb' }, icon('plus', 24)))
          : consoleEmblem({ id, preset: id, title, image: null }, 'emblem-tile');
      const el = h('button', { class: 'tile', type: 'button', 'data-focus': '', onclick: () => choose(id, title) }, art, h('span', { class: 'tile-name' }, title));
      tiles.push(el);
      return el;
    };
    const entries: Array<[string | null, string]> = [...store.presets.map((p): [string, string] => [p.id, p.title]), [null, t('wizard.custom')]];
    const items = entries.map(([id, title]) => tile(id, title));
    const grid = h('div', { class: 'tile-grid' });
    for (let i = 0; i < items.length; i += TILES_PER_ROW) grid.appendChild(h('div', { class: 'm-row', style: 'display:contents' }, items.slice(i, i + TILES_PER_ROW)));
    pickView.append(h('p', { class: 'wizard-lead' }, t('wizard.which')), grid);

    // ---------- screen 2: emulator + folder ----------

    let nameInput: HTMLInputElement | null = null;

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

    const renderDetails = () => {
      if (!choice) return;
      const preset = store.presets.find((p) => p.id === choice!.id);
      emulatorPath = '';
      romPath = '';
      guessedArgs = null;
      nameInput = null;

      const art =
        choice.id === null
          ? h('div', { class: 'emblem emblem-hero emblem-symbol' }, h('div', { class: 'emblem-orb' }, icon('plus', 34)))
          : consoleEmblem({ id: choice.id, preset: choice.id, title: choice.title, image: null }, 'emblem-hero');

      let heading: HTMLElement;
      if (choice.id === null) {
        nameInput = h('input', { class: 'field-input name-input', type: 'text', placeholder: t('wizard.namePlaceholder'), spellcheck: false, autocomplete: 'off', maxlength: 40, 'data-focus': '', oninput: () => (error.hidden = true) }) as HTMLInputElement;
        heading = h('div', { class: 'm-row hero-text' }, nameInput);
      } else {
        heading = h('div', { class: 'hero-text' }, h('h4', { class: 'hero-title' }, choice.title), preset ? h('p', { class: 'hero-sub' }, t('wizard.suggested', { emulator: preset.emulator })) : null);
      }

      detailView.replaceChildren(
        h('div', { class: 'm-row' }, h('button', { class: 'link-btn', type: 'button', 'data-focus': '', onclick: () => goTo('pick') }, `‹ ${t('wizard.back')}`)),
        h('div', { class: 'hero' }, art, heading),
        pickRow('gamepad', t('wizard.emulator'), t('wizard.pickEmulator'), () => pickExecutable(t('wizard.emulator')), (path) => {
          emulatorPath = path;
          void api.guessArgs(path).then((guess) => (guessedArgs = guess));
        }),
        pickRow('folder', t('wizard.romFolder'), t('wizard.pickFolder'), () => pickFolder(t('wizard.romFolder')), (path) => (romPath = path)),
        h('p', { class: 'field-hint' }, t('wizard.laterHint')),
      );
    };

    // ---------- navigation between the two screens ----------

    const choose = (id: string | null, title: string) => {
      choice = { id, title };
      renderDetails();
      goTo('details');
    };

    let modalRef: ReturnType<typeof openModal> | null = null;
    const goTo = (next: 'pick' | 'details') => {
      step = next;
      error.hidden = true;
      pickView.hidden = next !== 'pick';
      detailView.hidden = next !== 'details';
      const add = modalRef?.el.querySelector<HTMLElement>('.modal-actions .btn-primary');
      if (add) add.hidden = next !== 'details';
      setTimeout(() => {
        if (!modalRef) return;
        if (next === 'pick') modalRef.focus(tiles[Math.max(0, entries.findIndex(([id]) => id === choice?.id))] ?? tiles[0]);
        else modalRef.focus((nameInput ?? detailView.querySelector<HTMLElement>('.pick-row')) as HTMLElement);
      }, 30);
    };

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
            if (!choice) return false;
            const title = (nameInput ? nameInput.value : choice.title).trim();
            if (!title) {
              showError(t('wizard.nameRequired'));
              nameInput?.focus();
              return false;
            }
            const preset = store.presets.find((p) => p.id === choice!.id) ?? null;
            try {
              await updateSettings((s) => {
                s.consoles.push({
                  id: '',
                  title,
                  preset: preset ? preset.id : null,
                  emulatorPath,
                  romPath,
                  args: guessedArgs ?? preset?.args ?? GENERIC_ARGS,
                  extensions: preset ? [...preset.extensions] : [],
                  image: null,
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
      initialFocus: () => tiles[0],
      onBack: () => {
        if (step === 'details') {
          goTo('pick');
          return false;
        }
        return true;
      },
    });
    modalRef = modal;
    goTo('pick');

    // Resolve once the dialog is gone, whichever way it was closed.
    const watcher = new MutationObserver(() => {
      if (!modal.el.isConnected) {
        watcher.disconnect();
        resolve(saved);
      }
    });
    watcher.observe(document.getElementById('layer-modal')!, { childList: true, subtree: true });
  });
}
