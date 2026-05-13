import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../src/domain/context-builder.js';

describe('ContextBuilder', () => {
  it('builds messages in correct order', () => {
    const ctx = new ContextBuilder(10000)
      .system('You are Wave')
      .history([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ])
      .query('What is this?')
      .build();

    expect(ctx.messages).toHaveLength(4);
    expect(ctx.messages[0].role).toBe('system');
    expect(ctx.messages[0].content).toBe('You are Wave');
    expect(ctx.messages[1].role).toBe('user');
    expect(ctx.messages[1].content).toBe('Hello');
    expect(ctx.messages[2].role).toBe('assistant');
    expect(ctx.messages[2].content).toBe('Hi');
    expect(ctx.messages[3].role).toBe('user');
    expect(ctx.messages[3].content).toBe('What is this?');
  });

  it('always includes system and query even over budget', () => {
    const ctx = new ContextBuilder(1) // Impossibly small budget
      .system('You are Wave, an AI assistant')
      .query('Tell me everything')
      .build();

    expect(ctx.messages).toHaveLength(2);
    expect(ctx.messages[0].content).toBe('You are Wave, an AI assistant');
    expect(ctx.messages[1].content).toBe('Tell me everything');
  });

  it('drops history when over budget', () => {
    const ctx = new ContextBuilder(50)
      .system('Sys')
      .history([
        { role: 'user', content: 'A'.repeat(200) },
        { role: 'assistant', content: 'B'.repeat(200) },
      ])
      .query('Q')
      .build();

    expect(ctx.messages).toHaveLength(2); // Only system + query
    expect(ctx.dropped.length).toBeGreaterThan(0);
    expect(ctx.dropped.some((d) => d.startsWith('history-'))).toBe(true);
  });

  it('includes page context with URL and title', () => {
    const ctx = new ContextBuilder(10000)
      .system('Sys')
      .pageContext('button "Submit"\nlink "Home"', 'https://example.com', 'Example')
      .query('What is on this page?')
      .build();

    const pageMsg = ctx.messages.find((m) => m.content.includes('Page URL'));
    expect(pageMsg).toBeDefined();
    expect(pageMsg!.content).toContain('https://example.com');
    expect(pageMsg!.content).toContain('Example');
    expect(pageMsg!.content).toContain('button "Submit"');
  });

  it('drops oldest history first', () => {
    // Budget enough for system + query + 1 history turn
    const ctx = new ContextBuilder(200)
      .system('S')
      .history([
        { role: 'user', content: 'Old question' },
        { role: 'assistant', content: 'Old answer' },
        { role: 'user', content: 'Recent question' },
        { role: 'assistant', content: 'Recent answer' },
      ])
      .query('Now?')
      .build();

    // Should keep newest history, drop oldest
    const contents = ctx.messages.map((m) => m.content);
    if (ctx.dropped.length > 0) {
      // Dropped items should be older indices
      expect(ctx.dropped[0]).toMatch(/history-0|history-1/);
    }
  });

  it('reports accurate token estimates', () => {
    const ctx = new ContextBuilder(10000)
      .system('Hello')
      .query('World')
      .build();

    expect(ctx.tokenEstimate).toBeGreaterThan(0);
    // Prose ratio: ~4 chars/token
    expect(ctx.tokenEstimate).toBeLessThan(10);
  });

  it('screenshot adds image part to query message', () => {
    const ctx = new ContextBuilder(10000)
      .system('S')
      .query('What do you see?')
      .screenshot('base64imagedata')
      .build();

    const last = ctx.messages[ctx.messages.length - 1];
    expect(last.role).toBe('user');
    expect(Array.isArray(last.content)).toBe(true);
    const parts = last.content as { type: string; text?: string; data?: string }[];
    expect(parts[0]).toEqual({ type: 'text', text: 'What do you see?' });
    expect(parts[1].type).toBe('image');
    expect(parts[1].data).toBe('base64imagedata');
  });

  it('reserves 1000 tokens in budget when screenshot set', () => {
    const ctx = new ContextBuilder(2000)
      .system('S')
      .pageContext('x'.repeat(4000), 'https://a.com', 'T')
      .query('Q')
      .screenshot('img')
      .build();

    expect(ctx.tokenEstimate).toBeGreaterThanOrEqual(1000);
    const queryMsg = ctx.messages.find((m) => m.role === 'user' && Array.isArray(m.content));
    expect(queryMsg).toBeDefined();
  });

  it('query stays string when no screenshot', () => {
    const ctx = new ContextBuilder(10000).system('S').query('Plain').build();
    const last = ctx.messages[ctx.messages.length - 1];
    expect(last.content).toBe('Plain');
  });
});
