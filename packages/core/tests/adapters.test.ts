import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIAdapter, buildOpenAIBody } from '../src/domain/adapters/openai.js';
import { AnthropicAdapter, buildAnthropicBody } from '../src/domain/adapters/anthropic.js';
import { GeminiAdapter, buildGeminiBody } from '../src/domain/adapters/gemini.js';
import type { StreamRequest } from '../src/domain/stream-provider.js';

function sseResponse(chunks: string[]): Response {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('buildOpenAIBody', () => {
  it('maps text-only messages', () => {
    const req: StreamRequest = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Sys' },
        { role: 'user', content: 'Hello' },
      ],
    };
    const body = buildOpenAIBody(req);
    expect(body.messages).toEqual(req.messages);
  });

  it('maps ContentPart[] to OpenAI multimodal blocks', () => {
    const req: StreamRequest = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image', data: 'AAA', mimeType: 'image/png' },
          ],
        },
      ],
    };
    const body = buildOpenAIBody(req);
    const msg = body.messages[0] as { role: string; content: unknown[] };
    expect(msg.content[0]).toEqual({ type: 'text', text: 'What is this?' });
    expect(msg.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AAA' },
    });
  });
});

describe('buildAnthropicBody', () => {
  it('pulls system out and keeps string user messages', () => {
    const req: StreamRequest = {
      model: 'claude-sonnet-4-20250514',
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ],
    };
    const body = buildAnthropicBody(req);
    expect(body.system).toBe('You are helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('maps ContentPart[] to Anthropic image blocks', () => {
    const req: StreamRequest = {
      model: 'claude-sonnet-4-20250514',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe' },
            { type: 'image', data: 'YmFzZTY0', mimeType: 'image/png' },
          ],
        },
      ],
    };
    const body = buildAnthropicBody(req);
    const parts = (body.messages as { role: string; content: unknown[] }[])[0].content;
    expect(parts[0]).toEqual({ type: 'text', text: 'Describe' });
    expect(parts[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'YmFzZTY0' },
    });
  });
});

describe('buildGeminiBody', () => {
  it('maps text-only to parts array', () => {
    const req: StreamRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    const body = buildGeminiBody(req);
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }]);
  });

  it('maps ContentPart[] to Gemini inlineData', () => {
    const req: StreamRequest = {
      model: 'gemini-2.0-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Caption' },
            { type: 'image', data: 'QQ==', mimeType: 'image/png' },
          ],
        },
      ],
    };
    const body = buildGeminiBody(req);
    const parts = (body.contents as { parts: unknown[] }[])[0].parts;
    expect(parts[0]).toEqual({ text: 'Caption' });
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'QQ==' } });
  });
});

describe('OpenAIAdapter.stream', () => {
  const orig = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(sseResponse(['data: [DONE]\n'])),
      ),
    );
  });

  afterEach(() => {
    vi.stubGlobal('fetch', orig);
    vi.restoreAllMocks();
  });

  it('sends expected JSON body for multimodal request', async () => {
    const adapter = new OpenAIAdapter();
    const req: StreamRequest = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'x' },
            { type: 'image', data: 'ABC', mimeType: 'image/png' },
          ],
        },
      ],
      timeoutMs: 60_000,
    };
    await adapter.stream(req, 'sk-test', () => {}, undefined);
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.openai.com/v1/chat/completions');
    const sent = JSON.parse(call[1].body as string);
    expect(sent.messages[0].content[1].type).toBe('image_url');
    expect(sent.messages[0].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);
  });
});

describe('AnthropicAdapter.stream', () => {
  const orig = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(sseResponse(['event: message_stop\ndata: {}\n'])),
      ),
    );
  });

  afterEach(() => {
    vi.stubGlobal('fetch', orig);
    vi.restoreAllMocks();
  });

  it('POSTs messages array without system inside messages', async () => {
    const adapter = new AnthropicAdapter();
    const req: StreamRequest = {
      model: 'claude-3-5-haiku-20241022',
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'Hi' },
      ],
    };
    await adapter.stream(req, 'k-test', () => {}, undefined);
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const sent = JSON.parse(call[1].body as string);
    expect(sent.system).toBe('S');
    expect(sent.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });
});

describe('GeminiAdapter.stream', () => {
  const orig = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(sseResponse(['data: {}\n']))),
    );
  });

  afterEach(() => {
    vi.stubGlobal('fetch', orig);
    vi.restoreAllMocks();
  });

  it('POSTs Gemini contents with inline image', async () => {
    const adapter = new GeminiAdapter();
    const req: StreamRequest = {
      model: 'gemini-2.0-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 't' },
            { type: 'image', data: 'xx', mimeType: 'image/png' },
          ],
        },
      ],
    };
    await adapter.stream(req, 'key', () => {}, undefined);
    const call = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain('gemini-2.0-flash');
    expect(String(call[0])).toContain('key=key');
    const sent = JSON.parse(call[1].body as string);
    expect(sent.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'xx' } });
  });
});

describe('adapter error handling', () => {
  const orig = globalThis.fetch;

  afterEach(() => {
    vi.stubGlobal('fetch', orig);
    vi.restoreAllMocks();
  });

  it('OpenAI emits error chunk on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const chunks: { type: string; content: string }[] = [];
    const adapter = new OpenAIAdapter();
    await adapter.stream({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'a' }] }, 'k', (c) =>
      chunks.push(c as { type: string; content: string }),
    );
    expect(chunks.some((c) => c.type === 'error' && c.content.includes('fetch'))).toBe(true);
  });

  it('emits rate-limit notice then succeeds on retry', async () => {
    vi.useFakeTimers();
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        n += 1;
        if (n === 1) {
          return Promise.resolve(
            new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
          );
        }
        return Promise.resolve(sseResponse(['data: [DONE]\n']));
      }),
    );
    const deltas: string[] = [];
    const adapter = new OpenAIAdapter();
    const p = adapter.stream({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'a' }] }, 'k', (c) => {
      if (c.type === 'text_delta') deltas.push(c.content);
    });
    await vi.advanceTimersByTimeAsync(1100);
    await p;
    expect(deltas.some((d) => d.includes('Rate limited'))).toBe(true);
    vi.useRealTimers();
  });
});
