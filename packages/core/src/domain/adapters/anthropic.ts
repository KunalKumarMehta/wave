/**
 * Anthropic streaming adapter.
 * Handles: claude-sonnet-4, claude-haiku-4, claude-3.5-haiku
 *
 * SSE format: event-based (message_start, content_block_delta, message_delta, message_stop)
 * Delta: {"type":"content_block_delta","delta":{"type":"text_delta","text":"token"}}
 *
 * @see Knowledge Base: Wave 5.2
 */

import type { StreamChunk } from '../../types/stream.js';
import type { StreamAdapter, StreamRequest } from '../stream-provider.js';
import {
  combineTimeoutSignal,
  defaultStreamTimeoutMs,
  fetchWith429Retry,
  formatNetworkError,
  parseRetryAfterSeconds,
} from './stream-fetch.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Build JSON body for /v1/messages (exported for tests). */
export function buildAnthropicBody(request: StreamRequest) {
  const systemMessage = request.messages.find((m) => m.role === 'system');
  const chatMessages = request.messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content.map((c) => {
            if (c.type === 'text') return { type: 'text', text: c.text };
            if (c.type === 'image')
              return {
                type: 'image',
                source: { type: 'base64', media_type: c.mimeType || 'image/png', data: c.data },
              };
            return c;
          }),
        };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content as string };
    });

  return {
    model: request.model,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 0.7,
    stream: true,
    ...(systemMessage ? { system: systemMessage.content } : {}),
    messages: chatMessages,
  };
}

export class AnthropicAdapter implements StreamAdapter {
  readonly provider = 'anthropic';

  async stream(
    request: StreamRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const timeoutMs = request.timeoutMs ?? defaultStreamTimeoutMs();
    const combined = combineTimeoutSignal(signal, timeoutMs);
    const body = JSON.stringify(buildAnthropicBody(request));

    let response: Response;
    try {
      response = await fetchWith429Retry(
        ANTHROPIC_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body,
          signal: combined,
        },
        (text) => onChunk({ type: 'text_delta', content: text }),
      );
    } catch (err) {
      onChunk({ type: 'error', content: formatNetworkError(err) });
      return;
    }

    if (!response.ok) {
      if (response.status === 429) {
        const sec = parseRetryAfterSeconds(response.headers.get('Retry-After'));
        await response.text().catch(() => '');
        onChunk({
          type: 'error',
          content: `Rate limited — retry in ${sec}s`,
        });
        return;
      }
      const errorBody = await response.text();
      onChunk({
        type: 'error',
        content: `Anthropic API error ${response.status}: ${errorBody}`,
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onChunk({ type: 'error', content: 'No response body' });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7);
            continue;
          }

          if (!trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6).trim();
          if (!payload) continue;

          try {
            const json = JSON.parse(payload);

            switch (currentEvent || json.type) {
              case 'content_block_delta':
                if (json.delta?.type === 'text_delta') {
                  onChunk({
                    type: 'text_delta',
                    content: json.delta.text,
                  });
                } else if (json.delta?.type === 'thinking_delta') {
                  onChunk({
                    type: 'thinking_delta',
                    content: json.delta.thinking,
                  });
                }
                break;

              case 'message_delta':
                onChunk({
                  type: 'done',
                  content: '',
                  metadata: {
                    finishReason: json.delta?.stop_reason === 'end_turn' ? 'stop' : 'unknown',
                    usage: json.usage
                      ? {
                          promptTokens: inputTokens,
                          completionTokens: json.usage.output_tokens,
                        }
                      : undefined,
                  },
                });
                break;

              case 'message_start':
                if (json.message?.usage) {
                  inputTokens = json.message.usage.input_tokens ?? 0;
                }
                break;

              case 'message_stop':
                break;
            }

            currentEvent = '';
          } catch {
            /* partial JSON — ignore until next line */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
