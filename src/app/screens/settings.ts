import { api, assetUrl, baseName, isTauri, pickExecutable, pickFolder, pickImage } from '../api.js';
import { sfx } from '../audio.js';
import { addConsoleWizard } from '../consoleEditor.js';
import { consoleEmblem } from '../emblem.js';
import { errorMessage, t } from '../i18n.js';
import { pad, pushInput } from '../input.js';
import { confirmDialog, promptDialog } from '../modal.js';
import { DEFAULT_CUSTOM, GENERATED_THEMES, isHex, swatchOf } from '../color.js';
import { go, reload, type ScreenFactory } from '../router.js';
import { openTutorial } from '../tutorial.js';
import { consoleTotals, on, refreshLibrary, store, updateSettings } from '../state.js';
import type { LanguagePref, ThemeId } from '../types.js';
import { clear, fmtDuration, h, icon, toast, type Child } from '../ui.js';
import { gameArt } from '../art.js';

interface Item {
  el: HTMLElement;
  run?: () => void | Promise<void>;
  left?: () => boolean;
  right?: () => boolean;
  secondary?: () => void;
}

interface PanelView {
  el: HTMLElement;
  items: Item[];
  grid?: HTMLElement;
}

const THEMES: ThemeId[] = ['ocean', 'matrix', 'cyberpunk', 'midnight', 'sunset', 'rose', 'violet', 'lagoon', 'gold', 'custom'];
const HAND_MADE: Partial<Record<ThemeId, [string, string]>> = {
  ocean: ['#041222', '#38bdf8'],
  matrix: ['#010a01', '#22c55e'],
  cyberpunk: ['#170220', '#d946ef'],
  midnight: ['#09090b', '#94a3b8'],
};
const LANGS: LanguagePref[] = ['auto', 'fr', 'en'];

/** Lets the screen come back where it was after it is rebuilt for a new language. */
let restore: { id: string; focus: number } | null = null;

const head = (title: string, desc: string) => h('header', { class: 'panel-head' }, h('h2', null, title), h('p', null, desc));
const row = (label: string, value: Child, className = '') => h('div', { class: `setting-row ${className}` }, h('div', { class: 'row-label' }, label), h('div', { class: 'row-value' }, value));
const mono = (text: string, empty = false) => h('span', { class: `mono ${empty ? 'muted' : ''}` }, text);

function cycle<T>(list: T[], current: T, step: number): T {
  return list[(list.indexOf(current) + step + list.length) % list.length];
}

export const settingsScreen: ScreenFactory = ({ host, params, query }) => {
  const menu = [
    { id: 'consoles', icon: 'database', label: t('settings.consoles') },
    { id: 'profile', icon: 'user', label: t('settings.profile') },
    { id: 'appearance', icon: 'palette', label: t('settings.appearance') },
    { id: 'audio', icon: 'volume', label: t('settings.audio') },
    { id: 'covers', icon: 'image', label: t('settings.covers') },
    { id: 'help', icon: 'help', label: t('settings.help') },
    { id: 'about', icon: 'info', label: t('settings.about') },
  ];

  const resumed = restore;
  restore = null;
  let menuIndex = Math.max(0, menu.findIndex((m) => m.id === (resumed?.id ?? params[0])));
  let zone: 'menu' | 'panel' = resumed ? 'panel' : 'menu';
  let focus = resumed?.focus ?? 0;
  let view: PanelView = { el: h('div'), items: [] };
  let alive = true;

  const menuEls = menu.map((m, i) => h('button', { class: 'menu-item', type: 'button', onclick: () => (zone === 'menu' && i === menuIndex ? enterPanel() : selectMenu(i, true)) }, icon(m.icon, 20), h('span', null, m.label)));
  const content = h('div', { class: 'settings-content glass' });
  host.append(h('div', { class: 'heading' }, h('h1', null, t('settings.title'))), h('section', { class: 'settings-container' }, h('nav', { class: 'settings-menu', 'aria-label': t('settings.title') }, menuEls), content));

  // ---------- focus ----------

  const setFocus = (i: number, scroll = true) => {
    view.items[focus]?.el.classList.remove('is-focus');
    focus = Math.max(0, Math.min(view.items.length - 1, i));
    const item = view.items[focus];
    if (!item) return;
    item.el.classList.add('is-focus');
    if (scroll) item.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth' });
  };

  const paintZone = () => {
    menuEls.forEach((el, i) => {
      el.classList.toggle('active', i === menuIndex);
      el.classList.toggle('dim', zone === 'panel' && i !== menuIndex);
    });
    view.items.forEach((item, i) => item.el.classList.toggle('is-focus', zone === 'panel' && i === focus));
  };

  const columns = () => (view.grid ? Math.max(1, getComputedStyle(view.grid).gridTemplateColumns.split(' ').length) : 1);

  // ---------- panels ----------

  const wire = (items: Item[]) => {
    items.forEach((item, i) => {
      item.el.classList.add('selectable');
      item.el.addEventListener('click', () => {
        zone = 'panel';
        paintZone();
        setFocus(i, false);
        sfx('select');
        void item.run?.();
      });
    });
    return items;
  };

  async function mutate(action: () => Promise<void>, keepFocus = true) {
    try {
      await action();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
    const at = focus;
    showPanel(menuIndex, keepFocus ? at : 0);
  }

  function consolesPanel(): PanelView {
    const items: Item[] = [];
    const el = h('div', { class: 'panel' }, head(t('settings.consoles.title'), t('settings.consoles.desc')));

    const add = row(t('settings.addConsole'), icon('plus', 20), 'row-add');
    items.push({ el: add, run: async () => {
      if (await addConsoleWizard()) showPanel(menuIndex, 0);
    } });
    el.appendChild(add);

    if (!store.settings.consoles.length) el.appendChild(h('p', { class: 'panel-empty' }, t('settings.noConsoles')));

    for (const c of store.settings.consoles) {
      const totals = consoleTotals(c.id);
      const rows: Item[] = [];
      const mk = (label: string, value: HTMLElement, run: () => Promise<void>, className = '') => {
        const item: Item = { el: row(label, value, className), run };
        rows.push(item);
        return item.el;
      };
      const card = h(
        'div',
        { class: 'console-card' },
        h('div', { class: 'console-card-head' }, consoleEmblem(c, 'emblem-sm'), h('div', null, h('h3', null, c.title), h('p', null, store.scanErrors[c.id] ? t('settings.folderProblem') : t('home.games', { n: totals.count })))),
        mk(t('settings.emulator'), mono(c.emulatorPath ? baseName(c.emulatorPath) : t('home.notConfigured'), !c.emulatorPath), () =>
          mutate(async () => {
            const path = await pickExecutable(t('wizard.emulator'));
            if (!path) return;
            const guess = !c.args || c.args === '{rom}' ? await api.guessArgs(path) : null;
            await updateSettings((s) => {
              const target = s.consoles.find((x) => x.id === c.id)!;
              target.emulatorPath = path;
              if (guess) target.args = guess;
            });
          }),
        ),
        mk(t('settings.romFolder'), mono(c.romPath || t('home.notConfigured'), !c.romPath), () =>
          mutate(async () => {
            const path = await pickFolder(t('wizard.romFolder'));
            if (!path) return;
            await updateSettings((s) => (s.consoles.find((x) => x.id === c.id)!.romPath = path));
            await refreshLibrary();
          }),
        ),
        mk(t('settings.args'), mono(c.args || '{rom}'), () =>
          mutate(async () => {
            const value = await promptDialog({ title: t('settings.args'), label: t('wizard.argsHint'), value: c.args, placeholder: '{rom}' });
            if (value === null) return;
            await updateSettings((s) => (s.consoles.find((x) => x.id === c.id)!.args = value.trim() || '{rom}'));
          }),
        ),
        mk(t('settings.extensions'), mono(c.extensions.join(', ')), () =>
          mutate(async () => {
            const value = await promptDialog({ title: t('settings.extensions'), label: t('settings.extensionsHint'), value: c.extensions.join(', '), placeholder: 'iso, chd' });
            if (value === null) return;
            await updateSettings((s) => (s.consoles.find((x) => x.id === c.id)!.extensions = value.split(/[\s,;]+/).filter(Boolean)));
            await refreshLibrary();
          }),
        ),
        mk(t('settings.image'), mono(c.image ? t('settings.imageCustom') : t('settings.imageDefault'), !c.image), () =>
          mutate(async () => {
            const path = await pickImage(t('wizard.image'));
            if (!path) return;
            const name = await api.setImage('console', c.id, path);
            await updateSettings((s) => (s.consoles.find((x) => x.id === c.id)!.image = name));
          }),
        ),
        mk(t('settings.remove'), icon('trash', 18), () =>
          mutate(async () => {
            const ok = await confirmDialog({ title: t('settings.removeTitle', { name: c.title }), message: t('settings.removeText'), confirm: t('settings.removeConfirm'), danger: true });
            if (!ok) return;
            await updateSettings((s) => (s.consoles = s.consoles.filter((x) => x.id !== c.id)));
            await refreshLibrary();
          }, false),
        'row-danger'),
      );
      el.appendChild(card);
      items.push(...rows);
    }
    return { el, items };
  }

  function profilePanel(): PanelView {
    const { profile } = store.settings;
    const bannerUrl = assetUrl('Images', profile.banner);
    const avatarUrl = assetUrl('Images', profile.avatar);
    const banner = h('div', { class: 'profile-banner', style: bannerUrl ? `background-image:url("${bannerUrl}")` : '' }, h('span', { class: 'banner-edit' }, icon('camera', 14), t('settings.changeBanner')));
    const avatar = h('div', { class: 'profile-avatar' }, avatarUrl ? h('img', { src: avatarUrl, alt: '' }) : h('span', null, (profile.username[0] ?? '?').toUpperCase()), h('span', { class: 'edit-badge' }, icon('camera', 15)));
    const name = h('div', { class: 'profile-name' }, h('h2', null, profile.username), icon('edit', 16));
    const time = store.stats.totalSeconds;
    const stat = (label: string, value: string) => h('div', { class: 'stat-box' }, h('small', null, label), h('strong', null, value));

    const ranked = Object.entries(store.stats.games)
      .sort((a, b) => b[1].seconds - a[1].seconds)
      .map(([key, s]) => ({ game: store.games.find((g) => g.key === key), s }))
      .filter((x) => x.game)
      .slice(0, 3);

    const el = h(
      'div',
      { class: 'panel panel-profile' },
      banner,
      h('div', { class: 'profile-header' }, avatar, name),
      h('div', { class: 'stats-row' }, stat(t('settings.totalTime'), fmtDuration(time)), stat(t('settings.sessions'), String(store.stats.totalSessions)), stat(t('settings.library'), t('home.games', { n: store.games.length }))),
      ranked.length
        ? h('div', { class: 'top-games' }, h('h3', null, t('settings.mostPlayed')), ranked.map(({ game, s }) => h('div', { class: 'top-game' }, h('div', { class: 'top-cover' }, gameArt(game!, assetUrl('Covers', game!.cover))), h('div', null, h('strong', null, game!.title), h('span', null, `${game!.consoleTitle} · ${fmtDuration(s.seconds)}`)))))
        : null,
    );

    const pickProfileImage = (kind: 'avatar' | 'banner') => () =>
      mutate(async () => {
        const path = await pickImage(t('settings.pickImage'));
        if (!path) return;
        const file = await api.setImage(kind, '', path);
        await updateSettings((s) => (s.profile[kind] = file));
      });
    const clearProfileImage = (kind: 'avatar' | 'banner') => () => void mutate(async () => void (await updateSettings((s) => (s.profile[kind] = null))));

    return {
      el,
      items: [
        { el: banner, run: pickProfileImage('banner'), secondary: clearProfileImage('banner') },
        { el: avatar, run: pickProfileImage('avatar'), secondary: clearProfileImage('avatar') },
        {
          el: name,
          run: () =>
            mutate(async () => {
              const value = await promptDialog({ title: t('settings.username'), label: t('settings.usernameLabel'), value: profile.username, maxLength: 32 });
              if (value === null || !value.trim()) return;
              await updateSettings((s) => (s.profile.username = value.trim()));
            }),
        },
      ],
    };
  }

  function toggleItem(label: string, hint: string, get: () => boolean, set: (value: boolean) => Promise<void>): Item {
    const sw = h('span', { class: 'switch', 'data-on': String(get()) }, h('i'));
    const flip = async () => {
      const next = !get();
      await set(next);
      sw.dataset.on = String(next);
    };
    return { el: h('div', { class: 'setting-row' }, h('div', { class: 'row-label' }, label, h('small', null, hint)), sw), run: flip, left: () => (get() ? (void flip(), true) : false), right: () => (!get() ? (void flip(), true) : false) };
  }

  function appearancePanel(): PanelView {
    const ui = () => store.settings.ui;
    // ----- theme: hand-made palettes, generated ones, and a custom colour -----
    const themeRow = h('div', { class: 'swatches swatches-sm' });
    const themeName = h('span', { class: 'row-value-text' });
    const picker = h('input', { type: 'color', class: 'color-input', tabindex: -1, 'aria-hidden': 'true' }) as HTMLInputElement;
    const customColour = () => (isHex(ui().accent) ? ui().accent : DEFAULT_CUSTOM);
    const swatchOf2 = (id: ThemeId): [string, string] => HAND_MADE[id] ?? swatchOf(id === 'custom' ? customColour() : GENERATED_THEMES[id]);
    const paintTheme = () => {
      themeRow.replaceChildren(
        ...THEMES.map((id) => {
          const [dark, colour] = swatchOf2(id);
          return h('button', { class: `swatch ${id === 'custom' ? 'swatch-custom' : ''} ${ui().theme === id ? 'is-on' : ''}`, type: 'button', tabindex: -1, style: `--s1:${dark};--s2:${colour}`, title: t(`theme.${id}`), onclick: () => void chooseTheme(id).then(() => id === 'custom' && picker.click()) });
        }),
      );
      themeName.textContent = t(`theme.${ui().theme}`);
    };
    const chooseTheme = async (theme: ThemeId) => {
      await updateSettings((s) => (s.ui.theme = theme));
      paintTheme();
      sfx('move');
    };
    const setTheme = (step: number) => chooseTheme(cycle(THEMES, ui().theme, step));
    picker.addEventListener('change', async () => {
      await updateSettings((s) => {
        s.ui.accent = picker.value;
        s.ui.theme = 'custom';
      });
      paintTheme();
    });
    paintTheme();

    const langValue = h('span', { class: 'row-value-text' });
    const paintLang = () => (langValue.textContent = t(`lang.${ui().language}`));
    paintLang();
    const setLang = async (step: number) => {
      const language = cycle(LANGS, ui().language, step);
      await updateSettings((s) => (s.ui.language = language));
      restore = { id: menu[menuIndex].id, focus };
      reload();
    };

    const items: Item[] = [
      { el: h('div', { class: 'setting-row theme-row' }, h('div', { class: 'row-label' }, t('settings.theme'), h('small', null, t('settings.themeHint'))), h('div', { class: 'row-control' }, themeRow, themeName, picker)), run: () => (ui().theme === 'custom' ? picker.click() : setTheme(1)), left: () => (void setTheme(-1), true), right: () => (void setTheme(1), true) },
      toggleItem(t('settings.scanlines'), t('settings.scanlinesHint'), () => ui().scanlines, (v) => updateSettings((s) => (s.ui.scanlines = v)).then(() => undefined)),
      toggleItem(t('settings.reduceMotion'), t('settings.reduceMotionHint'), () => ui().reduceMotion, (v) => updateSettings((s) => (s.ui.reduceMotion = v)).then(() => undefined)),
      toggleItem(t('settings.clock24'), t('settings.clock24Hint'), () => ui().clock24, (v) => updateSettings((s) => (s.ui.clock24 = v)).then(() => undefined)),
      toggleItem(t('settings.fullscreen'), t('settings.fullscreenHint'), () => ui().fullscreen, async (v) => {
        await api.setFullscreen(v);
        await updateSettings((s) => (s.ui.fullscreen = v));
      }),
      { el: h('div', { class: 'setting-row' }, h('div', { class: 'row-label' }, t('settings.language')), h('div', { class: 'row-control' }, langValue)), run: () => setLang(1), left: () => (void setLang(-1), true), right: () => (void setLang(1), true) },
    ];
    return { el: h('div', { class: 'panel' }, head(t('settings.appearance.title'), t('settings.appearance.desc')), items.map((i) => i.el)), items };
  }

  function audioPanel(): PanelView {
    const ui = () => store.settings.ui;
    const fill = h('i');
    const pct = h('span', { class: 'row-value-text' });
    const paint = () => {
      const v = Math.round(ui().volume * 100);
      fill.style.width = `${v}%`;
      pct.textContent = `${v}%`;
    };
    paint();
    const setVolume = async (delta: number) => {
      const volume = Math.round(Math.min(1, Math.max(0, ui().volume + delta)) * 10) / 10;
      await updateSettings((s) => (s.ui.volume = volume));
      paint();
      sfx('move');
    };
    const padLine = h('span', { class: 'row-value-text' });
    const paintPad = () => (padLine.textContent = pad.connected ? t('settings.padConnected', { name: pad.name }) : t('settings.padNone'));
    paintPad();

    const keyRow = (action: string, kbd: string, gp: string) => h('tr', null, h('td', null, action), h('td', null, h('kbd', null, kbd)), h('td', null, h('kbd', { class: 'pad' }, gp)));
    const items: Item[] = [
      toggleItem(t('settings.sound'), t('settings.soundHint'), () => ui().sound, async (v) => {
        await updateSettings((s) => (s.ui.sound = v));
        sfx('select');
      }),
      { el: h('div', { class: 'setting-row' }, h('div', { class: 'row-label' }, t('settings.volume')), h('div', { class: 'row-control' }, h('span', { class: 'slider' }, fill), pct)), run: () => setVolume(0.1), left: () => (void setVolume(-0.1), true), right: () => (void setVolume(0.1), true) },
    ];
    const el = h(
      'div',
      { class: 'panel' },
      head(t('settings.audio.title'), t('settings.audio.desc')),
      items.map((i) => i.el),
      h('div', { class: 'setting-row static' }, h('div', { class: 'row-label' }, t('settings.gamepad')), padLine),
      h('table', { class: 'controls-table' }, h('thead', null, h('tr', null, h('th', null, t('settings.ctrl.action')), h('th', null, t('settings.ctrl.keyboard')), h('th', null, t('settings.ctrl.gamepad')))),
        h('tbody', null, keyRow(t('settings.ctrl.move'), '← → ↑ ↓ / WASD', t('settings.ctrl.dpad')), keyRow(t('settings.ctrl.confirm'), 'Enter', 'A'), keyRow(t('settings.ctrl.back'), 'Esc', 'B'), keyRow(t('settings.ctrl.x'), 'X', 'X'), keyRow(t('settings.ctrl.y'), 'Y', 'Y'), keyRow(t('settings.ctrl.console'), 'Q / E', 'LB / RB'), keyRow(t('settings.ctrl.menu'), 'M', 'Start'), keyRow(t('settings.ctrl.fullscreen'), 'F11', '—'))),
    );
    return { el, items };
  }

  function coversPanel(): PanelView {
    const games = [...store.games].sort((a, b) => a.consoleTitle.localeCompare(b.consoleTitle) || a.title.localeCompare(b.title));
    const grid = h('div', { class: 'games-grid' });
    const items: Item[] = games.map((game) => {
      const el = h('div', { class: 'game-card' }, h('div', { class: 'game-card-art' }, gameArt(game, assetUrl('Covers', game.cover))), h('div', { class: 'game-card-console' }, game.consoleTitle), h('div', { class: 'game-card-title' }, game.title), h('div', { class: 'game-card-action' }, t('settings.changeCover')));
      grid.appendChild(el);
      return {
        el,
        run: () =>
          mutate(async () => {
            const path = await pickImage(t('lib.pickCover'));
            if (!path) return;
            await api.setGameCover(game.consoleId, game.relPath, path);
            await refreshLibrary();
          }),
        secondary: () =>
          void mutate(async () => {
            await api.clearGameCover(game.consoleId, game.relPath);
            await refreshLibrary();
            toast(t('settings.coverRemoved'));
          }),
      };
    });
    const el = h('div', { class: 'panel' }, head(t('settings.covers.title'), t('settings.covers.desc')), games.length ? grid : h('p', { class: 'panel-empty' }, t('settings.noGames')));
    return { el, items, grid: games.length ? grid : undefined };
  }

  function helpPanel(): PanelView {
    const keys = (label: string, value: string) => row(label, h('span', { class: 'mono' }, value), 'static');
    const replay: Item = { el: row(t('settings.help.replay'), icon('play', 18)), run: () => void openTutorial() };
    const el = h(
      'div',
      { class: 'panel' },
      head(t('settings.help.title'), t('settings.help.desc')),
      replay.el,
      keys(t('help.move'), t('help.move.keys')),
      keys(t('help.confirm'), t('help.confirm.keys')),
      keys(t('help.back'), t('help.back.keys')),
      keys(t('help.sort'), 'Y'),
      keys(t('help.cover'), 'X'),
      keys(t('help.console'), t('help.console.keys')),
      keys(t('help.fullscreen'), 'F11'),
    );
    return { el, items: [replay] };
  }

  function aboutPanel(): PanelView {
    const items: Item[] = [
      { el: row(t('settings.dataFolder'), mono(store.info.dataDir), 'row-link'), run: async () => {
        try {
          await api.openDataDir();
        } catch (e) {
          toast(errorMessage(e), 'error');
        }
      } },
      { el: row(t('settings.rescan'), icon('refresh', 18)), run: async () => {
        toast(t('lib.scanning'));
        await refreshLibrary();
        toast(t('settings.rescanDone', { n: store.games.length }), 'ok');
      } },
    ];
    if (isTauri) {
      items.push({ el: row(t('home.quit'), icon('power', 18), 'row-danger'), run: async () => {
        if (await confirmDialog({ title: t('home.quitTitle'), message: t('home.quitMessage'), confirm: t('home.quit') })) void api.quit();
      } });
    }
    const el = h(
      'div',
      { class: 'panel' },
      head(t('settings.about.title'), t('settings.about.desc')),
      row(t('settings.version'), mono(store.info.version), 'static'),
      items.map((i) => i.el),
      h('p', { class: 'about-text' }, t('settings.aboutText')),
    );
    return { el, items };
  }

  const builders: Record<string, () => PanelView> = { consoles: consolesPanel, profile: profilePanel, appearance: appearancePanel, audio: audioPanel, covers: coversPanel, help: helpPanel, about: aboutPanel };

  function showPanel(index: number, focusAt = 0) {
    if (!alive) return;
    menuIndex = index;
    const next = builders[menu[index].id]();
    wire(next.items);
    view = next;
    clear(content);
    content.appendChild(next.el);
    content.scrollTop = 0;
    focus = Math.min(focusAt, Math.max(0, next.items.length - 1));
    paintZone();
    if (zone === 'panel') setFocus(focus);
  }

  function selectMenu(index: number, fromPointer = false) {
    if (index === menuIndex && !fromPointer) return;
    if (index < 0 || index >= menu.length) return;
    sfx('move');
    zone = 'menu';
    showPanel(index);
    history.replaceState(null, '', `#/settings/${menu[index].id}`);
  }

  function enterPanel() {
    if (!view.items.length) return;
    sfx('select');
    zone = 'panel';
    paintZone();
    setFocus(focus);
  }

  // ---------- input ----------

  const release = pushInput((action) => {
    if (zone === 'menu') {
      switch (action) {
        case 'up': selectMenu(menuIndex - 1); return true;
        case 'down': selectMenu(menuIndex + 1); return true;
        case 'right':
        case 'confirm': enterPanel(); return true;
        case 'back':
        case 'start': sfx('back'); go('/'); return true;
        default: return false;
      }
    }
    const item = view.items[focus];
    const cols = columns();
    switch (action) {
      case 'up':
        if (focus - cols >= 0) {
          sfx('move');
          setFocus(focus - cols);
        }
        return true;
      case 'down':
        if (focus + cols < view.items.length) {
          sfx('move');
          setFocus(focus + cols);
        } else if (view.grid && focus < view.items.length - 1 && Math.floor(focus / cols) < Math.floor((view.items.length - 1) / cols)) {
          sfx('move');
          setFocus(view.items.length - 1);
        }
        return true;
      case 'left':
        if (item?.left?.()) return true;
        if (view.grid && focus % cols !== 0) {
          sfx('move');
          setFocus(focus - 1);
          return true;
        }
        sfx('back');
        zone = 'menu';
        paintZone();
        return true;
      case 'right':
        if (item?.right?.()) return true;
        if (view.grid && focus < view.items.length - 1) {
          sfx('move');
          setFocus(focus + 1);
        }
        return true;
      case 'confirm':
        sfx('select');
        void item?.run?.();
        return true;
      case 'x':
        item?.secondary?.();
        return true;
      case 'back':
        sfx('back');
        zone = 'menu';
        paintZone();
        return true;
      case 'start':
        sfx('back');
        go('/');
        return true;
      default:
        return false;
    }
  });

  const unsubscribe = [
    on('library', () => {
      if (menu[menuIndex].id === 'covers' || menu[menuIndex].id === 'consoles') showPanel(menuIndex, focus);
    }),
  ];

  showPanel(menuIndex, focus);
  if (query.get('add') === '1') {
    zone = 'panel';
    paintZone();
    void addConsoleWizard().then((added) => {
      history.replaceState(null, '', '#/settings/consoles');
      if (added) showPanel(0, 0);
    });
  }

  return {
    mood: 'system',
    hints: [
      { pad: '▴▾', kbd: '↑ ↓', label: t('hint.navigate') },
      { pad: 'A', kbd: 'Enter', label: t('hint.edit'), tone: 'green' },
      { pad: 'B', kbd: 'Esc', label: t('hint.back'), tone: 'red' },
      { pad: 'X', kbd: 'X', label: t('hint.remove'), tone: 'blue' },
    ],
    destroy() {
      alive = false;
      release();
      unsubscribe.forEach((fn) => fn());
    },
  };
};
