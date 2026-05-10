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

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiAdapter implements StreamAdapter {
  readonly provider = 'gemini';

  async stream(
    request: StreamRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const url = `${GEMINI_API_BASE}/${request.model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // Convert OpenAI-style messages to Gemini format
    const systemInstruction = request.messages.find((m) => m.role === 'system');
    const chatMessages = request.messages.filter((m) => m.role !== 'system');

    // Gemini requires alternating user/model roles, starting with user
    const contents = chatMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
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

          try {
            const json = JSON.parse(trimmed.slice(6));
            const candidate = json.candidates?.[0];

            // Extract text delta
            const text = candidate?.content?.parts?.[0]?.text;
            if (text) {
              onChunk({
                type: 'text_delta',
                content: text,
              });
            }

            // Check for finish reason
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
            // Skip malformed JSON
          }
        }
      }

      // Send done if not already sent via finishReason
      onChunk({ type: 'done', content: '' });
    } finally {
      reader.releaseLock();
    }
  }
}
