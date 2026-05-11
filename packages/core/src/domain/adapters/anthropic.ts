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

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicAdapter implements StreamAdapter {
  readonly provider = 'anthropic';

  async stream(
    request: StreamRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    // Anthropic uses separate system param, not in messages array
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const chatMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        stream: true,
        ...(systemMessage ? { system: systemMessage.content } : {}),
        messages: chatMessages,
      }),
      signal,
    });

    if (!response.ok) {
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
    let inputTokens = 0; // Captured from message_start, reported in message_delta

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

          try {
            const json = JSON.parse(trimmed.slice(6));

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
                // Capture input tokens — reported later in message_delta
                if (json.message?.usage) {
                  inputTokens = json.message.usage.input_tokens ?? 0;
                }
                break;

              case 'message_stop':
                // Final signal
                break;
            }

            currentEvent = '';
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
