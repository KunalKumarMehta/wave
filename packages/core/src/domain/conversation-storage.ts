/**
 * Conversation Storage — CRUD operations for conversations in chrome.storage.local.
 *
 * Storage layout:
 *   "conv_index"  → string[]   (conversation IDs, newest first)
 *   "conv_{id}"   → Conversation  (individual conversation data)
 *
 * Avoids loading all conversations into memory at once.
 * Index is a lightweight ID list for the drawer.
 */

import type { Conversation, Message } from '../types/message.js';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  provider?: string;
  model?: string;
}

export interface ConversationStorageAPI {
  /** List all conversation summaries (newest first). */
  list(): Promise<ConversationSummary[]>;
  /** Get full conversation by ID. */
  get(id: string): Promise<Conversation | null>;
  /** Create a new conversation, return its ID. */
  create(provider?: string, model?: string): Promise<string>;
  /** Update conversation metadata (title, provider, model). */
  updateMeta(id: string, updates: Partial<Pick<Conversation, 'title' | 'provider' | 'model'>>): Promise<void>;
  /** Append a message to a conversation. */
  addMessage(id: string, message: Message): Promise<void>;
  /** Update a message within a conversation. */
  updateMessage(id: string, messageId: string, updates: Partial<Message>): Promise<void>;
  /** Append content to a message (streaming). */
  appendToMessage(id: string, messageId: string, content: string): Promise<void>;
  /** Delete a conversation. */
  delete(id: string): Promise<void>;
  /** Delete all conversations. */
  clear(): Promise<void>;
  /** Search conversations by title (case-insensitive). */
  search(query: string): Promise<ConversationSummary[]>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a ConversationStorage backed by chrome.storage.local.
 *
 * Uses a storage adapter interface so it's testable without Chrome APIs.
 */
export function createConversationStorage(
  storageAdapter: {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  }
): ConversationStorageAPI {
  const INDEX_KEY = 'conv_index';
  const convKey = (id: string) => `conv_${id}`;

  async function getIndex(): Promise<string[]> {
    return (await storageAdapter.get<string[]>(INDEX_KEY)) ?? [];
  }

  async function setIndex(ids: string[]): Promise<void> {
    await storageAdapter.set(INDEX_KEY, ids);
  }

  return {
    async list(): Promise<ConversationSummary[]> {
      const ids = await getIndex();
      const summaries: ConversationSummary[] = [];

      for (const id of ids) {
        const conv = await storageAdapter.get<Conversation>(convKey(id));
        if (conv) {
          summaries.push({
            id: conv.id,
            title: conv.title,
            updatedAt: conv.updatedAt,
            messageCount: conv.messages.length,
            provider: conv.provider,
            model: conv.model,
          });
        }
      }

      return summaries;
    },

    async get(id: string): Promise<Conversation | null> {
      return (await storageAdapter.get<Conversation>(convKey(id))) ?? null;
    },

    async create(provider?: string, model?: string): Promise<string> {
      const id = generateId();
      const conversation: Conversation = {
        id,
        title: 'New conversation',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        provider,
        model,
      };

      await storageAdapter.set(convKey(id), conversation);

      // Prepend to index
      const ids = await getIndex();
      ids.unshift(id);
      await setIndex(ids);

      return id;
    },

    async updateMeta(id, updates) {
      const conv = await storageAdapter.get<Conversation>(convKey(id));
      if (!conv) return;

      const updated = { ...conv, ...updates, updatedAt: Date.now() };
      await storageAdapter.set(convKey(id), updated);
    },

    async addMessage(id, message) {
      const conv = await storageAdapter.get<Conversation>(convKey(id));
      if (!conv) return;

      conv.messages.push(message);
      conv.updatedAt = Date.now();

      // Auto-title from first user message
      if (conv.messages.length === 1 && message.role === 'user') {
        conv.title = message.content.slice(0, 60);
      }

      await storageAdapter.set(convKey(id), conv);

      // Bump to top of index
      const ids = await getIndex();
      const filtered = ids.filter((i) => i !== id);
      filtered.unshift(id);
      await setIndex(filtered);
    },

    async updateMessage(id, messageId, updates) {
      const conv = await storageAdapter.get<Conversation>(convKey(id));
      if (!conv) return;

      conv.messages = conv.messages.map((m) =>
        m.id === messageId ? { ...m, ...updates } : m
      );
      await storageAdapter.set(convKey(id), conv);
    },

    async appendToMessage(id, messageId, content) {
      const conv = await storageAdapter.get<Conversation>(convKey(id));
      if (!conv) return;

      conv.messages = conv.messages.map((m) =>
        m.id === messageId ? { ...m, content: m.content + content } : m
      );
      await storageAdapter.set(convKey(id), conv);
    },

    async delete(id) {
      await storageAdapter.delete(convKey(id));
      const ids = await getIndex();
      await setIndex(ids.filter((i) => i !== id));
    },

    async clear() {
      const ids = await getIndex();
      for (const id of ids) {
        await storageAdapter.delete(convKey(id));
      }
      await setIndex([]);
    },

    async search(query) {
      const all = await this.list();
      const lower = query.toLowerCase();
      return all.filter((s) => s.title.toLowerCase().includes(lower));
    },
  };
}
