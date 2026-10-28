// One input layer for keyboard and gamepad. Screens and dialogs push a handler on a
// stack; only the top handler receives actions, so a dialog never leaks keys to the
// screen under it.

export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'x' | 'y' | 'lb' | 'rb' | 'start';
export type Handler = (action: Action, event?: KeyboardEvent) => boolean | void;
export type Device = 'kbd' | 'pad';

const stack: Handler[] = [];
const deviceListeners = new Set<(device: Device) => void>();
const padListeners = new Set<() => void>();

export const pad = { connected: false, name: '' };
export let device: Device = 'kbd';

export function pushInput(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

export function onDeviceChange(listener: (device: Device) => void): void {
  deviceListeners.add(listener);
}

export function onPadChange(listener: () => void): void {
  padListeners.add(listener);
}

function setDevice(next: Device): void {
  if (device === next) return;
  device = next;
  document.body.dataset.input = next;
  deviceListeners.forEach((fn) => fn(next));
}

function dispatch(action: Action, event?: KeyboardEvent): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  return top(action, event) !== false;
}

// ---------- keyboard ----------

const KEYS: Record<string, Action> = {
  arrowup: 'up', w: 'up',
  arrowdown: 'down', s: 'down',
  arrowleft: 'left', a: 'left',
  arrowright: 'right', d: 'right',
  enter: 'confirm', ' ': 'confirm',
  escape: 'back', backspace: 'back',
  x: 'x', y: 'y', q: 'lb', e: 'rb', m: 'start',
};
const REPEATABLE = new Set<Action>(['up', 'down', 'left', 'right']);

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  setDevice('kbd');
  const action = KEYS[event.key.toLowerCase()];
  if (!action) return;
  if (isTyping(event.target) && action !== 'confirm' && action !== 'back') return;
  if (isTyping(event.target) && event.key === 'Backspace') return;
  if (event.repeat && !REPEATABLE.has(action)) {
    event.preventDefault();
    return;
  }
  if (dispatch(action, event)) event.preventDefault();
}

// ---------- gamepad ----------

const REPEAT_DELAY = 380;
const REPEAT_RATE = 120;
const BUTTONS: [number, Action][] = [[0, 'confirm'], [1, 'back'], [2, 'x'], [3, 'y'], [4, 'lb'], [5, 'rb'], [9, 'start']];
const DIRS: Action[] = ['up', 'down', 'left', 'right'];

let previous: boolean[] | null = null;
const held: Partial<Record<Action, { since: number; last: number }>> = {};

function activePad(): Gamepad | null {
  const list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
  return list.find((p): p is Gamepad => Boolean(p && p.connected)) ?? null;
}

function updatePadInfo(current: Gamepad | null): void {
  const connected = Boolean(current);
  const name = current ? current.id.replace(/\s*\(.*?\)\s*/g, ' ').trim() : '';
  if (connected !== pad.connected || name !== pad.name) {
    pad.connected = connected;
    pad.name = name;
    padListeners.forEach((fn) => fn());
  }
}

function poll(now: number): void {
  const current = activePad();
  updatePadInfo(current);

  if (!current || !document.hasFocus()) {
    previous = null;
    for (const d of DIRS) delete held[d];
    requestAnimationFrame(poll);
    return;
  }

  const buttons = current.buttons.map((b) => b.pressed);
  const axisX = current.axes[0] ?? 0;
  const axisY = current.axes[1] ?? 0;
  const pressedDirs: Record<string, boolean> = {
    up: buttons[12] || axisY < -0.55,
    down: buttons[13] || axisY > 0.55,
    left: buttons[14] || axisX < -0.55,
    right: buttons[15] || axisX > 0.55,
  };

  if (previous === null) {
    // First frame after connecting or regaining focus: ignore buttons already held.
    previous = buttons;
  } else {
    for (const [index, action] of BUTTONS) {
      if (buttons[index] && !previous[index]) {
        setDevice('pad');
        dispatch(action);
      }
    }
    previous = buttons;
  }

  for (const dir of DIRS) {
    if (pressedDirs[dir]) {
      const state = held[dir];
      if (!state) {
        held[dir] = { since: now, last: now };
        setDevice('pad');
        dispatch(dir);
      } else if (now - state.since > REPEAT_DELAY && now - state.last > REPEAT_RATE) {
        state.last = now;
        dispatch(dir);
      }
    } else {
      delete held[dir];
    }
  }
  requestAnimationFrame(poll);
}

let started = false;

export function startInput(): void {
  if (started) return;
  started = true;
  document.body.dataset.input = device;
  window.addEventListener('keydown', onKeyDown);
  requestAnimationFrame(poll);
}
