/**
 * Chrome Extension IPC implementation.
 * Uses chrome.runtime.sendMessage for invoke, chrome.runtime.connect for streaming.
 * 
 * @see Knowledge Base: Wave 5.1, Wave 5.4
 */

import type { IPCProvider, IPCUnsubscribe, IPCEventHandler, IPCStreamHandler } from '@wave/core';

export class ExtIPCProvider implements IPCProvider {
  async invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ command, args }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response?.data as T);
      });
    });
  }

  async listen<T = unknown>(event: string, handler: IPCEventHandler<T>): Promise<IPCUnsubscribe> {
    const listener = (message: { event: string; payload: T }) => {
      if (message.event === event) {
        handler(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }

  async stream<T = unknown>(
    streamId: string,
    onChunk: IPCStreamHandler<T>,
    args?: Record<string, unknown>
  ): Promise<IPCUnsubscribe> {
    const port = chrome.runtime.connect({ name: streamId });

    port.onMessage.addListener((message: { chunk?: T; done?: boolean; error?: string }) => {
      if (message.error) {
        onChunk({ error: message.error } as T, true);
        return;
      }
      if (message.done) {
        onChunk(message.chunk as T, true);
        return;
      }
      if (message.chunk !== undefined) {
        onChunk(message.chunk, false);
      }
    });

    // Send initial args to start the stream
    port.postMessage({ action: 'start', args });

    return () => {
      port.disconnect();
    };
  }
}
