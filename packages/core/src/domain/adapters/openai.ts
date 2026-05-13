/**
 * OpenAI streaming adapter.
 * Handles: gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o4-mini
 *
 * SSE format: data: {"choices":[{"delta":{"content":"token"}}]}
 * Terminal: data: [DONE]
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

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Build JSON body for /v1/chat/completions (exported for tests). */
export function buildOpenAIBody(request: StreamRequest) {
  return {
    model: request.model,
    messages: request.messages.map((m) => {
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map((c) => {
            if (c.type === 'text') return { type: 'text', text: c.text };
            if (c.type === 'image')
              return {
                type: 'image_url',
                image_url: { url: `data:${c.mimeType || 'image/png'};base64,${c.data}` },
              };
            return c;
          }),
        };
      }
      return m;
    }),
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature ?? 0.7,
    stream: true,
    stream_options: { include_usage: true },
  };
}

export class OpenAIAdapter implements StreamAdapter {
  readonly provider = 'openai';

  async stream(
    request: StreamRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const timeoutMs = request.timeoutMs ?? defaultStreamTimeoutMs();
    const combined = combineTimeoutSignal(signal, timeoutMs);
    const body = JSON.stringify(buildOpenAIBody(request));

    let response: Response;
    try {
      response = await fetchWith429Retry(
        OPENAI_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
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
        content: `OpenAI API error ${response.status}: ${errorBody}`,
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            if (trimmed === 'data: [DONE]') {
              onChunk({ type: 'done', content: '' });
            }
            continue;
          }

          if (!trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6).trim();
          if (!payload) continue;

          try {
            const json = JSON.parse(payload);
            const choice = json.choices?.[0];

            if (choice?.delta?.content) {
              onChunk({
                type: 'text_delta',
                content: choice.delta.content,
              });
            }

            if (json.usage) {
              onChunk({
                type: 'done',
                content: '',
                metadata: {
                  finishReason: choice?.finish_reason ?? 'stop',
                  usage: {
                    promptTokens: json.usage.prompt_tokens,
                    completionTokens: json.usage.completion_tokens,
                  },
                },
              });
            }
          } catch {
            /* partial or non-JSON line — wait for more in buffer */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
