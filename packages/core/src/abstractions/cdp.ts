/**
 * Browser control abstraction via Chrome DevTools Protocol.
 * 
 * Chrome Extension: chrome.debugger API (restricted domains)
 * Tauri + CEF: WebSocket to --remote-debugging-port (full protocol)
 * 
 * @see Knowledge Base: Wave 5.4, Wave 3.2 — CDP Agent Action Patterns
 */

import type { IPCUnsubscribe } from './ipc.js';

export interface PageContext {
  markdown: string;
  elements: Record<string, unknown>;
  stats: { totalNodes: number; filteredNodes: number; outputTokenEstimate: number };
  url: string;
  title: string;
}

export type TargetIdentifier = {
  id: string;
  type: 'tab' | 'webview' | 'window';
};

export interface BrowserController {
  /** Attach debugging protocol to a browser target. */
  attach(target: TargetIdentifier): Promise<void>;

  /** Detach from target. */
  detach(target: TargetIdentifier): Promise<void>;

  /** Send a CDP command and await response. */
  sendCommand<T = unknown>(
    target: TargetIdentifier,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T>;

  /** Subscribe to CDP events. */
  onEvent(
    eventName: string,
    handler: (target: TargetIdentifier, payload: unknown) => void
  ): IPCUnsubscribe;

  /** Get list of available targets. */
  getTargets(): Promise<TargetIdentifier[]>;

  /** Extract page context using webview-native methods (non-CDP). */
  extractPageContextFromWebview?(label: string): Promise<any>;

  /** Execute action using webview-native methods (non-CDP). */
  executeActionInWebview?(action: string, params: Record<string, unknown>, label: string): Promise<any>;
}
