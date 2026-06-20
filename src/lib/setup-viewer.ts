import '@web-file-reader/viewer';
import '@web-file-reader/navigation';
import '@web-file-reader/settings';
import { canGoNext, canGoPrev, createPaging, goNext, goPrev } from '@web-file-reader/core';
import { navigate } from 'astro:transitions/client';
import { FILES, fileById, indexOfFile } from './files';
import { withBase } from './base';
import { getRegistry } from './registry';
import { loadSettings, saveSettings } from './settings-store';

/**
 * Wire the viewer dialog on the current route. Runs on every `astro:page-load`;
 * returns early when the current page has no viewer dialog (e.g. the grid).
 */
export const setupViewer = async (): Promise<void> => {
  const dialog = document.querySelector('dialog');
  const viewer = document.querySelector('wfr-viewer');
  const nav = document.querySelector('wfr-viewer-nav');
  const panel = document.querySelector('wfr-settings-panel');
  if (dialog === null || viewer === null || nav === null || panel === null) return;

  const currentId = location.pathname.split('/').filter(Boolean).pop();
  const file = fileById(currentId);
  if (file === undefined) {
    void navigate(withBase(''));
    return;
  }

  const registry = getRegistry();
  viewer.registry = registry;
  viewer.file = file;

  // Paging between files drives a route change → Astro View Transition.
  const paging = createPaging(indexOfFile(currentId), FILES.length);
  nav.target = viewer;
  nav.canPrev = canGoPrev(paging);
  nav.canNext = canGoNext(paging);
  nav.addEventListener('wfr-prev', () => {
    const target = FILES[goPrev(paging).index];
    if (target !== undefined) void navigate(withBase(`viewer/${target.id}`));
  });
  nav.addEventListener('wfr-next', () => {
    const target = FILES[goNext(paging).index];
    if (target !== undefined) void navigate(withBase(`viewer/${target.id}`));
  });

  // Open as a modal dialog (focus trap + Escape) while the URL reflects the file.
  if (!dialog.open) dialog.showModal();
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void navigate(withBase(''));
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) void navigate(withBase(''));
  });

  document.getElementById('fs-button')?.addEventListener('click', () => void viewer.toggleFullscreen());

  // Settings: render the provider schema, apply, and persist changes.
  const provider = registry.resolve(file);
  if (provider !== undefined) {
    const providerModule = await registry.load(file);
    if (providerModule !== undefined) {
      const schema = providerModule.settingsSchema;
      const settings = loadSettings(provider.id, schema);
      panel.schema = schema;
      panel.settings = settings;
      viewer.settings = settings;
      panel.addEventListener('wfr-settings-change', (event) => {
        saveSettings(provider.id, event.detail.settings);
        viewer.settings = event.detail.settings;
      });
    }
  }

  const settingsButton = document.getElementById('settings-button');
  settingsButton?.addEventListener('click', () => {
    const willShow = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden');
    settingsButton.setAttribute('aria-expanded', String(willShow));
  });
};
