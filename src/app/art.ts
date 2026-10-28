// Cover artwork with a generated fallback for games that have no picture yet.

import { h, hashHue } from './ui.js';
import type { Game } from './types.js';

export function initials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

export function fallbackArt(game: Pick<Game, 'title' | 'consoleTitle'>): HTMLElement {
  const hue = hashHue(game.title);
  return h(
    'div',
    { class: 'art-fallback', style: `--hue:${hue}` },
    h('span', { class: 'art-initials' }, initials(game.title)),
    h('span', { class: 'art-console' }, game.consoleTitle),
  );
}

export function gameArt(game: Pick<Game, 'title' | 'consoleTitle'>, url: string | null): HTMLElement {
  if (!url) return fallbackArt(game);
  const wrap = h('div', { class: 'art' });
  wrap.appendChild(h('img', { src: url, alt: '', draggable: false, decoding: 'async', onerror: () => wrap.replaceChildren(fallbackArt(game)) }));
  return wrap;
}
