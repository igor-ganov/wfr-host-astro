import type { FileDescriptor } from '@web-file-reader/core';

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
    source: { kind: 'url', url: '/samples/readme.md' },
  },
  {
    id: 'notes',
    name: 'notes.txt',
    extension: 'txt',
    mimeType: 'text/plain',
    source: { kind: 'url', url: '/samples/notes.txt' },
  },
  {
    id: 'sales',
    name: 'sales.csv',
    extension: 'csv',
    mimeType: 'text/csv',
    source: { kind: 'url', url: '/samples/sales.csv' },
  },
  {
    id: 'logo',
    name: 'logo.svg',
    extension: 'svg',
    mimeType: 'image/svg+xml',
    source: { kind: 'url', url: '/samples/logo.svg' },
  },
  {
    id: 'doc',
    name: 'doc.pdf',
    extension: 'pdf',
    mimeType: 'application/pdf',
    source: { kind: 'url', url: '/samples/doc.pdf' },
  },
];

/** Look up a file by id. */
export const fileById = (id: string | undefined): FileDescriptor | undefined =>
  FILES.find((file) => file.id === id);

/** Index of a file id within {@link FILES} (-1 when absent). */
export const indexOfFile = (id: string | undefined): number =>
  FILES.findIndex((file) => file.id === id);
