// Shared locator strings. Playwright CSS selectors pierce open shadow DOM, so
// descendant selectors cross into the components' shadow roots.
// The content area is a carousel; the active file is the slide marked
// aria-current. Selectors target that slide's viewer (CSS pierces shadow DOM).
export const CUR_VIEWER = '.slide[aria-current="true"] wfr-viewer';

export const SEL = {
  grid: 'wfr-file-grid',
  tileImg: 'wfr-file-tile img',
  dialog: '#viewer-dialog',
  track: '#track',
  viewer: CUR_VIEWER,
  surface: `${CUR_VIEWER} [part="surface"]`,
  page: `${CUR_VIEWER} [part="page"]`,
  nav: 'wfr-viewer-nav',
  closeLink: '#close-button',
  settingsBtn: '#settings-button',
  fsBtn: '#fs-button',
};

// File names double as accessible button labels in the grid.
export const FILE_NAMES = [
  'readme.md',
  'notes.txt',
  'sales.csv',
  'logo.svg',
  'doc.pdf',
  'report.pdf',
  'photo.png',
  'book.fb2',
  'report.docx',
  'bundle.zip',
];
