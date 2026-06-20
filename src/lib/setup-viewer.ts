import '@web-file-reader/viewer';
import '@web-file-reader/navigation';
import '@web-file-reader/settings';
import { canGoNext, canGoPrev, createPaging, goNext, goPrev } from '@web-file-reader/core';
import type { WfrViewer } from '@web-file-reader/viewer';
import type { WfrViewerNav } from '@web-file-reader/navigation';
import type { WfrSettingsPanel } from '@web-file-reader/settings';
import { navigate } from 'astro:transitions/client';
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

// The shell persists across navigations, so listeners are wired exactly once and
// read mutable route state captured here rather than per-page closures.
let wired = false;
let currentIndex = -1;
let currentProviderId: string | undefined;

const shell = (): Shell | undefined => {
  const dialog = document.querySelector('dialog');
  const viewer = document.querySelector('wfr-viewer');
  const nav = document.querySelector('wfr-viewer-nav');
  const panel = document.querySelector('wfr-settings-panel');
  if (dialog === null || viewer === null || nav === null || panel === null) return undefined;
  return { dialog, viewer, nav, panel };
};

const isViewerRoute = (): boolean => location.pathname.includes('/viewer/');

const currentFileId = (): string | undefined => location.pathname.split('/').filter(Boolean).pop();

const goRelative = (delta: number): void => {
  const paging = createPaging(currentIndex, FILES.length);
  const next = delta < 0 ? goPrev(paging) : goNext(paging);
  const target = FILES[next.index];
  if (target !== undefined) void navigate(withBase(`viewer/${target.id}`));
};

const wireOnce = ({ dialog, viewer, nav, panel }: Shell): void => {
  if (wired) return;
  wired = true;

  nav.target = viewer;
  nav.addEventListener('wfr-prev', () => goRelative(-1));
  nav.addEventListener('wfr-next', () => goRelative(1));

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void navigate(withBase(''));
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) void navigate(withBase(''));
  });

  document.getElementById('fs-button')?.addEventListener('click', () => void viewer.toggleFullscreen());

  const settingsButton = document.getElementById('settings-button');
  settingsButton?.addEventListener('click', () => {
    const willShow = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden');
    settingsButton.setAttribute('aria-expanded', String(willShow));
  });

  panel.addEventListener('wfr-settings-change', (event) => {
    if (currentProviderId !== undefined) saveSettings(currentProviderId, event.detail.settings);
    viewer.settings = event.detail.settings;
  });
};

const closeShell = (dialog: HTMLDialogElement): void => {
  if (dialog.open) dialog.close();
};

const syncRoute = async ({ dialog, viewer, nav, panel }: Shell): Promise<void> => {
  const file = isViewerRoute() ? fileById(currentFileId()) : undefined;
  if (file === undefined) {
    closeShell(dialog);
    return;
  }

  currentIndex = indexOfFile(file.id);
  const registry = getRegistry();
  viewer.registry = registry;
  viewer.file = file;

  document.getElementById('viewer-title')?.replaceChildren(file.name);
  dialog.setAttribute('aria-label', `Viewing ${file.name}`);

  const paging = createPaging(currentIndex, FILES.length);
  nav.canPrev = canGoPrev(paging);
  nav.canNext = canGoNext(paging);

  // Reset the settings disclosure for the new file.
  panel.setAttribute('hidden', '');
  document.getElementById('settings-button')?.setAttribute('aria-expanded', 'false');

  const provider = registry.resolve(file);
  currentProviderId = provider?.id;
  if (provider !== undefined) {
    const providerModule = await registry.load(file);
    if (providerModule !== undefined) {
      const settings = loadSettings(provider.id, providerModule.settingsSchema);
      panel.schema = providerModule.settingsSchema;
      panel.settings = settings;
      viewer.settings = settings;
    }
  }

  if (!dialog.open) dialog.showModal();
};

/** Wire (once) and sync the persistent viewer shell to the current route. */
export const setupViewer = async (): Promise<void> => {
  const current = shell();
  if (current === undefined) return;
  wireOnce(current);
  await syncRoute(current);
};
