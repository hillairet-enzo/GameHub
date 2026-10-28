// Dialogs that work with keyboard, mouse and gamepad.
//
// Focusable elements carry `data-focus` and live inside a `.m-row`. Up/down move
// between rows, left/right move inside a row.

import { pushInput, type Action } from './input.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';
import { h, type Child } from './ui.js';

export interface ModalButton {
  label: string;
  kind?: 'primary' | 'danger' | 'ghost';
  /** Return false to keep the dialog open. */
  onClick?: () => boolean | void | Promise<boolean | void>;
}

export interface ModalOptions {
  title: string;
  message?: string;
  body?: HTMLElement;
  buttons: ModalButton[];
  wide?: boolean;
  /** Element to focus first. Defaults to the first button. */
  initialFocus?: () => HTMLElement | null;
  /** Called on Back/Escape. Return false to keep the dialog open. */
  onBack?: () => boolean | void;
}

export interface ModalHandle {
  el: HTMLElement;
  close: () => void;
  focus: (el: HTMLElement) => void;
}

function rowsOf(root: HTMLElement): HTMLElement[][] {
  const rows: HTMLElement[][] = [];
  const index = new Map<Element, number>();
  root.querySelectorAll<HTMLElement>('[data-focus]').forEach((el) => {
    if ((el as HTMLButtonElement).disabled || el.closest('[hidden]')) return;
    const row = el.closest('.m-row') ?? el.parentElement!;
    if (!index.has(row)) {
      index.set(row, rows.length);
      rows.push([]);
    }
    rows[index.get(row)!].push(el);
  });
  return rows;
}

export function openModal(options: ModalOptions): ModalHandle {
  const layer = document.getElementById('layer-modal')!;
  const buttonEls = options.buttons.map((button) =>
    h('button', { class: `btn btn-${button.kind ?? 'ghost'}`, type: 'button', 'data-focus': '' }, button.label),
  );
  const card = h(
    'div',
    { class: `modal ${options.wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title },
    h('h3', { class: 'modal-title' }, options.title),
    options.message ? h('p', { class: 'modal-message' }, options.message) : null,
    options.body ?? null,
    h('div', { class: 'm-row modal-actions', 'data-enter': 'last' }, buttonEls),
  );
  const overlay = h('div', { class: 'modal-overlay' }, card);
  layer.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-in'));

  let current: HTMLElement | null = null;
  let closed = false;

  const focus = (el: HTMLElement) => {
    current?.classList.remove('is-focus');
    current = el;
    el.classList.add('is-focus');
    el.focus({ preventScroll: false });
  };

  const close = () => {
    if (closed) return;
    closed = true;
    release();
    overlay.classList.remove('is-in');
    setTimeout(() => overlay.remove(), 220);
  };

  options.buttons.forEach((button, i) => {
    buttonEls[i].addEventListener('click', async () => {
      sfx(button.kind === 'ghost' ? 'back' : 'select');
      const result = await button.onClick?.();
      if (result !== false) close();
    });
  });

  card.addEventListener('focusin', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-focus]');
    if (target && target !== current) {
      current?.classList.remove('is-focus');
      current = target;
      target.classList.add('is-focus');
    }
  });

  const move = (action: Action) => {
    const rows = rowsOf(card);
    if (!rows.length) return;
    let r = rows.findIndex((row) => current && row.includes(current));
    if (r < 0) r = 0;
    let i = Math.max(0, rows[r].indexOf(current as HTMLElement));
    if (action === 'left') i = Math.max(0, i - 1);
    else if (action === 'right') i = Math.min(rows[r].length - 1, i + 1);
    else {
      const nr = Math.min(rows.length - 1, Math.max(0, r + (action === 'down' ? 1 : -1)));
      if (nr === r) return;
      r = nr;
      i = rows[r][0].closest('.m-row')?.getAttribute('data-enter') === 'last' && action === 'down' ? rows[r].length - 1 : Math.min(i, rows[r].length - 1);
    }
    const next = rows[r][i];
    if (next !== current) {
      sfx('move');
      focus(next);
    }
  };

  const release = pushInput((action, event) => {
    if (closed) return true;
    const typing = event && (event.target as HTMLElement).tagName === 'INPUT';
    if (action === 'back') {
      sfx('back');
      if (options.onBack?.() !== false) close();
      return true;
    }
    if (action === 'confirm') {
      if (typing) {
        // Enter inside a text field submits the dialog.
        const primary = buttonEls[options.buttons.findIndex((b) => b.kind === 'primary' || b.kind === 'danger')];
        primary?.click();
        return true;
      }
      current?.click();
      return true;
    }
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      move(action);
      return true;
    }
    return true; // swallow everything else while a dialog is open
  });

  const first = options.initialFocus?.() ?? buttonEls[Math.max(0, options.buttons.findIndex((b) => b.kind === 'primary' || b.kind === 'danger'))] ?? buttonEls[0];
  setTimeout(() => first && focus(first), 30);

  return { el: card, close, focus };
}

export function confirmDialog(opts: { title: string; message: string; confirm: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const done = (value: boolean) => {
      if (!answered) {
        answered = true;
        resolve(value);
      }
    };
    const handle = openModal({
      title: opts.title,
      message: opts.message,
      buttons: [
        { label: opts.cancel ?? t('common.cancel'), kind: 'ghost', onClick: () => done(false) },
        { label: opts.confirm, kind: opts.danger ? 'danger' : 'primary', onClick: () => done(true) },
      ],
      initialFocus: () => null,
      onBack: () => {
        done(false);
      },
    });
    // Destructive questions start on "Cancel".
    const buttons = handle.el.querySelectorAll<HTMLElement>('.modal-actions .btn');
    setTimeout(() => handle.focus(opts.danger ? buttons[0] : buttons[1]), 40);
  });
}

export function promptDialog(opts: { title: string; label: string; value?: string; placeholder?: string; maxLength?: number }): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { class: 'field-input', type: 'text', value: opts.value ?? '', placeholder: opts.placeholder ?? '', spellcheck: false, autocomplete: 'off', 'data-focus': '', maxlength: opts.maxLength ?? 120 });
    let answered = false;
    const done = (value: string | null) => {
      if (!answered) {
        answered = true;
        resolve(value);
      }
    };
    openModal({
      title: opts.title,
      body: h('div', { class: 'm-row field' }, h('label', { class: 'field-label' }, opts.label), input),
      buttons: [
        { label: t('common.cancel'), kind: 'ghost', onClick: () => done(null) },
        { label: t('common.save'), kind: 'primary', onClick: () => done(input.value) },
      ],
      initialFocus: () => input,
      onBack: () => {
        done(null);
      },
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  });
}

export function infoDialog(title: string, message: string, extra?: Child): Promise<void> {
  return new Promise((resolve) => {
    openModal({
      title,
      message,
      body: extra ? h('div', { class: 'modal-extra' }, extra) : undefined,
      buttons: [{ label: t('common.ok'), kind: 'primary', onClick: () => resolve() }],
      onBack: () => resolve(),
    });
  });
}

