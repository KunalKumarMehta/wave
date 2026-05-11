/**
 * Native bindings — Phase 3 (Tauri + CEF).
 * Placeholder exports. Implementations will wrap:
 * - @tauri-apps/api invoke + Channel (IPC)
 * - tauri-plugin-store + tauri-plugin-sql (Storage)
 * - CEF --remote-debugging-port WebSocket (CDP)
 * - candle-rs / tauri-plugin-llm (Inference)
 */

export const NATIVE_BINDINGS_VERSION = '0.1.0';

export { NativeIPCProvider } from './ipc.js';
export { NativeStorageProvider } from './storage.js';
export { NativeBrowserController } from './cdp.js';
