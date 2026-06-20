import { createProviderRegistry, type ProviderRegistry } from '@web-file-reader/core';
import { descriptor as markdown } from '@web-file-reader/provider-markdown';
import { descriptor as image } from '@web-file-reader/provider-image';
import { descriptor as pdf } from '@web-file-reader/provider-pdf';
import { descriptor as csv } from '@web-file-reader/provider-csv';

let cached: ProviderRegistry | undefined;

/**
 * The shared provider registry. Only the lightweight descriptors are imported
 * here; each provider's heavy renderer is downloaded lazily on first use and
 * then cached by the registry.
 */
export const getRegistry = (): ProviderRegistry => {
  if (cached !== undefined) return cached;
  const registry = createProviderRegistry();
  for (const descriptor of [markdown, image, pdf, csv]) registry.register(descriptor);
  cached = registry;
  return registry;
};
