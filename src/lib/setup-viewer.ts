import '@web-file-reader/viewer';
import '@web-file-reader/navigation';
import '@web-file-reader/settings';
import { canGoNext, canGoPrev, createPaging } from '@web-file-reader/core';
import type { FileDescriptor } from '@web-file-reader/core';
import type { WfrViewer } from '@web-file-reader/viewer';
import type { WfrViewerNav } from '@web-file-reader/navigation';
import type { WfrSettingsPanel } from '@web-file-reader/settings';
import { FILES, fileById, indexOfFile } from './files';
import { withBase } from './base';
import { getRegistry } from './registry';
import { loadSettings, saveSettings } from './settings-store';
import { downloadFile } from './download';

interface Shell {
  readonly dialog: HTMLDialogElement;
  readonly track: HTMLElement;
  readonly nav: WfrViewerNav;
  readonly panel: WfrSettingsPanel;
}

// The shell is created once and never removed/reinserted. The content area is a
// three-pane horizontal scroll-snap carousel: a native swipe scrolls it, and the
// slide that settles in the viewport becomes the current file. Slides are
// recycled (ring) so paging never reloads an already-rendered, visible pane.
let wired = false;
let currentId: string | undefined;
let currentProviderId: string | undefined;
let settling = false; // suppress settle handling during programmatic recenters
let settleTimer: ReturnType<typeof setTimeout> | undefined;

const registry = getRegistry();

const fileIdFromPath = (pathname: string): string | undefined =>
  pathname.includes('/viewer/') ? pathname.split('/').filter(Boolean).pop() : undefined;

/** Safely read the opened file id from a `wfr-open` event (untyped detail). */
const openIdFromEvent = (event: Event): string | undefined => {
  if (!(event instanceof CustomEvent)) return undefined;
  const detail: unknown = event.detail;
  if (!detail || typeof detail !== 'object' || !('file' in detail)) return undefined;
  const file: unknown = detail.file;
  if (!file || typeof file !== 'object' || !('id' in file)) return undefined;
  const id: unknown = file.id;
  return typeof id === 'string' ? id : undefined;
};

const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const shell = (): Shell | undefined => {
  const dialog = document.querySelector('dialog');
  const track = document.getElementById('track');
  const nav = document.querySelector<WfrViewerNav>('wfr-viewer-nav');
  const panel = document.querySelector<WfrSettingsPanel>('wfr-settings-panel');
  if (!dialog || !track || !nav || !panel) return undefined;
  return { dialog, track, nav, panel };
};

const sections = (s: Shell): readonly HTMLElement[] =>
  Array.from(s.track.children).filter((c): c is HTMLElement => c instanceof HTMLElement);

const viewerIn = (section: HTMLElement): WfrViewer | undefined =>
  section.querySelector<WfrViewer>('wfr-viewer') ?? undefined;

const currentViewer = (s: Shell): WfrViewer | undefined => {
  const section = sections(s).find((sec) => sec.dataset['fileId'] === currentId);
  return section === undefined ? undefined : viewerIn(section);
};

/** Fill a slide's viewer with `file` (or empty + hide it when there is none). */
const fillSlide = (section: HTMLElement, file: FileDescriptor | undefined): void => {
  const viewer = viewerIn(section);
  if (viewer === undefined) return;
  if (file === undefined) {
    section.hidden = true;
    section.dataset['fileId'] = '';
    viewer.file = undefined;
    return;
  }
  section.hidden = false;
  section.dataset['fileId'] = file.id;
  viewer.registry = registry;
  const provider = registry.resolve(file);
  // Resolve persisted settings before the file so Lit renders once. Awaited
  // lazily — neighbours render with defaults until then, which is invisible.
  if (provider !== undefined) {
    void registry.load(file).then((mod) => {
      if (mod !== undefined && section.dataset['fileId'] === file.id) {
        viewer.settings = loadSettings(provider.id, mod.settingsSchema);
      }
    });
  }
  viewer.file = file;
};

/** Mark which slide is the current file (drives selectors + settings target). */
const markCurrent = (s: Shell, section: HTMLElement): void => {
  for (const sec of sections(s)) {
    if (sec === section) sec.setAttribute('aria-current', 'true');
    else sec.removeAttribute('aria-current');
  }
};

/** Centre the track on `section` instantly. Snap is disabled for the jump so
 *  mandatory scroll-snap can't fight the reposition (which caused a jerk). */
const centre = (s: Shell, section: HTMLElement): void => {
  settling = true;
  const { track } = s;
  const prevSnap = track.style.scrollSnapType;
  track.style.scrollSnapType = 'none';
  track.scrollLeft = section.offsetLeft;
  track.style.scrollSnapType = prevSnap;
  requestAnimationFrame(() => {
    settling = false;
  });
};

/** Lay out prev/current/next around `file` and centre it (used on open/sync). */
const layout = (s: Shell, file: FileDescriptor): void => {
  const [a, b, c] = sections(s);
  if (a === undefined || b === undefined || c === undefined) return;
  const idx = indexOfFile(file.id);
  fillSlide(a, FILES[idx - 1]);
  fillSlide(b, file);
  fillSlide(c, FILES[idx + 1]);
  markCurrent(s, b);
  centre(s, b);
};

/** Recycle slides so the committed file is centred without reloading visible panes. */
const recentre = (s: Shell, file: FileDescriptor): void => {
  const list = sections(s);
  const [a, , c] = list;
  const committed = list.find((sec) => sec.dataset['fileId'] === file.id);
  const idx = indexOfFile(file.id);
  if (committed === undefined || a === undefined || c === undefined) {
    layout(s, file);
    return;
  }
  if (committed === c) {
    s.track.append(a); // leftmost becomes the new far-right
    fillSlide(a, FILES[idx + 1]);
  } else if (committed === a) {
    s.track.prepend(c); // rightmost becomes the new far-left
    fillSlide(c, FILES[idx - 1]);
  } else {
    layout(s, file);
    return;
  }
  markCurrent(s, committed);
  centre(s, committed);
};

/** Update URL/title/aria/controls for the new current file. */
const setCurrent = (s: Shell, file: FileDescriptor, push: boolean): void => {
  currentId = file.id;
  if (push) history.pushState({ wfr: file.id }, '', withBase(`viewer/${file.id}`));
  document.getElementById('viewer-title')?.replaceChildren(file.name);
  s.dialog.setAttribute('aria-label', `Viewing ${file.name}`);
  document.title = `${file.name} — Web File Reader`;
  const paging = createPaging(indexOfFile(file.id), FILES.length);
  s.nav.canPrev = canGoPrev(paging);
  s.nav.canNext = canGoNext(paging);
  void applyPanel(s, file);
  s.panel.setAttribute('hidden', '');
  document.getElementById('settings-button')?.setAttribute('aria-expanded', 'false');
};

/** Load the current provider's schema + settings into the settings panel. */
const applyPanel = async (s: Shell, file: FileDescriptor): Promise<void> => {
  const provider = registry.resolve(file);
  currentProviderId = provider?.id;
  if (provider === undefined) return;
  const mod = await registry.load(file);
  if (mod === undefined || file.id !== currentId) return;
  s.panel.schema = mod.settingsSchema;
  s.panel.settings = loadSettings(provider.id, mod.settingsSchema);
};

/** Commit `file` as current and recycle the carousel around it. */
const commit = (s: Shell, file: FileDescriptor, push: boolean): void => {
  if (file.id === currentId) return;
  setCurrent(s, file, push);
  recentre(s, file);
};

/** The slide nearest the viewport centre once scrolling has settled. */
const settledFile = (s: Shell): FileDescriptor | undefined => {
  const centreX = s.track.scrollLeft + s.track.clientWidth / 2;
  let best: HTMLElement | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const sec of sections(s)) {
    if (sec.hidden) continue;
    const mid = sec.offsetLeft + sec.clientWidth / 2;
    const dist = Math.abs(mid - centreX);
    if (dist < bestDist) {
      bestDist = dist;
      best = sec;
    }
  }
  return best === undefined ? undefined : fileById(best.dataset['fileId']);
};

/** Commit the file the carousel has settled on (after snap finishes). */
const onSettle = (s: Shell): void => {
  if (settling) return;
  const file = settledFile(s);
  if (file !== undefined && file.id !== currentId) commit(s, file, true);
};

// `scrollend` fires once snap has fully settled — committing then keeps the
// recentre seamless. The debounce is a fallback for browsers without it.
const onScroll = (s: Shell): void => {
  if (settling) return;
  if (settleTimer !== undefined) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => onSettle(s), 140);
};

// Button/keyboard paging animates ~2x faster than the browser's native smooth
// scroll, which has no speed control.
const PAGE_SCROLL_MS = 180;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Animate `el.scrollLeft` to `to` over `ms`, then run `done`. */
const animateScrollLeft = (el: HTMLElement, to: number, ms: number, done: () => void): void => {
  const from = el.scrollLeft;
  const distance = to - from;
  if (distance === 0 || ms <= 0) {
    el.scrollLeft = to;
    done();
    return;
  }
  let started: number | undefined;
  const step = (now: number): void => {
    started ??= now;
    const t = Math.min(1, (now - started) / ms);
    el.scrollLeft = from + distance * easeOutCubic(t);
    if (t < 1) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
};

/** Page via controls/keyboard: scroll to the neighbour slide (snappy), then commit. */
const page = (s: Shell, delta: number): void => {
  const [a, , c] = sections(s);
  const target = delta < 0 ? a : c;
  if (target === undefined || target.hidden) return;
  const file = fileById(target.dataset['fileId']);
  if (file === undefined) return;
  settling = true; // suppress mid-animation settle commits
  // Mandatory scroll-snap fights a JS scrollLeft animation (it yanks each frame
  // back to a snap point — the "bounce"). Disable snap for the animation, then
  // restore it once we've landed/recentred on a snap point.
  s.track.style.scrollSnapType = 'none';
  const ms = prefersReducedMotion() ? 0 : PAGE_SCROLL_MS;
  animateScrollLeft(s.track, target.offsetLeft, ms, () => {
    settling = false;
    commit(s, file, true);
    s.track.style.scrollSnapType = '';
  });
};

/** Open the dialog (once) and show `file`. */
const open = (s: Shell, id: string, push: boolean): void => {
  const file = fileById(id);
  if (file === undefined) return;
  // Show first: slide offsets are only measurable once the dialog is displayed,
  // so centring a mid-list file must happen after showModal.
  if (!s.dialog.open) {
    s.dialog.showModal();
    s.dialog.focus();
  }
  setCurrent(s, file, push);
  layout(s, file);
};

const close = (s: Shell, push: boolean): void => {
  if (push) history.pushState({}, '', withBase(''));
  document.title = 'Web File Reader';
  if (s.dialog.open) s.dialog.close();
};

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
  const { dialog, track, nav, panel } = s;

  // The carousel owns horizontal paging; the nav keeps tap-to-toggle, the
  // prev/next buttons and keyboard arrows.
  nav.target = track;
  nav.swipe = false;
  nav.addEventListener('wfr-prev', () => page(s, -1));
  nav.addEventListener('wfr-next', () => page(s, 1));

  track.addEventListener('scroll', () => onScroll(s), { passive: true });
  track.addEventListener('scrollend', () => onSettle(s), { passive: true });

  document.addEventListener('wfr-open', (event) => {
    const id = openIdFromEvent(event);
    if (id !== undefined) open(s, id, true);
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close(s, true);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close(s, true);
  });

  document.getElementById('close-button')?.addEventListener('click', (event) => {
    event.preventDefault();
    close(s, true);
  });

  document.getElementById('fs-button')?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (typeof dialog.requestFullscreen === 'function') {
      void dialog.requestFullscreen().catch(() => {});
    }
  });

  document.getElementById('download-button')?.addEventListener('click', () => {
    const file = fileById(currentId);
    if (file !== undefined) void downloadFile(file);
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
      const viewer = currentViewer(s);
      if (viewer !== undefined) viewer.settings = event.detail.settings;
    }
  });

  globalThis.addEventListener('popstate', () => syncToLocation(s));
  // Re-centre the active slide if the viewport resizes (rotation, address bar).
  globalThis.addEventListener('resize', () => {
    const section = sections(s).find((sec) => sec.dataset['fileId'] === currentId);
    if (section !== undefined) centre(s, section);
  });
};

/** Wire (once) and sync the persistent carousel shell to the current URL. */
export const setupViewer = (): void => {
  const current = shell();
  if (current === undefined) return;
  wireOnce(current);
  syncToLocation(current);
  // Reveal the landing now the viewer is opened/synced — on a /viewer/ deep
  // link this avoids a flash of the file grid before the dialog appears.
  document.documentElement.removeAttribute('data-wfr-boot');
};
