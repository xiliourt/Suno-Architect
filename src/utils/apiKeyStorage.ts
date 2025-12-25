import { ProviderType } from '../types';

/**
 * Storage keys for each provider's API key
 */
const API_KEY_STORAGE_KEYS: Record<ProviderType, string> = {
  gemini: 'gemini_api_key',
  openrouter: 'openrouter_api_key',
  openapi: 'openapi_api_key',
};

/**
 * Get the API key for a specific provider from localStorage
 */
export function getApiKeyForProvider(providerType: ProviderType): string | undefined {
  const storageKey = API_KEY_STORAGE_KEYS[providerType];
  const stored = localStorage.getItem(storageKey);
  return stored || undefined;
}

/**
 * Save the API key for a specific provider to localStorage
 */
export function saveApiKeyForProvider(providerType: ProviderType, apiKey: string | undefined): void {
  const storageKey = API_KEY_STORAGE_KEYS[providerType];
  if (apiKey) {
    localStorage.setItem(storageKey, apiKey);
  } else {
    localStorage.removeItem(storageKey);
  }
}

/**
 * Load API key from environment variables for a specific provider
 */
export function getEnvApiKeyForProvider(providerType: ProviderType): string | undefined {
  switch (providerType) {
    case 'gemini':
      return import.meta.env.VITE_GEMINI_API_KEY || undefined;
    case 'openrouter':
      return import.meta.env.VITE_OPENROUTER_API_KEY || undefined;
    case 'openapi':
      return import.meta.env.VITE_OPENAPI_API_KEY || undefined;
    default:
      return undefined;
  }
}

/**
 * Get the API key for a provider, checking localStorage first, then environment variables
 */
export function getApiKey(providerType: ProviderType): string | undefined {
  return getApiKeyForProvider(providerType) || getEnvApiKeyForProvider(providerType);
}



