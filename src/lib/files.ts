import type { FileDescriptor } from '@web-file-reader/core';
import { withBase } from './base';

/**
 * Sample file set for the reference host. Sources point at static assets in
 * `public/samples`; each provider resolves and renders them lazily.
 */
export const FILES: readonly FileDescriptor[] = [
  {
    id: 'readme',
    name: 'readme.md',
    extension: 'md',
    mimeType: 'text/markdown',
    source: { kind: 'url', url: withBase('samples/readme.md') },
    previewIconUrl: withBase('icons/file-md.svg'),
  },
  {
    id: 'notes',
    name: 'notes.txt',
    extension: 'txt',
    mimeType: 'text/plain',
    source: { kind: 'url', url: withBase('samples/notes.txt') },
    previewIconUrl: withBase('icons/file-txt.svg'),
  },
  {
    id: 'sales',
    name: 'sales.csv',
    extension: 'csv',
    mimeType: 'text/csv',
    source: { kind: 'url', url: withBase('samples/sales.csv') },
    previewIconUrl: withBase('icons/file-csv.svg'),
  },
  {
    id: 'logo',
    name: 'logo.svg',
    extension: 'svg',
    mimeType: 'image/svg+xml',
    source: { kind: 'url', url: withBase('samples/logo.svg') },
    // An image file shows its own thumbnail as the tile pictogram.
    previewIconUrl: withBase('samples/logo.svg'),
  },
  {
    id: 'doc',
    name: 'doc.pdf',
    extension: 'pdf',
    mimeType: 'application/pdf',
    source: { kind: 'url', url: withBase('samples/doc.pdf') },
    previewIconUrl: withBase('icons/file-pdf.svg'),
  },
  {
    id: 'report-pdf',
    name: 'report.pdf',
    extension: 'pdf',
    mimeType: 'application/pdf',
    source: { kind: 'url', url: withBase('samples/report.pdf') },
    previewIconUrl: withBase('icons/file-pdf.svg'),
  },
  {
    id: 'photo',
    name: 'photo.png',
    extension: 'png',
    mimeType: 'image/png',
    source: { kind: 'url', url: withBase('samples/photo.png') },
    // An image file shows its own thumbnail as the tile pictogram.
    previewIconUrl: withBase('samples/photo.png'),
  },
  {
    id: 'book',
    name: 'book.fb2',
    extension: 'fb2',
    mimeType: 'application/x-fictionbook+xml',
    source: { kind: 'url', url: withBase('samples/book.fb2') },
    previewIconUrl: withBase('icons/file-fb2.svg'),
  },
  {
    id: 'report-docx',
    name: 'report.docx',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    source: { kind: 'url', url: withBase('samples/report.docx') },
    previewIconUrl: withBase('icons/file-docx.svg'),
  },
  {
    id: 'bundle',
    name: 'bundle.zip',
    extension: 'zip',
    mimeType: 'application/zip',
    source: { kind: 'url', url: withBase('samples/bundle.zip') },
    previewIconUrl: withBase('icons/file-zip.svg'),
  },
];

/** Look up a file by id. */
export const fileById = (id: string | undefined): FileDescriptor | undefined =>
  FILES.find((file) => file.id === id);

/** Index of a file id within {@link FILES} (-1 when absent). */
export const indexOfFile = (id: string | undefined): number =>
  FILES.findIndex((file) => file.id === id);
