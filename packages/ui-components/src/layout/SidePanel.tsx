import React from 'react';
import { CostBadge } from './CostBadge.js';
import './SidePanel.css';
import '../styles/accessibility.css';

interface SidePanelProps {
  children: React.ReactNode;
  onSettingsClick?: () => void;
  onNewChat?: () => void;
  onHistoryClick?: () => void;
  activeProvider?: string;
  activeModel?: string;
  totalCost?: number;
  totalTokens?: number;
}

/**
 * Root layout for the Side Panel.
 * Mobile-first design for 360px minimum width.
 */
export function SidePanel({
  children,
  onSettingsClick,
  onNewChat,
  onHistoryClick,
  activeProvider,
  activeModel,
  totalCost = 0,
  totalTokens = 0,
}: SidePanelProps) {
  return (
    <div className="side-panel">
      <header className="side-panel__header">
        <div className="side-panel__header-left">
          {onHistoryClick && (
            <button
              className="side-panel__icon-btn"
              onClick={onHistoryClick}
              aria-label="Conversation history"
              title="History"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <div className="side-panel__logo">
            <span className="side-panel__logo-icon">◉</span>
            <span className="side-panel__logo-text">Wave</span>
          </div>
        </div>
        <div className="side-panel__header-right">
          {totalTokens > 0 && (
            <CostBadge totalCost={totalCost} totalTokens={totalTokens} />
          )}
          {activeModel && (
            <span className="side-panel__model-badge" title={`${activeProvider}: ${activeModel}`}>
              {activeModel.split('-').slice(0, 2).join('-')}
            </span>
          )}
          {onNewChat && (
            <button
              className="side-panel__icon-btn"
              onClick={onNewChat}
              aria-label="New chat"
              title="New chat"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
          {onSettingsClick && (
            <button
              className="side-panel__icon-btn"
              onClick={onSettingsClick}
              aria-label="Open settings"
              title="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6.5 1.5h3l.5 2 1.5.7 1.8-1 2.1 2.1-1 1.8.7 1.5 2 .5v3l-2 .5-0.7 1.5 1 1.8-2.1 2.1-1.8-1-1.5.7-.5 2h-3l-.5-2-1.5-.7-1.8 1-2.1-2.1 1-1.8-.7-1.5-2-.5v-3l2-.5.7-1.5-1-1.8 2.1-2.1 1.8 1 1.5-.7z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          )}
        </div>
      </header>
      <main className="side-panel__content">
        {children}
      </main>
    </div>
  );
}
