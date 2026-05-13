/**
 * Conversation and message types.
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export type ContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface Message {
  id: string;
  role: MessageRole;
  content: string | ContentPart[];
  timestamp: number;
  /** If this message contains tool calls. */
  toolCalls?: ToolCallResult[];
  /** Streaming state — true while tokens are still arriving. */
  isStreaming?: boolean;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: string;
  result?: unknown;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Provider used for this conversation. */
  provider?: string;
  /** Model used. */
  model?: string;
  /** Pinned conversation. */
  pinned?: boolean;
  /** Archived conversation. */
  archived?: boolean;
}
