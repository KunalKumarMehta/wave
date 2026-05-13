import type { Tab } from '@wave/core/src/domain/tab-manager.js';
import './TabBar.css';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabSwitch: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSwitch,
  onTabClose,
  onNewTab,
}: TabBarProps) {
  return (
    <div className="tab-bar">
      <div className="tab-bar__list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-bar__item ${tab.id === activeTabId ? 'tab-bar__item--active' : ''}`}
            onClick={() => onTabSwitch(tab.id)}
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
  );
}
