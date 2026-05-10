/**
 * Unified LLM streaming interface.
 * Each adapter translates a provider's SSE format → StreamChunk.
 * 
 * @see Knowledge Base: Wave 5.2 — Unified LLM Streaming Abstraction Layer
 */

import type { StreamChunk } from '../types/stream.js';

export interface StreamRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model: string;
  maxTokens?: number;
  temperature?: number;
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
