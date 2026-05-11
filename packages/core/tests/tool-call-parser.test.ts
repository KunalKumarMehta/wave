/**
 * Tool Call Parser — unit tests.
 */

import { describe, it, expect } from 'vitest';
import { parseToolCall, hasCompleteAction, isTerminalAction } from '../src/domain/tool-call-parser.js';

describe('parseToolCall', () => {
  // ── JSON block format ──

  it('parses click action from JSON block', () => {
    const text = `I'll click the login button.

\`\`\`json
{"action": "click", "ref": "e5", "description": "Clicking login"}
\`\`\``;

    const result = parseToolCall(text);
    expect(result).toEqual({
      action: 'click',
      params: { ref: 'e5', description: 'Clicking login' },
    });
  });

  it('parses type action with text param', () => {
    const text = `Typing email into the field.

\`\`\`json
{"action": "type", "ref": "e3", "text": "user@example.com", "description": "Entering email"}
\`\`\``;

    const result = parseToolCall(text);
    expect(result).toEqual({
      action: 'type',
      params: { ref: 'e3', text: 'user@example.com', description: 'Entering email' },
    });
  });

  it('parses scroll action', () => {
    const text = '```json\n{"action": "scroll", "direction": "down", "description": "Scrolling to see more"}\n```';
    const result = parseToolCall(text);
    expect(result).toEqual({
      action: 'scroll',
      params: { direction: 'down', description: 'Scrolling to see more' },
    });
  });

  it('parses done action', () => {
    const text = 'Task complete.\n\n```json\n{"action": "done", "summary": "Clicked login and entered email"}\n```';
    const result = parseToolCall(text);
    expect(result).toEqual({
      action: 'done',
      params: { summary: 'Clicked login and entered email' },
    });
  });

  it('takes LAST JSON block when multiple present', () => {
    const text = `Here's an example:
\`\`\`json
{"action": "click", "ref": "e1", "description": "example"}
\`\`\`

But actually I need to:
\`\`\`json
{"action": "type", "ref": "e9", "text": "hello", "description": "real action"}
\`\`\``;

    const result = parseToolCall(text);
    expect(result?.action).toBe('type');
    expect(result?.params.ref).toBe('e9');
  });

  it('rejects unknown action names', () => {
    const text = '```json\n{"action": "delete", "ref": "e1"}\n```';
    expect(parseToolCall(text)).toBeNull();
  });

  it('returns null for text without actions', () => {
    expect(parseToolCall('This page shows a search bar and navigation links.')).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const text = '```json\n{action: broken}\n```';
    expect(parseToolCall(text)).toBeNull();
  });

  // ── Inline ACTION format ──

  it('parses inline ACTION format as fallback', () => {
    const text = 'ACTION: click(ref="e5", description="Clicking login")';
    const result = parseToolCall(text);
    expect(result).toEqual({
      action: 'click',
      params: { ref: 'e5', description: 'Clicking login' },
    });
  });

  it('parses inline ACTION with unquoted values', () => {
    const text = 'ACTION: scroll(direction=down)';
    const result = parseToolCall(text);
    expect(result).toEqual({
      action: 'scroll',
      params: { direction: 'down' },
    });
  });

  // ── JSON block without language tag ──

  it('parses JSON block without language tag', () => {
    const text = '```\n{"action": "navigate", "url": "https://example.com", "description": "Going to example"}\n```';
    const result = parseToolCall(text);
    expect(result).toEqual({
      action: 'navigate',
      params: { url: 'https://example.com', description: 'Going to example' },
    });
  });
});

describe('hasCompleteAction', () => {
  it('returns true when action block present', () => {
    expect(hasCompleteAction('```json\n{"action": "click", "ref": "e1"}\n```')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasCompleteAction('The page shows a search bar.')).toBe(false);
  });
});

describe('isTerminalAction', () => {
  it('returns true for done action', () => {
    expect(isTerminalAction({ action: 'done', params: { summary: 'test' } })).toBe(true);
  });

  it('returns false for non-done actions', () => {
    expect(isTerminalAction({ action: 'click', params: { ref: 'e1' } })).toBe(false);
  });
});
