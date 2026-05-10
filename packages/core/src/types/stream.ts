/**
 * Unified LLM streaming types.
 * 
 * Normalizes OpenAI, Anthropic, and Gemini SSE streams into a single
 * discriminated union consumed by the UI layer.
 * 
 * @see Knowledge Base: Wave 5.2 — Unified LLM Streaming Abstraction Layer
 */

export type ChunkType = 'text_delta' | 'tool_call_delta' | 'thinking_delta' | 'done' | 'error';

export interface StreamMetadata {
  id?: string;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error' | 'unknown';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    thinkingTokens?: number;
  };
  /** Provider-specific data preserved without loss. */
  providerSpecific?: {
    anthropicSignature?: string;
    openaiLogprobs?: unknown;
    geminiSafetyRatings?: unknown;
  };
}

export interface StreamChunk {
  type: ChunkType;
  /** The delta string — text fragment, JSON fragment, or thought. */
  content: string;
  metadata?: StreamMetadata;
}
