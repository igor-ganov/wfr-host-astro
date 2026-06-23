// Shared locator strings. Playwright CSS selectors pierce open shadow DOM, so
// descendant selectors cross into the components' shadow roots.
export const SEL = {
  grid: 'wfr-file-grid',
  tileImg: 'wfr-file-tile img',
  dialog: '#viewer-dialog',
  viewer: '#viewer',
  surface: '#viewer [part="surface"]',
  page: '#viewer [part="page"]',
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
