import React, { useState, useCallback, useMemo } from 'react';
import './ConversationDrawer.css';

export interface ConversationItem {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  provider?: string;
  model?: string;
}

interface ConversationDrawerProps {
  conversations: ConversationItem[];
  activeConversationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Conversation history drawer — slides in from left.
 * Shows searchable list of past conversations.
 */
export function ConversationDrawer({
  conversations,
  activeConversationId,
  isOpen,
  onClose,
  onSelect,
  onDelete,
  onNewChat,
}: ConversationDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (confirmDeleteId === id) {
        onDelete(id);
        setConfirmDeleteId(null);
      } else {
        setConfirmDeleteId(id);
        // Auto-reset after 3s
        setTimeout(() => setConfirmDeleteId(null), 3000);
      }
    },
    [confirmDeleteId, onDelete]
  );

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${isOpen ? 'drawer-backdrop--visible' : ''}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`conv-drawer ${isOpen ? 'conv-drawer--open' : ''}`}>
        {/* Header */}
        <div className="conv-drawer__header">
          <h2 className="conv-drawer__title">Conversations</h2>
          <button
            className="conv-drawer__close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <button
          className="conv-drawer__new-chat"
          onClick={() => { onNewChat(); onClose(); }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          New conversation
        </button>

        {/* Search */}
        <div className="conv-drawer__search">
          <svg className="conv-drawer__search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="conv-drawer__search-input"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="conv-drawer__search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Conversation List */}
        <div className="conv-drawer__list">
          {filtered.length === 0 && (
            <div className="conv-drawer__empty">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </div>
          )}
          {filtered.map((conv) => (
            <div
              key={conv.id}
              className={`conv-drawer__item ${conv.id === activeConversationId ? 'conv-drawer__item--active' : ''}`}
              onClick={() => handleSelect(conv.id)}
            >
              <div className="conv-drawer__item-content">
                <div className="conv-drawer__item-title">{conv.title}</div>
                <div className="conv-drawer__item-meta">
                  <span className="conv-drawer__item-time">{formatTimeAgo(conv.updatedAt)}</span>
                  <span className="conv-drawer__item-count">{conv.messageCount} msgs</span>
                  {conv.model && (
                    <span className="conv-drawer__item-model">{conv.model.split('-').slice(0, 2).join('-')}</span>
                  )}
                </div>
              </div>
              <button
                className={`conv-drawer__item-delete ${confirmDeleteId === conv.id ? 'conv-drawer__item-delete--confirm' : ''}`}
                onClick={(e) => handleDelete(e, conv.id)}
                aria-label={confirmDeleteId === conv.id ? 'Confirm delete' : 'Delete conversation'}
                title={confirmDeleteId === conv.id ? 'Click again to confirm' : 'Delete'}
              >
                {confirmDeleteId === conv.id ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M5 3V2h6v1m-9 1h12M6 6v6m4-6v6M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
