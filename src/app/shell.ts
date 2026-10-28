// The persistent frame around every screen: animated background, top bar,
// hint bar, layers for dialogs and toasts, and the boot sequence.

import { assetUrl } from './api.js';
import { buildBubbles } from './background.js';
import { onPadChange, pad, pushInput } from './input.js';
import { lang, t } from './i18n.js';
import { on, store } from './state.js';
import { h, icon, wait } from './ui.js';

export interface Hint {
  pad: string;
  kbd: string;
  label: string;
  tone?: 'green' | 'red' | 'blue' | 'yellow';
}

export interface Shell {
  host: HTMLElement;
  setHints(hints: Hint[]): void;
  setMood(mood: 'default' | 'system'): void;
}

export function buildShell(root: HTMLElement, onProfile: () => void): Shell {
  const clock = h('div', { class: 'clock', 'aria-label': 'clock' });
  const avatar = h('div', { class: 'avatar' });
  const userName = h('div', { class: 'user-name' });
  const padDot = h('span', { class: 'status-dot' });
  const padIndicator = h('div', { class: 'gamepad-indicator' }, icon('gamepad', 18), padDot);
  const hints = h('div', { class: 'hints' });
  const mood = h('div', { class: 'mood-overlay' });

  const nxe = h(
    'div',
    { class: 'nxe', id: 'nxe', 'data-mood': 'default' },
    h('div', { class: 'background', 'aria-hidden': 'true' }, mood, h('div', { class: 'blue-glow' }), h('div', { class: 'white-glow' }), buildBubbles(), h('div', { class: 'background-gradient' }), h('div', { class: 'vignette' })),
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'logo' }, h('div', { class: 'logo-orb' }, 'G'), h('div', { class: 'logo-text' }, 'GAMEHUB')),
      h(
        'div',
        { class: 'topbar-right' },
        clock,
        h('button', { class: 'user-chip', type: 'button', onclick: onProfile, 'aria-label': t('shell.profile') }, userName, h('div', { class: 'user-section' }, avatar, padIndicator)),
      ),
    ),
    h('main', { class: 'screen-host', id: 'screen-host' }),
    h('footer', { class: 'os-footer' }, hints, h('div', { class: 'os-brand' }, `GAMEHUB OS ${store.info ? 'v' + store.info.version.replace(/-demo$/, '') : ''}`)),
    h('div', { class: 'scanlines', 'aria-hidden': 'true' }),
    h('div', { id: 'layer-modal' }),
    h('div', { id: 'layer-toast', 'aria-live': 'polite' }),
  );
  root.appendChild(nxe);

  // ----- clock -----
  const renderClock = () => {
    const parts = new Intl.DateTimeFormat(lang() === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: !store.settings.ui.clock24 }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    clock.replaceChildren(get('hour'), h('span', { class: 'colon' }, ':'), get('minute'), get('dayPeriod') ? h('span', { class: 'period' }, get('dayPeriod').toUpperCase()) : '');
  };
  const tick = () => {
    renderClock();
    const now = new Date();
    setTimeout(tick, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 20);
  };
  tick();

  // ----- user + gamepad -----
  const renderUser = () => {
    const profile = store.settings.profile;
    userName.textContent = profile.username;
    const url = assetUrl('Images', profile.avatar);
    avatar.replaceChildren(
      url
        ? h('img', { src: url, alt: '', onerror: (e: Event) => ((e.target as HTMLElement).replaceWith(h('span', { class: 'avatar-initial' }, (profile.username[0] ?? '?').toUpperCase()))) })
        : h('span', { class: 'avatar-initial' }, (profile.username[0] ?? '?').toUpperCase()),
    );
  };
  const renderPad = () => {
    padIndicator.classList.toggle('connected', pad.connected);
    padIndicator.title = pad.connected ? pad.name : t('shell.noPad');
  };
  renderUser();
  renderPad();
  renderClock();
  on('settings', () => {
    renderUser();
    renderClock();
  });
  onPadChange(renderPad);

  // ----- hints -----
  let current: Hint[] = [];
  const renderHints = () => {
    hints.replaceChildren(
      ...current.map((hint) =>
        h(
          'div',
          { class: 'hint' },
          h('span', { class: `glyph glyph-pad ${hint.tone ? 'tone-' + hint.tone : ''}` }, hint.pad),
          h('span', { class: 'glyph glyph-kbd' }, hint.kbd),
          h('span', { class: 'hint-label' }, hint.label),
        ),
      ),
    );
  };

  return {
    host: nxe.querySelector<HTMLElement>('#screen-host')!,
    setHints(next) {
      current = next;
      renderHints();
    },
    setMood(next) {
      nxe.dataset.mood = next;
    },
  };
}

/** Short start-up animation, shown once per session. Any key press skips it. */
export async function runBoot(root: HTMLElement): Promise<void> {
  try {
    if (sessionStorage.getItem('gh-booted')) return;
    sessionStorage.setItem('gh-booted', '1');
  } catch {
    /* private mode: boot every time */
  }
  if (document.documentElement.dataset.motion === 'reduced') return;

  const lines = ['boot.line1', 'boot.line2', 'boot.line3'].map((key, i) => h('div', { class: 'boot-line', style: `animation-delay:${0.55 + i * 0.28}s` }, t(key)));
  const overlay = h('div', { class: 'boot', role: 'presentation' }, h('div', { class: 'boot-content' }, h('div', { class: 'boot-orb' }, 'G'), h('div', { class: 'boot-title' }, 'GAMEHUB OS'), h('div', { class: 'boot-log' }, lines)));
  root.appendChild(overlay);

  let skip: () => void = () => undefined;
  const skipped = new Promise<void>((resolve) => (skip = resolve));
  const release = pushInput(() => {
    skip();
    return true;
  });
  const onPointer = () => skip();
  window.addEventListener('pointerdown', onPointer);
  await Promise.race([wait(2100), skipped]);
  release();
  window.removeEventListener('pointerdown', onPointer);
  overlay.classList.add('is-out');
  await wait(520);
  overlay.remove();
}
