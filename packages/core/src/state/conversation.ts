/**
 * Conversation state — message list, streaming state, active conversation.
 */

import { createStore } from 'zustand/vanilla';
import type { Message, Conversation } from '../types/message.js';

export interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;

  // Derived
  activeConversation: () => Conversation | undefined;
  activeMessages: () => Message[];

  // Actions
  createConversation: () => string;
  setActiveConversation: (id: string) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToMessage: (id: string, content: string) => void;
  setStreaming: (streaming: boolean) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const conversationStore = createStore<ConversationState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  isStreaming: false,

  activeConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },

  activeMessages: () => {
    const conv = get().activeConversation();
    return conv?.messages ?? [];
  },

  createConversation: () => {
    const id = generateId();
    const conversation: Conversation = {
      id,
      title: 'New conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: id,
    }));
    return id;
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  addMessage: (message) =>
    set((state) => {
      const convs = state.conversations.map((c) => {
        if (c.id === state.activeConversationId) {
          return {
            ...c,
            messages: [...c.messages, message],
            updatedAt: Date.now(),
            // Auto-title from first user message
            title:
              c.messages.length === 0 && message.role === 'user'
                ? message.content.slice(0, 50)
                : c.title,
          };
        }
        return c;
      });
      return { conversations: convs };
    }),

  updateMessage: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id === state.activeConversationId) {
          return {
            ...c,
            messages: c.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
            updatedAt: Date.now(),
          };
        }
        return c;
      }),
    })),

  appendToMessage: (id, content) =>
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id === state.activeConversationId) {
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === id ? { ...m, content: m.content + content } : m
            ),
          };
        }
        return c;
      }),
    })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
}));
