import { assetUrl } from './api.js';
import { h } from './ui.js';
import type { Console } from './types.js';

const ABBR: Record<string, string> = {
  ps1: 'PS1', ps2: 'PS2', ps3: 'PS3', psp: 'PSP', gamecube: 'GC', wii: 'Wii', xbox360: '360', n64: 'N64', nds: 'NDS', gba: 'GBA', snes: 'SNES',
};

export function abbreviation(console: Pick<Console, 'id' | 'preset' | 'title'>): string {
  return ABBR[console.preset ?? ''] ?? ABBR[console.id] ?? console.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() ?? '?';
}

/** The console picture if there is one, otherwise a glossy orb with its short name. */
export function consoleEmblem(console: Pick<Console, 'id' | 'preset' | 'title' | 'image'>, className = ''): HTMLElement {
  const url = assetUrl('Images', console.image);
  const orb = () => h('div', { class: 'emblem-orb' }, h('span', null, abbreviation(console)));
  if (!url) return h('div', { class: `emblem ${className}` }, orb());
  const wrap = h('div', { class: `emblem has-image ${className}` });
  wrap.appendChild(h('img', { src: url, alt: '', loading: 'lazy', onerror: () => wrap.replaceChildren(orb()) }));
  return wrap;
}
