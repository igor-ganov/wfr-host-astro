import '@web-file-reader/viewer';
import '@web-file-reader/navigation';
import '@web-file-reader/settings';
import { canGoNext, canGoPrev, createPaging, goNext, goPrev } from '@web-file-reader/core';
import type { FileDescriptor } from '@web-file-reader/core';
import type { WfrViewer } from '@web-file-reader/viewer';
import type { WfrViewerNav } from '@web-file-reader/navigation';
import type { WfrSettingsPanel } from '@web-file-reader/settings';
import { FILES, fileById, indexOfFile } from './files';
import { withBase } from './base';
import { getRegistry } from './registry';
import { loadSettings, saveSettings } from './settings-store';

interface Shell {
  readonly dialog: HTMLDialogElement;
  readonly viewer: WfrViewer;
  readonly nav: WfrViewerNav;
  readonly panel: WfrSettingsPanel;
}

// The shell is created once and never removed/reinserted: open/page/close are
// pure client-side state changes (history + DOM props), with NO MPA navigation.
let wired = false;
let currentProviderId: string | undefined;

const shell = (): Shell | undefined => {
  const dialog = document.querySelector('dialog');
  const viewer = document.querySelector('wfr-viewer');
  const nav = document.querySelector('wfr-viewer-nav');
  const panel = document.querySelector('wfr-settings-panel');
  if (dialog === null || viewer === null || nav === null || panel === null) return undefined;
  return { dialog, viewer, nav, panel };
};

const fileIdFromPath = (pathname: string): string | undefined =>
  pathname.includes('/viewer/') ? pathname.split('/').filter(Boolean).pop() : undefined;

/** Apply content for `file` to the shell in place. Never touches dialog open state. */
const applyFile = async (s: Shell, file: FileDescriptor): Promise<void> => {
  const registry = getRegistry();
  const provider = registry.resolve(file);
  currentProviderId = provider?.id;

  // Resolve the provider's settings BEFORE swapping content, so `settings` and
  // `file` apply in a single Lit update — one render, no double-load (which on a
  // slow connection could leave the loading overlay stuck after a swipe).
  if (provider !== undefined) {
    const providerModule = await registry.load(file);
    if (providerModule !== undefined) {
      const settings = loadSettings(provider.id, providerModule.settingsSchema);
      s.panel.schema = providerModule.settingsSchema;
      s.panel.settings = settings;
      s.viewer.settings = settings;
    }
  }
  s.viewer.registry = registry;
  s.viewer.file = file;

  document.getElementById('viewer-title')?.replaceChildren(file.name);
  s.dialog.setAttribute('aria-label', `Viewing ${file.name}`);
  document.title = `${file.name} — Web File Reader`;

  const paging = createPaging(indexOfFile(file.id), FILES.length);
  s.nav.canPrev = canGoPrev(paging);
  s.nav.canNext = canGoNext(paging);

  // Reset the settings disclosure for the new file.
  s.panel.setAttribute('hidden', '');
  document.getElementById('settings-button')?.setAttribute('aria-expanded', 'false');
};

/**
 * Update viewer content for `file` in place. We deliberately do NOT wrap this in
 * `document.startViewTransition`: the transition snapshots/freezes the surface
 * during the async provider load, which on real devices looked like a stuck
 * loading overlay after the first swipe.
 */
const swapContent = (s: Shell, file: FileDescriptor): void => {
  void applyFile(s, file);
};

/** Open the dialog (once) and show `file`, pushing a deep-linkable URL. */
const open = (s: Shell, id: string, push: boolean): void => {
  const file = fileById(id);
  if (file === undefined) return;
  if (push) history.pushState({ wfr: id }, '', withBase(`viewer/${id}`));
  void applyFile(s, file);
  if (!s.dialog.open) {
    s.dialog.showModal();
    // showModal auto-focuses the first control (a stray ring for pointer users).
    // Move focus to the dialog itself; keyboard users still Tab into controls.
    s.dialog.focus();
  }
};

/** Page to the prev/next neighbour in place; the dialog stays open. */
const page = (s: Shell, delta: number): void => {
  const id = fileIdFromPath(location.pathname);
  const index = indexOfFile(id);
  if (index < 0) return;
  const paging = createPaging(index, FILES.length);
  const next = delta < 0 ? goPrev(paging) : goNext(paging);
  const target = FILES[next.index];
  if (target === undefined || target.id === id) return;
  history.pushState({ wfr: target.id }, '', withBase(`viewer/${target.id}`));
  swapContent(s, target);
};

/** Close the viewer client-side and return to the grid URL. */
const close = (s: Shell, push: boolean): void => {
  if (push) history.pushState({}, '', withBase(''));
  document.title = 'Web File Reader';
  if (s.dialog.open) s.dialog.close();
};

/** Re-sync the shell to the current URL (deep link, refresh, back/forward). */
const syncToLocation = (s: Shell): void => {
  const id = fileIdFromPath(location.pathname);
  const file = id === undefined ? undefined : fileById(id);
  if (file === undefined) {
    close(s, false);
    return;
  }
  open(s, file.id, false);
};

const wireOnce = (s: Shell): void => {
  if (wired) return;
  wired = true;
  const { dialog, viewer, nav, panel } = s;

  nav.target = viewer;
  nav.addEventListener('wfr-prev', () => page(s, -1));
  nav.addEventListener('wfr-next', () => page(s, 1));

  // Grid tile activation bubbles to the document; open client-side.
  document.addEventListener('wfr-open', (event) => {
    if (event instanceof CustomEvent) open(s, event.detail.file.id, true);
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close(s, true);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close(s, true);
  });

  // The Close control keeps a real href for no-JS; intercept it client-side.
  document.getElementById('close-button')?.addEventListener('click', (event) => {
    event.preventDefault();
    close(s, true);
  });

  // Fullscreen the whole dialog (not just the viewer) so the toolbar stays
  // visible. Hidden on mobile via CSS (the dialog already fills the screen).
  document.getElementById('fs-button')?.addEventListener('click', () => {
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen();
    } else if (typeof dialog.requestFullscreen === 'function') {
      void dialog.requestFullscreen().catch(() => {});
    }
  });

  const settingsButton = document.getElementById('settings-button');
  settingsButton?.addEventListener('click', () => {
    const willShow = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden');
    settingsButton.setAttribute('aria-expanded', String(willShow));
  });

  panel.addEventListener('wfr-settings-change', (event) => {
    if (event instanceof CustomEvent) {
      if (currentProviderId !== undefined) saveSettings(currentProviderId, event.detail.settings);
      viewer.settings = event.detail.settings;
    }
  });

  // Back/forward must open the right file or close — re-sync from the URL.
  globalThis.addEventListener('popstate', () => syncToLocation(s));
};

/** Wire (once) and sync the persistent viewer shell to the current URL. */
export const setupViewer = (): void => {
  const current = shell();
  if (current === undefined) return;
  wireOnce(current);
  syncToLocation(current);
};
