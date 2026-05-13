/**
 * Unified LLM streaming interface.
 * Each adapter translates a provider's SSE format → StreamChunk.
 * 
 * @see Knowledge Base: Wave 5.2 — Unified LLM Streaming Abstraction Layer
 */

import type { StreamChunk } from '../types/stream.js';
import type { ContentPart } from '../types/message.js';

export interface StreamRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] }>;
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Wall-clock cap for the HTTP request + stream read (default 30s). */
  timeoutMs?: number;
}

export interface StreamAdapter {
  readonly provider: string;

  /**
   * Execute a streaming request. Calls onChunk for each normalized token.
   * Returns total usage stats on completion.
   */
  stream(
    request: StreamRequest,
    apiKey: string,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}
