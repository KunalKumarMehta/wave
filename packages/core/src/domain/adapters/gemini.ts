/**
 * Google Gemini streaming adapter.
 * Handles: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash
 *
 * Uses Generative Language API with SSE streaming.
 * URL: POST /v1beta/models/{model}:streamGenerateContent?alt=sse&key={key}
 * SSE: data: {"candidates":[{"content":{"parts":[{"text":"token"}]}}]}
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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Build JSON body for streamGenerateContent (exported for tests). */
export function buildGeminiBody(request: StreamRequest) {
  const systemInstruction = request.messages.find((m) => m.role === 'system');
  const chatMessages = request.messages.filter((m) => m.role !== 'system');

  const contents = chatMessages.map((m) => {
    let parts: unknown[] = [];
    if (Array.isArray(m.content)) {
      parts = m.content.map((c) => {
        if (c.type === 'text') return { text: c.text };
        if (c.type === 'image')
          return { inlineData: { mimeType: c.mimeType || 'image/png', data: c.data } };
        return c;
      });
    } else {
      parts = [{ text: m.content }];
    }

    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction.content }],
    };
  }

  return body;
}

export class GeminiAdapter implements StreamAdapter {
  readonly provider = 'gemini';

  async stream(
    request: StreamRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const url = `${GEMINI_API_BASE}/${request.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const timeoutMs = request.timeoutMs ?? defaultStreamTimeoutMs();
    const combined = combineTimeoutSignal(signal, timeoutMs);
    const body = JSON.stringify(buildGeminiBody(request));

    let response: Response;
    try {
      response = await fetchWith429Retry(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        content: `Gemini API error ${response.status}: ${errorBody}`,
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6).trim();
          if (!payload) continue;

          try {
            const json = JSON.parse(payload);
            const candidate = json.candidates?.[0];

            const text = candidate?.content?.parts?.[0]?.text;
            if (text) {
              onChunk({
                type: 'text_delta',
                content: text,
              });
            }

            if (candidate?.finishReason) {
              const finishMap: Record<string, 'stop' | 'length' | 'error'> = {
                STOP: 'stop',
                MAX_TOKENS: 'length',
                SAFETY: 'error',
                RECITATION: 'error',
              };

              onChunk({
                type: 'done',
                content: '',
                metadata: {
                  finishReason: finishMap[candidate.finishReason] ?? 'unknown',
                  usage: json.usageMetadata
                    ? {
                        promptTokens: json.usageMetadata.promptTokenCount ?? 0,
                        completionTokens: json.usageMetadata.candidatesTokenCount ?? 0,
                        thinkingTokens: json.usageMetadata.thoughtsTokenCount,
                      }
                    : undefined,
                  providerSpecific: {
                    geminiSafetyRatings: candidate.safetyRatings,
                  },
                },
              });
            }
          } catch {
            /* partial JSON */
          }
        }
      }

      onChunk({ type: 'done', content: '' });
    } finally {
      reader.releaseLock();
    }
  }
}
