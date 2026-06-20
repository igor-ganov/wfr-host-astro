import {
  deserializeSettings,
  serializeSettings,
  type ProviderSettings,
  type SettingsSchema,
} from '@web-file-reader/core';

const storageKey = (providerId: string): string => `wfr:settings:${providerId}`;

/** Load persisted settings for a provider, validated against its schema. */
export const loadSettings = (providerId: string, schema: SettingsSchema): ProviderSettings =>
  deserializeSettings(globalThis.localStorage?.getItem(storageKey(providerId)) ?? '', schema);

/** Persist a provider's settings for next time. */
export const saveSettings = (providerId: string, settings: ProviderSettings): void => {
  globalThis.localStorage?.setItem(storageKey(providerId), serializeSettings(settings));
};
