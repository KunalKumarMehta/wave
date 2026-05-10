/**
 * Settings state — provider config, model selection, API key refs.
 * 
 * API keys are NOT stored here. They live in StorageProvider.secure.
 * This store only tracks which providers are configured.
 */

import { createStore } from 'zustand/vanilla';

export type ProviderName = 'openai' | 'anthropic' | 'gemini';

export interface ProviderConfig {
  name: ProviderName;
  label: string;
  models: string[];
  defaultModel: string;
  hasKey: boolean;
}

export const PROVIDER_CATALOG: Record<ProviderName, Omit<ProviderConfig, 'hasKey'>> = {
  openai: {
    name: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o4-mini'],
    defaultModel: 'gpt-4.1-mini',
  },
  anthropic: {
    name: 'anthropic',
    label: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-3-5-haiku-20241022'],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  gemini: {
    name: 'gemini',
    label: 'Google Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
  },
};

export interface SettingsState {
  activeProvider: ProviderName;
  activeModel: string;
  configuredProviders: Set<ProviderName>;
  settingsOpen: boolean;

  setActiveProvider: (provider: ProviderName) => void;
  setActiveModel: (model: string) => void;
  markProviderConfigured: (provider: ProviderName) => void;
  markProviderUnconfigured: (provider: ProviderName) => void;
  toggleSettings: () => void;
}

export const settingsStore = createStore<SettingsState>((set) => ({
  activeProvider: 'openai',
  activeModel: PROVIDER_CATALOG.openai.defaultModel,
  configuredProviders: new Set<ProviderName>(),
  settingsOpen: false,

  setActiveProvider: (provider) =>
    set({
      activeProvider: provider,
      activeModel: PROVIDER_CATALOG[provider].defaultModel,
    }),

  setActiveModel: (model) => set({ activeModel: model }),

  markProviderConfigured: (provider) =>
    set((state) => ({
      configuredProviders: new Set([...state.configuredProviders, provider]),
    })),

  markProviderUnconfigured: (provider) =>
    set((state) => {
      const next = new Set(state.configuredProviders);
      next.delete(provider);
      return { configuredProviders: next };
    }),

  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
}));
