// Hash router with a short transition between screens.

import type { Hint, Shell } from './shell.js';

export interface ScreenInstance {
  destroy(): void;
  hints?: Hint[];
  mood?: 'default' | 'system';
}

export interface ScreenContext {
  params: string[];
  query: URLSearchParams;
  host: HTMLElement;
}

export type ScreenFactory = (ctx: ScreenContext) => ScreenInstance | Promise<ScreenInstance>;

const routes = new Map<string, ScreenFactory>();
let shell: Shell;
let current: { instance: ScreenInstance; host: HTMLElement } | null = null;
let token = 0;

export function route(name: string, factory: ScreenFactory): void {
  routes.set(name, factory);
}

export function go(path: string): void {
  const target = '#' + (path.startsWith('/') ? path : '/' + path);
  if (location.hash === target) void render();
  else location.hash = target;
}

function parse(): { name: string; params: string[]; query: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, search = ''] = raw.split('?');
  const [name = '', ...params] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: name || 'home', params, query: new URLSearchParams(search) };
}

async function render(): Promise<void> {
  const mine = ++token;
  const { name, params, query } = parse();
  const factory = routes.get(name) ?? routes.get('home')!;

  const host = document.createElement('section');
  host.className = 'screen is-entering';
  host.dataset.screen = name;
  shell.host.appendChild(host);

  let instance: ScreenInstance;
  try {
    instance = await factory({ params, query, host });
  } catch (error) {
    console.error('Screen failed', error);
    host.remove();
    return;
  }
  if (mine !== token) {
    instance.destroy();
    host.remove();
    return;
  }

  const previous = current;
  current = { instance, host };
  if (previous) {
    previous.instance.destroy();
    previous.host.classList.add('is-leaving');
    setTimeout(() => previous.host.remove(), 260);
  }
  shell.setHints(instance.hints ?? []);
  shell.setMood(instance.mood ?? 'default');
  requestAnimationFrame(() => requestAnimationFrame(() => host.classList.remove('is-entering')));
}

export function startRouter(s: Shell): void {
  shell = s;
  window.addEventListener('hashchange', () => void render());
  void render();
}

/** Re-renders the current screen (used after the language changes). */
export function reload(): void {
  void render();
}

/** Lets a screen change the background mood while it is displayed. */
export function setMood(mood: 'default' | 'system'): void {
  shell?.setMood(mood);
}
