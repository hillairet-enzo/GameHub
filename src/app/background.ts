// The animated backdrop: drifting bubbles.

import { h } from './ui.js';

const BUBBLES = 26;

/** Small deterministic random generator, so the backdrop looks the same on every launch. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildBubbles(): HTMLElement {
  const random = seeded(2009);
  const bubbles = Array.from({ length: BUBBLES }, () => {
    const size = Math.round(9 + random() ** 2.2 * 66);
    const duration = Math.round(15 + random() * 22);
    const sway = Math.round((18 + random() * 70) * (random() < 0.5 ? -1 : 1));
    const style = [
      `left:${(random() * 98).toFixed(1)}%`,
      `width:${size}px`,
      `height:${size}px`,
      `animation-duration:${duration}s`,
      `animation-delay:-${(random() * duration).toFixed(1)}s`,
      `--dx:${sway}px`,
      `--o:${(0.45 + random() * 0.4).toFixed(2)}`,
    ].join(';');
    return h('span', { style });
  });
  return h('div', { class: 'bobbles' }, bubbles);
}
