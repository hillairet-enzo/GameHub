// A short illustrated tutorial: shown once on the very first launch and available
// any time from Settings. The pictures are small replicas of the real screens drawn
// with the app's own styles, so they always match the chosen theme and language.

import { consoleEmblem } from './emblem.js';
import { t } from './i18n.js';
import { openModal } from './modal.js';
import { h, icon } from './ui.js';

const STEPS = 5;

const orb = (id: string, title: string, size = 'emblem-hero') => consoleEmblem({ id, preset: id, title, image: null }, size);

function fakeRow(iconName: string, label: string, value: string, set: boolean): HTMLElement {
  return h(
    'div',
    { class: `pick-row ${set ? 'is-set' : ''}` },
    h('span', { class: 'pick-icon' }, icon(iconName, 22)),
    h('span', { class: 'pick-text' }, h('span', { class: 'pick-label' }, label), h('span', { class: 'pick-value' }, value)),
    h('span', { class: 'pick-state' }, icon(set ? 'check' : 'plus', 18)),
  );
}

const arts: Array<() => HTMLElement> = [
  // 1. welcome
  () => h('div', { class: 'tour-orbs' }, orb('ps2', 'PlayStation 2'), orb('gamecube', 'GameCube'), orb('psp', 'PSP')),

  // 2. add a console
  () =>
    h(
      'div',
      { class: 'tour-split' },
      h(
        'div',
        { class: 'tour-addcard glass' },
        h('div', { class: 'emblem emblem-tile emblem-symbol' }, h('div', { class: 'emblem-orb' }, icon('plus', 24))),
        h('strong', null, t('home.addConsole')),
      ),
      h('span', { class: 'tour-arrow' }, icon('play', 22)),
      h(
        'div',
        { class: 'tour-grid' },
        ['ps1', 'ps2', 'gamecube', 'wii', 'n64', 'snes'].map((id) => h('div', { class: `tile ${id === 'ps2' ? 'is-hot' : ''}` }, orb(id, id, 'emblem-tile'))),
      ),
    ),

  // 3. emulator
  () => h('div', { class: 'tour-stack' }, fakeRow('gamepad', t('wizard.emulator'), 'C:\\Emulators\\PCSX2\\pcsx2-qt.exe', true), h('p', { class: 'tour-note' }, t('wizard.suggested', { emulator: 'PCSX2' }))),

  // 4. game folder
  () =>
    h(
      'div',
      { class: 'tour-stack' },
      fakeRow('folder', t('wizard.romFolder'), 'D:\\Games\\PS2', true),
      h(
        'div',
        { class: 'tour-files' },
        ['Crimson Harbor.iso', 'Orbit Breakers.iso', 'Glass Meridian.chd'].map((name) => h('span', { class: 'tour-file' }, icon('image', 16), name)),
      ),
    ),

  // 5. play
  () =>
    h(
      'div',
      { class: 'tour-stack' },
      h(
        'div',
        { class: 'tour-covers', 'aria-hidden': 'true' },
        [212, 262, 200, 330, 28].map((hue, i) => h('i', { class: `tour-cover pos-${i}`, style: `--hue:${hue}` })),
      ),
      h(
        'div',
        { class: 'tour-keys' },
        [
          ['Enter · A', t('hint.play')],
          ['Y', t('tour.key.sort')],
          ['X', t('hint.cover')],
          ['Esc · B', t('hint.back')],
        ].map(([key, label]) => h('span', { class: 'tour-key' }, h('b', null, key), label)),
      ),
    ),
];

/** Resolves once the tutorial is closed, whether it was finished or skipped. */
export function openTutorial(): Promise<void> {
  return new Promise((resolve) => {
    let step = 0;
    const art = h('div', { class: 'tour-art', 'aria-hidden': 'true' });
    const title = h('h4', { class: 'tour-title' });
    const text = h('p', { class: 'tour-text' });
    const dots = h('div', { class: 'tour-dots' }, Array.from({ length: STEPS }, () => h('i')));
    const body = h('div', { class: 'tour' }, art, h('div', { class: 'tour-copy' }, title, text), dots);

    const modal = openModal({
      title: t('tour.title'),
      body,
      wide: true,
      buttons: [
        { label: t('tour.skip'), kind: 'ghost' },
        {
          label: t('tour.prev'),
          kind: 'ghost',
          onClick: () => {
            step = Math.max(0, step - 1);
            render();
            return false;
          },
        },
        {
          label: t('tour.next'),
          kind: 'primary',
          onClick: () => {
            if (step >= STEPS - 1) return true;
            step += 1;
            render();
            return false;
          },
        },
      ],
    });

    const [skip, prev, next] = Array.from(modal.el.querySelectorAll<HTMLElement>('.modal-actions .btn'));

    function render() {
      art.replaceChildren(arts[step]());
      title.textContent = t(`tour.${step + 1}.title`);
      text.textContent = t(`tour.${step + 1}.text`);
      dots.querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('is-on', i === step));
      const last = step === STEPS - 1;
      skip.hidden = last;
      prev.hidden = step === 0;
      next.textContent = last ? t('tour.done') : t('tour.next');
      modal.focus(next);
    }
    render();

    const watcher = new MutationObserver(() => {
      if (!modal.el.isConnected) {
        watcher.disconnect();
        resolve();
      }
    });
    watcher.observe(document.getElementById('layer-modal')!, { childList: true, subtree: true });
  });
}
