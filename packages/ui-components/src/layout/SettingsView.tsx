import { useState, useEffect, useCallback } from 'react';
import { usePlatform } from '../context/PlatformContext.js';
import { PROVIDER_CATALOG, type ProviderName } from '@wave/core/src/state/settings.js';
import './SettingsView.css';

interface SettingsViewProps {
  activeProvider: ProviderName;
  activeModel: string;
  onProviderChange: (provider: ProviderName) => void;
  onModelChange: (model: string) => void;
  onClose: () => void;
}

export function SettingsView({
  activeProvider,
  activeModel,
  onProviderChange,
  onModelChange,
  onClose,
}: SettingsViewProps) {
  const { storage } = usePlatform();
  const [apiKeys, setApiKeys] = useState<Record<ProviderName, string>>({
    openai: '',
    anthropic: '',
    gemini: '',
  });
  const [savedKeys, setSavedKeys] = useState<Record<ProviderName, boolean>>({
    openai: false,
    anthropic: false,
    gemini: false,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Load existing key status on mount
  useEffect(() => {
    const checkKeys = async () => {
      const providers: ProviderName[] = ['openai', 'anthropic', 'gemini'];
      const status: Record<string, boolean> = {};
      for (const p of providers) {
        const key = await storage.secure.getSecret(`apikey_${p}`);
        status[p] = !!key;
      }
      setSavedKeys(status as Record<ProviderName, boolean>);
    };
    checkKeys();
  }, [storage]);

  const handleSaveKey = useCallback(async (provider: ProviderName) => {
    const key = apiKeys[provider].trim();
    if (!key) return;

    setSaving(true);
    try {
      await storage.secure.setSecret(`apikey_${provider}`, key);
      setSavedKeys((prev) => ({ ...prev, [provider]: true }));
      setApiKeys((prev) => ({ ...prev, [provider]: '' }));
      setMessage(`${PROVIDER_CATALOG[provider].label} key saved`);
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setSaving(false);
  }, [apiKeys, storage]);

  const handleDeleteKey = useCallback(async (provider: ProviderName) => {
    await storage.secure.deleteSecret(`apikey_${provider}`);
    setSavedKeys((prev) => ({ ...prev, [provider]: false }));
    setMessage(`${PROVIDER_CATALOG[provider].label} key removed`);
    setTimeout(() => setMessage(''), 2000);
  }, [storage]);

  const catalog = PROVIDER_CATALOG[activeProvider];

  return (
    <div className="settings">
      <div className="settings__header">
        <h2 className="settings__title">Settings</h2>
        <button className="settings__close" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>

      {message && <div className="settings__toast">{message}</div>}

      {/* Provider Selection */}
      <section className="settings__section">
        <label className="settings__label">Provider</label>
        <div className="settings__provider-grid">
          {(Object.keys(PROVIDER_CATALOG) as ProviderName[]).map((p) => (
            <button
              key={p}
              className={`settings__provider-btn ${activeProvider === p ? 'settings__provider-btn--active' : ''}`}
              onClick={() => onProviderChange(p)}
            >
              <span className="settings__provider-name">{PROVIDER_CATALOG[p].label}</span>
              {savedKeys[p] && <span className="settings__provider-badge">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Model Selection */}
      <section className="settings__section">
        <label className="settings__label">Model</label>
        <select
          className="settings__select"
          value={activeModel}
          onChange={(e) => onModelChange(e.target.value)}
        >
          {catalog.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </section>

      {/* API Key Input */}
      <section className="settings__section">
        <label className="settings__label">
          {catalog.label} API Key
          {savedKeys[activeProvider] && (
            <span className="settings__key-status settings__key-status--saved">Configured</span>
          )}
        </label>
        <div className="settings__key-row">
          <input
            type="password"
            className="settings__input"
            placeholder={savedKeys[activeProvider] ? '••••••••••••••••' : `Enter ${catalog.label} API key`}
            value={apiKeys[activeProvider]}
            onChange={(e) =>
              setApiKeys((prev) => ({ ...prev, [activeProvider]: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveKey(activeProvider);
            }}
          />
          <button
            className="settings__save-btn"
            onClick={() => handleSaveKey(activeProvider)}
            disabled={!apiKeys[activeProvider].trim() || saving}
          >
            Save
          </button>
        </div>
        {savedKeys[activeProvider] && (
          <button
            className="settings__delete-btn"
            onClick={() => handleDeleteKey(activeProvider)}
          >
            Remove key
          </button>
        )}
      </section>
    </div>
  );
}
