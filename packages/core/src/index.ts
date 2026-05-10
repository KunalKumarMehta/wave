// Abstraction interfaces
export type { IPCProvider, IPCUnsubscribe, IPCEventHandler, IPCStreamHandler } from './abstractions/ipc.js';
export type { StorageProvider } from './abstractions/storage.js';
export type { BrowserController, TargetIdentifier } from './abstractions/cdp.js';
export type { InferenceProvider, GenerationConfig } from './abstractions/inference.js';
export type { UIProvider, WindowOptions } from './abstractions/ui.js';

// Types
export type { StreamChunk, StreamMetadata, ChunkType } from './types/stream.js';
export type { Message, Conversation, MessageRole } from './types/message.js';
