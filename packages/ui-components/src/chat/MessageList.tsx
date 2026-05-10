import React, { useEffect, useRef } from 'react';
import type { Message } from '@wave/core';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return (
      <div className="message-list__empty">
        <div className="message-list__empty-icon">◉</div>
        <p className="message-list__empty-text">
          Wave is ready. Start a conversation or ask me to interact with this page.
        </p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div key={msg.id} className={`message message--${msg.role}`}>
          <div className="message__avatar">
            {msg.role === 'user' ? '●' : '◉'}
          </div>
          <div className="message__body">
            <div className="message__role">
              {msg.role === 'user' ? 'You' : 'Wave'}
            </div>
            <div className="message__content">
              {msg.role === 'assistant' ? (
                <MarkdownRenderer content={msg.content} />
              ) : (
                msg.content
              )}
              {msg.isStreaming && <span className="message__cursor" />}
            </div>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
