/**
 * Inter-Process Communication abstraction.
 * 
 * Chrome Extension: chrome.runtime.sendMessage / connect (Ports)
 * Tauri Native: @tauri-apps/api invoke / Channel API
 * 
 * @see Knowledge Base: Wave 5.4 — Portable Chrome Extension to Tauri Abstraction
 */

export type IPCUnsubscribe = () => void;
export type IPCEventHandler<T = unknown> = (payload: T) => void;
export type IPCStreamHandler<T = unknown> = (chunk: T, done: boolean) => void;

export interface IPCProvider {
  /**
   * Single request-response invocation against the backend.
   */
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;

  /**
   * Subscribe to server-initiated broadcast events.
   */
  listen<T = unknown>(event: string, handler: IPCEventHandler<T>): Promise<IPCUnsubscribe>;

  /**
   * Persistent streaming connection for high-throughput data.
   */
  stream<T = unknown>(
    streamId: string,
    onChunk: IPCStreamHandler<T>,
    args?: Record<string, unknown>
  ): Promise<IPCUnsubscribe>;
}
