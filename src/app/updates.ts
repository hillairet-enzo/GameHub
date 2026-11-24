// Updates: GameHub looks for a new version when it starts (unless switched off) and
// installs it on request. Settings, covers and stats live in the data folder, so they stay.

import { api, isTauri } from './api.js';
import { errorMessage, t } from './i18n.js';
import { confirmDialog } from './modal.js';
import { store } from './state.js';
import { toast } from './ui.js';

let busy = false;

/** `manual` is true when the player asked: then every outcome is reported, not just a new version. */
export async function checkForUpdate(manual: boolean): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (manual) toast(t('update.checking'));
    const info = await api.checkUpdate();
    if (!info) {
      if (manual) toast(t('update.upToDate', { version: store.info.version }), 'ok');
      return;
    }
    const install = await confirmDialog({
      title: t('update.title', { version: info.version }),
      message: t('update.text'),
      confirm: t('update.install'),
      cancel: t('update.later'),
    });
    if (!install) return;
    toast(t('update.installing'), 'info', 30000);
    await api.installUpdate(); // GameHub restarts by itself when this succeeds
  } catch (error) {
    if (manual) toast(errorMessage(error), 'error');
  } finally {
    busy = false;
  }
}

/** Quiet check a few seconds after start-up. Silent when offline or when updates are not set up. */
export function checkForUpdateOnStart(): void {
  if (!isTauri || !store.settings.ui.autoUpdate) return;
  window.setTimeout(() => void checkForUpdate(false), 4000);
}
