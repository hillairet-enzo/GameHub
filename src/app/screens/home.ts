import { api, isTauri } from '../api.js';
import { gameArt } from '../art.js';
import { sfx } from '../audio.js';
import { consoleEmblem } from '../emblem.js';
import { t } from '../i18n.js';
import { pushInput } from '../input.js';
import { launchGame } from '../launcher.js';
import { confirmDialog } from '../modal.js';
import { go, setMood, type ScreenFactory } from '../router.js';
import { assetUrl } from '../api.js';
import { consoleTotals, lastPlayedGame, on, store } from '../state.js';
import type { Console } from '../types.js';
import { fmtDuration, h, icon } from '../ui.js';

interface Card {
  id: string;
  kind: 'console' | 'all' | 'add' | 'settings';
  title: string;
  meta: string;
  console?: Console;
}

let lastCardId: string | null = null;

function buildCards(): Card[] {
  const { consoles } = store.settings;
  const cards: Card[] = consoles.map((c) => {
    const totals = consoleTotals(c.id);
    const configured = c.emulatorPath && c.romPath;
    return {
      id: `console:${c.id}`,
      kind: 'console',
      title: c.title,
      console: c,
      meta: !configured ? t('home.notConfigured') : `${t('home.games', { n: totals.count })}${totals.seconds ? ' · ' + fmtDuration(totals.seconds) : ''}`,
    };
  });
  if (consoles.length > 1) cards.push({ id: 'all', kind: 'all', title: t('home.allGames'), meta: t('home.games', { n: store.games.length }) });
  const add: Card = { id: 'add', kind: 'add', title: t('home.addConsole'), meta: t('home.addConsoleMeta') };
  if (consoles.length === 0) cards.unshift(add);
  else cards.push(add);
  cards.push({ id: 'settings', kind: 'settings', title: t('home.settings'), meta: t('home.settingsMeta') });
  return cards;
}

export const homeScreen: ScreenFactory = ({ host }) => {
  const firstRun = store.settings.consoles.length === 0;
  const eyebrow = h('div', { class: 'heading-small' }, t('home.eyebrow'));
  const title = h('h1', null, '');
  const track = h('div', { class: 'carousel-track' });
  const section = h('section', { class: 'carousel-section' }, track);
  const resume = h('div', { class: 'resume-slot' });
  const note = h('p', { class: 'home-note' }, firstRun ? t('home.firstRun') : '');

  host.append(h('div', { class: 'heading' }, eyebrow, title), section, note, resume);

  let cards = buildCards();
  let index = Math.max(0, cards.findIndex((c) => c.id === lastCardId));
  let busy = false;

  const cardEl = (card: Card, i: number) => {
    let art: HTMLElement;
    if (card.kind === 'console' && card.console) art = consoleEmblem(card.console, 'emblem-lg');
    else art = h('div', { class: `emblem emblem-lg emblem-symbol kind-${card.kind}` }, h('div', { class: 'emblem-orb' }, icon(card.kind === 'settings' ? 'gear' : card.kind === 'add' ? 'plus' : 'grid', 46)));
    return h(
      'div',
      { class: `menu-card kind-${card.kind}`, role: 'button', 'data-index': String(i), onclick: () => (i === index ? open() : select(i)) },
      h('div', { class: 'card-art' }, art),
      h('div', { class: 'card-content' }, h('h2', { class: 'card-title' }, card.title), h('p', { class: 'card-meta' }, card.meta)),
      h('div', { class: 'card-glow' }),
    );
  };

  const place = () => {
    const els = Array.from(track.children) as HTMLElement[];
    const active = els[index];
    if (!active) return;
    els.forEach((el, i) => el.classList.toggle('active', i === index));
    const offset = section.clientWidth / 2 - (active.offsetLeft + active.offsetWidth / 2);
    track.style.transform = `translateX(${offset}px)`;
    const card = cards[index];
    title.textContent = firstRun && card.kind === 'add' ? t('home.welcome', { name: store.settings.profile.username }) : card.title.toUpperCase();
    setMood(card.kind === 'settings' ? 'system' : 'default');
    lastCardId = card.id;
  };

  const renderResume = () => {
    const game = lastPlayedGame();
    resume.replaceChildren();
    if (!game) return;
    const stat = store.stats.games[game.key];
    resume.appendChild(
      h(
        'button',
        { class: 'resume', type: 'button', onclick: () => void launchGame(game) },
        h('div', { class: 'resume-cover' }, gameArt(game, assetUrl('Covers', game.cover))),
        h('div', { class: 'resume-text' }, h('small', null, t('home.resume')), h('strong', null, game.title), h('span', null, `${game.consoleTitle} · ${fmtDuration(stat?.seconds ?? 0)}`)),
        h('span', { class: 'glyph glyph-pad tone-yellow' }, 'Y'),
        h('span', { class: 'glyph glyph-kbd' }, 'Y'),
      ),
    );
  };

  const render = () => {
    cards = buildCards();
    index = Math.min(index, cards.length - 1);
    track.replaceChildren(...cards.map(cardEl));
    renderResume();
    requestAnimationFrame(place);
  };

  function select(i: number) {
    if (busy || i === index || i < 0 || i >= cards.length) return;
    sfx('move');
    index = i;
    place();
  }

  function open() {
    if (busy) return;
    const card = cards[index];
    busy = true;
    sfx('select');
    (track.children[index] as HTMLElement).classList.add('card-clicked');
    setTimeout(() => {
      busy = false;
      if (card.kind === 'console') go(`/library/${encodeURIComponent(card.console!.id)}`);
      else if (card.kind === 'all') go('/library');
      else if (card.kind === 'add') go('/settings/consoles?add=1');
      else go('/settings');
    }, 380);
  }

  async function askQuit() {
    if (!isTauri) return;
    sfx('back');
    if (await confirmDialog({ title: t('home.quitTitle'), message: t('home.quitMessage'), confirm: t('home.quit') })) void api.quit();
  }

  const release = pushInput((action) => {
    if (busy) return true;
    if (action === 'right') select(index + 1);
    else if (action === 'left') select(index - 1);
    else if (action === 'confirm') open();
    else if (action === 'back') void askQuit();
    else if (action === 'start') go('/settings');
    else if (action === 'y') {
      const game = lastPlayedGame();
      if (game) void launchGame(game);
    } else return false;
    return true;
  });

  const onResize = () => place();
  window.addEventListener('resize', onResize);
  const unsubscribe = [on('stats', render), on('library', render), on('settings', render)];
  render();

  return {
    hints: [
      { pad: '◂▸', kbd: '← →', label: t('hint.navigate') },
      { pad: 'A', kbd: 'Enter', label: t('hint.select'), tone: 'green' },
      ...(lastPlayedGame() ? [{ pad: 'Y', kbd: 'Y', label: t('hint.resume'), tone: 'yellow' as const }] : []),
      { pad: '≡', kbd: 'M', label: t('hint.settings') },
    ],
    destroy() {
      release();
      window.removeEventListener('resize', onResize);
      unsubscribe.forEach((fn) => fn());
    },
  };
};
