import type { FileDescriptor, FileSource } from '@web-file-reader/core';

/** Resolve any file source to a Blob suitable for a download. */
const sourceToBlob = async (source: FileSource): Promise<Blob> => {
  switch (source.kind) {
    case 'blob':
      return source.blob;
    case 'bytes':
      return new Blob([source.bytes]);
    case 'text':
      return new Blob([source.text], { type: 'text/plain' });
    case 'url': {
      const response = await fetch(source.url);
      return response.blob();
    }
  }
};

/**
 * Trigger a browser download of `file` using a temporary object URL. Works for
 * every {@link FileSource} kind and preserves the file's display name.
 */
export const downloadFile = async (file: FileDescriptor): Promise<void> => {
  const blob = await sourceToBlob(file.source);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
