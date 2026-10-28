// Builds a full palette from one chosen colour, so the whole interface can follow it.

const VARS = ['--accent', '--accent-rgb', '--accent-hi', '--accent-lo', '--accent-deep', '--ink', '--bg-grad', '--glow-1', '--glow-2'];

/** Themes without a hand-made palette: one colour is enough to build everything else. */
export const GENERATED_THEMES: Record<string, string> = {
  sunset: '#f97316',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  lagoon: '#14b8a6',
  gold: '#facc15',
};
export const DEFAULT_CUSTOM = '#38bdf8';

/** The colour to build the palette from, or '' when the theme has its own hand-made palette. */
export function accentOf(theme: string, custom: string): string {
  if (theme === 'custom') return isHex(custom) ? custom : DEFAULT_CUSTOM;
  return GENERATED_THEMES[theme] ?? '';
}

/** Two colours for a theme swatch: a dark one and the accent. */
export function swatchOf(hexColour: string): [string, string] {
  const [hue, sat] = toHsl(hexColour);
  return [hex(toRgb(hue, Math.max(35, sat), 12)), hexColour];
}

export const isHex = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

function toRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const hex = (rgb: number[]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Applies the colour to the page, or restores the theme's own palette when it is empty or invalid. */
export function applyAccent(root: HTMLElement, accent: string): void {
  if (!isHex(accent)) {
    for (const name of VARS) root.style.removeProperty(name);
    return;
  }
  const [hue, sat0, light0] = toHsl(accent);
  // Keep every colour readable: not grey, not too dark, not too light.
  const sat = Math.max(35, sat0);
  const base = toRgb(hue, sat, Math.min(66, Math.max(48, light0)));
  const hi = toRgb(hue, Math.min(100, sat + 4), 86);
  const lo = toRgb(hue, sat, 38);
  const deep = toRgb(hue, Math.min(85, sat), 15);
  const ink = toRgb(hue, 78, 7);
  const dark = toRgb(hue, 80, 7);
  const mid = toRgb(hue, 80, 25);
  const light = toRgb(hue, 94, 94);
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  set('--accent', hex(base));
  set('--accent-rgb', base.join(' '));
  set('--accent-hi', hex(hi));
  set('--accent-lo', hex(lo));
  set('--accent-deep', hex(deep));
  set('--ink', ink.join(' '));
  set('--bg-grad', `linear-gradient(135deg, ${hex(dark)} 0%, ${hex(mid)} 32%, ${hex(base)} 62%, ${hex(light)} 100%)`);
  set('--glow-1', `radial-gradient(circle, rgb(${base.join(' ')} / 0.5), transparent 70%)`);
  set('--glow-2', `radial-gradient(circle, rgb(${hi.join(' ')} / 0.5), transparent 70%)`);
}
