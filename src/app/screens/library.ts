import { api, assetUrl, pickImage } from '../api.js';
import { gameArt } from '../art.js';
import { sfx } from '../audio.js';
import { errorMessage, t } from '../i18n.js';
import { pushInput } from '../input.js';
import { launchGame } from '../launcher.js';
import { go, type ScreenFactory } from '../router.js';
import { consoleById, gamesOf, lastPlayedGame, on, refreshLibrary, statOf, store } from '../state.js';
import type { Game } from '../types.js';
import { fmtAgo, fmtDuration, fmtSize, h, icon, toast } from '../ui.js';

type Sort = 'smart' | 'az' | 'played';
const SORTS: Sort[] = ['smart', 'az', 'played'];
const SORT_KEY = 'gamehub-sort';
const WINDOW = 4;

function loadSort(): Sort {
  try {
    const saved = localStorage.getItem(SORT_KEY) as Sort | null;
    if (saved && SORTS.includes(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'smart';
}

function saveSort(sort: Sort): void {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    /* ignore */
  }
}

function sortGames(games: Game[], sort: Sort, consoleId: string | null): Game[] {
  const list = [...games].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  if (sort === 'played') list.sort((a, b) => statOf(b).seconds - statOf(a).seconds);
  if (sort === 'smart') {
    const last = lastPlayedGame(consoleId);
    if (last) {
      const at = list.findIndex((g) => g.key === last.key);
      if (at > 0) list.unshift(list.splice(at, 1)[0]);
    }
  }
  return list;
}

interface StateAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

function statePanel(symbol: string, title: string, text: string, actions: StateAction[]) {
  const buttons = actions.map((a) => h('button', { class: `btn ${a.primary ? 'btn-primary' : 'btn-ghost'}`, type: 'button', onclick: a.run }, a.label));
  const el = h('div', { class: 'state-panel glass' }, h('div', { class: 'state-icon' }, icon(symbol, 34)), h('h2', null, title), h('p', null, text), h('div', { class: 'state-actions' }, buttons));
  return { el, buttons };
}

export const libraryScreen: ScreenFactory = ({ host, params }) => {
  const consoleId = params[0] ?? null;
  const cfg = consoleId ? consoleById(consoleId) : null;
  let sort = loadSort();
  let list: Game[] = [];
  let index = 0;
  let focusButton = 0;
  const els = new Map<number, HTMLElement>();
  let stateButtons: HTMLElement[] = [];
  let launching = false;

  const heading = h('h1', null, '');
  const sortChip = h('button', { class: 'sort-chip', type: 'button', onclick: () => cycleSort() });
  const flow = h('div', { class: 'coverflow' });
  const detail = h('div', { class: 'game-detail' });
  const stage = h('div', { class: 'library-stage' });
  const flowSection = h('section', { class: 'coverflow-section' }, flow);

  host.append(h('div', { class: 'heading heading-split' }, h('div', null, h('div', { class: 'heading-small' }, t('lib.eyebrow')), heading), sortChip), stage);
  stage.append(flowSection, detail);

  // ---------- states with nothing to browse ----------

  function showState(panel: ReturnType<typeof statePanel>) {
    flowSection.hidden = true;
    detail.hidden = true;
    sortChip.hidden = true;
    stage.querySelector('.state-panel')?.remove();
    stage.appendChild(panel.el);
    stateButtons = panel.buttons;
    focusButton = Math.max(0, panel.buttons.findIndex((b) => b.classList.contains('btn-primary')));
    panel.buttons[focusButton]?.classList.add('is-focus');
    heading.textContent = (cfg?.title ?? t('lib.all')).toUpperCase();
  }

  function hideState() {
    stage.querySelector('.state-panel')?.remove();
    stateButtons = [];
    flowSection.hidden = false;
    detail.hidden = false;
    sortChip.hidden = false;
  }

  const toSettings = () => go('/settings/consoles');
  const rescan = async () => {
    toast(t('lib.scanning'));
    await refreshLibrary();
  };

  // ---------- coverflow ----------

  const offsetOf = (i: number) => {
    const n = list.length;
    let o = i - index;
    if (o > n / 2) o -= n;
    if (o < -n / 2) o += n;
    return o;
  };

  const makeCover = (game: Game, i: number) => {
    const isLast = sort === 'smart' && i === 0 && lastPlayedGame(consoleId)?.key === game.key;
    const el = h(
      'article',
      { class: 'cover', onclick: () => (offsetOf(i) === 0 ? play() : move(offsetOf(i))) },
      h('div', { class: 'cover-shadow' }),
      h('div', { class: 'cover-image' }, gameArt(game, assetUrl('Covers', game.cover)), h('div', { class: 'image-dark' })),
      h('div', { class: 'cover-info' }, h('div', { class: `cover-number ${isLast ? 'last-played-badge' : ''}` }, isLast ? t('lib.lastGame') : String(i + 1).padStart(2, '0')), h('div', { class: 'cover-title' }, game.title)),
    );
    return el;
  };

  const update = () => {
    const wanted = new Set<number>();
    for (let i = 0; i < list.length; i++) if (Math.abs(offsetOf(i)) <= WINDOW) wanted.add(i);
    for (const [i, el] of els) {
      if (!wanted.has(i)) {
        el.remove();
        els.delete(i);
      }
    }
    for (const i of wanted) {
      let el = els.get(i);
      if (!el) {
        el = makeCover(list[i], i);
        flow.appendChild(el);
        els.set(i, el);
      }
      el.dataset.position = String(offsetOf(i));
    }
    renderDetail();
  };

  const renderDetail = () => {
    const game = list[index];
    if (!game) return;
    const stat = statOf(game);
    detail.replaceChildren(
      h(
        'div',
        { class: 'detail-main' },
        h('strong', { class: 'detail-title' }, game.title),
        consoleId ? null : h('span', { class: 'chip chip-accent' }, game.consoleTitle),
        game.region ? h('span', { class: 'chip' }, game.region) : null,
        h('span', { class: 'detail-stat' }, stat.seconds ? t('lib.played', { time: fmtDuration(stat.seconds), n: stat.launches }) : t('lib.neverPlayed')),
        stat.lastPlayed ? h('span', { class: 'detail-stat muted' }, t('lib.lastTime', { when: fmtAgo(stat.lastPlayed) })) : null,
        game.size ? h('span', { class: 'detail-stat muted' }, fmtSize(game.size)) : null,
      ),
      h('div', { class: 'detail-count' }, `${index + 1} / ${list.length}`),
    );
  };

  const renderSort = () => {
    sortChip.replaceChildren(h('span', { class: 'glyph glyph-pad tone-yellow' }, 'Y'), h('span', { class: 'glyph glyph-kbd' }, 'Y'), h('span', null, t('lib.sort', { mode: t(`lib.sort.${sort}`) })));
  };

  // ---------- (re)build ----------

  const build = (keepKey?: string) => {
    const configured = cfg ? Boolean(cfg.emulatorPath && cfg.romPath) : true;
    hideState();
    for (const el of els.values()) el.remove();
    els.clear();

    heading.textContent = (cfg ? cfg.title : t('lib.all')).toUpperCase();

    if (consoleId && !cfg) return showState(statePanel('alert', t('lib.unknownConsole'), t('lib.unknownConsoleText'), [{ label: t('common.home'), primary: true, run: () => go('/') }]));
    if (store.settings.consoles.length === 0) return showState(statePanel('plus', t('lib.noConsoles'), t('lib.noConsolesText'), [{ label: t('home.addConsole'), primary: true, run: () => go('/settings/consoles?add=1') }]));
    if (cfg && !configured) return showState(statePanel('gear', t('lib.notConfigured', { name: cfg.title }), t('lib.notConfiguredText'), [{ label: t('lib.openSettings'), primary: true, run: toSettings }]));
    if (cfg && store.scanErrors[cfg.id]) {
      const [, detailText = ''] = store.scanErrors[cfg.id].split('|');
      return showState(statePanel('folder', t('lib.folderMissing'), t('lib.folderMissingText', { path: detailText }), [{ label: t('lib.openSettings'), primary: true, run: toSettings }, { label: t('lib.rescan'), run: () => void rescan() }]));
    }

    list = sortGames(gamesOf(consoleId), sort, consoleId);
    if (list.length === 0) {
      const text = cfg ? t('lib.noGamesText', { path: cfg.romPath, ext: cfg.extensions.join(', ') }) : t('lib.noGamesAll');
      return showState(statePanel('folder', t('lib.noGames'), text, [{ label: t('lib.rescan'), primary: true, run: () => void rescan() }, { label: t('lib.openSettings'), run: toSettings }]));
    }
    const at = keepKey ? list.findIndex((g) => g.key === keepKey) : -1;
    index = at >= 0 ? at : 0;
    renderSort();
    update();
  };

  // ---------- actions ----------

  function move(step: number) {
    if (launching || list.length < 2) return;
    sfx('move');
    index = (((index + step) % list.length) + list.length) % list.length;
    update();
  }

  function play() {
    const game = list[index];
    if (!game || launching) return;
    launching = true;
    void launchGame(game).finally(() => {
      launching = false;
    });
  }

  function cycleSort() {
    if (!list.length) return;
    sfx('select');
    const key = list[index]?.key;
    sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length];
    saveSort(sort);
    build(key);
    toast(t('lib.sort', { mode: t(`lib.sort.${sort}`) }));
  }

  async function changeCover() {
    const game = list[index];
    if (!game) return;
    sfx('select');
    const path = await pickImage(t('lib.pickCover'));
    if (!path) return;
    try {
      await api.setGameCover(game.consoleId, game.relPath, path);
      await refreshLibrary();
      toast(t('lib.coverSaved'), 'ok');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  function jumpConsole(step: number) {
    const ids = store.settings.consoles.map((c) => c.id);
    if (store.settings.consoles.length > 1) ids.push('');
    if (ids.length < 2) return;
    const at = ids.indexOf(consoleId ?? '');
    const next = ids[(at + step + ids.length) % ids.length];
    sfx('move');
    go(next ? `/library/${encodeURIComponent(next)}` : '/library');
  }

  const release = pushInput((action) => {
    if (launching) return true;
    if (stateButtons.length) {
      if (action === 'left' || action === 'right') {
        stateButtons[focusButton]?.classList.remove('is-focus');
        focusButton = Math.min(stateButtons.length - 1, Math.max(0, focusButton + (action === 'right' ? 1 : -1)));
        stateButtons[focusButton].classList.add('is-focus');
        sfx('move');
        return true;
      }
      if (action === 'confirm') {
        sfx('select');
        stateButtons[focusButton]?.click();
        return true;
      }
      if (action === 'y') {
        void rescan();
        return true;
      }
    }
    switch (action) {
      case 'right': move(1); return true;
      case 'left': move(-1); return true;
      case 'confirm': if (list.length) play(); return true;
      case 'back': sfx('back'); go('/'); return true;
      case 'x': void changeCover(); return true;
      case 'y': cycleSort(); return true;
      case 'rb': jumpConsole(1); return true;
      case 'lb': jumpConsole(-1); return true;
      case 'start': sfx('select'); go('/settings'); return true;
      default: return false;
    }
  });

  let wheelLock = 0;
  const onWheel = (event: WheelEvent) => {
    if (Date.now() - wheelLock < 140) return;
    wheelLock = Date.now();
    move(event.deltaY > 0 || event.deltaX > 0 ? 1 : -1);
  };
  flowSection.addEventListener('wheel', onWheel, { passive: true });

  const unsubscribe = [
    on('library', () => build(list[index]?.key)),
    on('stats', () => {
      if (list.length) renderDetail();
    }),
  ];

  build();

  const hints = stateButtons.length
    ? [
        { pad: 'A', kbd: 'Enter', label: t('hint.select'), tone: 'green' as const },
        { pad: 'B', kbd: 'Esc', label: t('hint.back'), tone: 'red' as const },
      ]
    : [
        { pad: '◂▸', kbd: '← →', label: t('hint.browse') },
        { pad: 'A', kbd: 'Enter', label: t('hint.play'), tone: 'green' as const },
        { pad: 'B', kbd: 'Esc', label: t('hint.back'), tone: 'red' as const },
        { pad: 'X', kbd: 'X', label: t('hint.cover'), tone: 'blue' as const },
        ...(store.settings.consoles.length > 1 ? [{ pad: 'LB/RB', kbd: 'Q/E', label: t('hint.console') }] : []),
      ];

  return {
    hints,
    destroy() {
      release();
      unsubscribe.forEach((fn) => fn());
      flowSection.removeEventListener('wheel', onWheel);
    },
  };
};
