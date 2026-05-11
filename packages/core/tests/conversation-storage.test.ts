/**
 * Conversation Storage — unit tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConversationStorage } from '../src/domain/conversation-storage.js';
import type { Message } from '../src/types/message.js';

/** In-memory storage adapter for testing. */
function createMemoryAdapter() {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    _store: store,
  };
}

describe('ConversationStorage', () => {
  let adapter: ReturnType<typeof createMemoryAdapter>;
  let cs: ReturnType<typeof createConversationStorage>;

  beforeEach(() => {
    adapter = createMemoryAdapter();
    cs = createConversationStorage(adapter);
  });

  // ── Create ──────────────────────────────────

  it('create returns conversation ID', async () => {
    const id = await cs.create('openai', 'gpt-4o');
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('create adds to index', async () => {
    const id = await cs.create();
    const index = await adapter.get<string[]>('conv_index');
    expect(index).toContain(id);
  });

  it('create stores conversation data', async () => {
    const id = await cs.create('openai', 'gpt-4o');
    const conv = await cs.get(id);
    expect(conv).not.toBeNull();
    expect(conv!.title).toBe('New conversation');
    expect(conv!.provider).toBe('openai');
    expect(conv!.model).toBe('gpt-4o');
    expect(conv!.messages).toEqual([]);
  });

  // ── List ────────────────────────────────────

  it('list returns summaries newest first', async () => {
    const id1 = await cs.create();
    const id2 = await cs.create();
    const list = await cs.list();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(id2); // newest first
    expect(list[1].id).toBe(id1);
  });

  it('list returns empty for no conversations', async () => {
    const list = await cs.list();
    expect(list).toEqual([]);
  });

  // ── Get ─────────────────────────────────────

  it('get returns null for unknown ID', async () => {
    const result = await cs.get('nonexistent');
    expect(result).toBeNull();
  });

  // ── Add Message ─────────────────────────────

  it('addMessage appends to conversation', async () => {
    const id = await cs.create();
    const msg: Message = {
      id: 'msg1',
      role: 'user',
      content: 'Hello world',
      timestamp: Date.now(),
    };
    await cs.addMessage(id, msg);

    const conv = await cs.get(id);
    expect(conv!.messages.length).toBe(1);
    expect(conv!.messages[0].content).toBe('Hello world');
  });

  it('addMessage auto-titles from first user message', async () => {
    const id = await cs.create();
    const msg: Message = {
      id: 'msg1',
      role: 'user',
      content: 'What is the meaning of life, the universe, and everything?',
      timestamp: Date.now(),
    };
    await cs.addMessage(id, msg);

    const conv = await cs.get(id);
    expect(conv!.title).toBe('What is the meaning of life, the universe, and everything?');
  });

  it('addMessage bumps conversation to top of index', async () => {
    const id1 = await cs.create();
    const id2 = await cs.create();

    // id2 is at top. Now add message to id1
    await cs.addMessage(id1, {
      id: 'msg1',
      role: 'user',
      content: 'test',
      timestamp: Date.now(),
    });

    const index = await adapter.get<string[]>('conv_index');
    expect(index![0]).toBe(id1); // bumped to top
  });

  // ── Update Message ──────────────────────────

  it('updateMessage modifies specific message', async () => {
    const id = await cs.create();
    await cs.addMessage(id, {
      id: 'msg1',
      role: 'assistant',
      content: 'initial',
      timestamp: Date.now(),
      isStreaming: true,
    });

    await cs.updateMessage(id, 'msg1', { content: 'final', isStreaming: false });

    const conv = await cs.get(id);
    expect(conv!.messages[0].content).toBe('final');
    expect(conv!.messages[0].isStreaming).toBe(false);
  });

  // ── Append To Message ───────────────────────

  it('appendToMessage concatenates content', async () => {
    const id = await cs.create();
    await cs.addMessage(id, {
      id: 'msg1',
      role: 'assistant',
      content: 'Hello',
      timestamp: Date.now(),
    });

    await cs.appendToMessage(id, 'msg1', ' World');

    const conv = await cs.get(id);
    expect(conv!.messages[0].content).toBe('Hello World');
  });

  // ── Delete ──────────────────────────────────

  it('delete removes conversation and index entry', async () => {
    const id = await cs.create();
    await cs.delete(id);

    const conv = await cs.get(id);
    expect(conv).toBeNull();

    const index = await adapter.get<string[]>('conv_index');
    expect(index).not.toContain(id);
  });

  // ── Clear ───────────────────────────────────

  it('clear removes all conversations', async () => {
    await cs.create();
    await cs.create();
    await cs.clear();

    const list = await cs.list();
    expect(list).toEqual([]);

    const index = await adapter.get<string[]>('conv_index');
    expect(index).toEqual([]);
  });

  // ── Search ──────────────────────────────────

  it('search filters by title', async () => {
    const id1 = await cs.create();
    const id2 = await cs.create();

    await cs.updateMeta(id1, { title: 'React hooks guide' });
    await cs.updateMeta(id2, { title: 'Python debugging' });

    const results = await cs.search('react');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('React hooks guide');
  });

  it('search returns empty for no match', async () => {
    await cs.create();
    const results = await cs.search('nonexistent');
    expect(results).toEqual([]);
  });

  // ── Update Meta ─────────────────────────────

  it('updateMeta changes title', async () => {
    const id = await cs.create();
    await cs.updateMeta(id, { title: 'Custom Title' });

    const conv = await cs.get(id);
    expect(conv!.title).toBe('Custom Title');
  });
});
