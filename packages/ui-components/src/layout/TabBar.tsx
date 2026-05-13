import type { Tab } from '@wave/core/src/domain/tab-manager.js';
import './TabBar.css';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSwitch: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
  /** Shown when e.g. max open tabs is reached */
  errorMessage?: string | null;
  onDismissError?: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSwitch,
  onTabClose,
  onNewTab,
  errorMessage,
  onDismissError,
}: TabBarProps) {
  return (
    <div className="tab-bar">
      {errorMessage && (
        <div className="tab-bar__error" role="alert">
          <span className="tab-bar__error-text">{errorMessage}</span>
          {onDismissError && (
            <button type="button" className="tab-bar__error-dismiss" onClick={onDismissError} aria-label="Dismiss">
              ✕
            </button>
          )}
        </div>
      )}
      <div className="tab-bar__main">
        <div className="tab-bar__list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={`tab-bar__item ${tab.id === activeTabId ? 'tab-bar__item--active' : ''}`}
            onClick={() => onTabSwitch(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTabSwitch(tab.id);
              }
            }}
          >
            <span className="tab-bar__title" title={tab.title || tab.url}>
              {tab.title || tab.url || 'New Tab'}
            </span>
            {tabs.length > 1 && (
              <button
                className="tab-bar__close"
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="tab-bar__add" onClick={onNewTab} title="Open new tab">
        +
      </button>
      </div>
    </div>
  );
}
