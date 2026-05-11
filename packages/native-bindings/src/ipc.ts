import { invoke, Channel } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { IPCProvider, IPCEventHandler, IPCStreamHandler, IPCUnsubscribe } from '@wave/core';

export class NativeIPCProvider implements IPCProvider {
  async invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(command, args);
  }

  async listen<T = unknown>(event: string, handler: IPCEventHandler<T>): Promise<IPCUnsubscribe> {
    const unlistenFn: UnlistenFn = await listen<T>(event, (e) => {
      handler(e.payload);
    });
    return unlistenFn;
  }

  async stream<T = unknown>(
    streamId: string,
    onChunk: IPCStreamHandler<T>,
    args?: Record<string, unknown>
  ): Promise<IPCUnsubscribe> {
    // We create a channel and pass it as an argument
    const channel = new Channel<T | null>();
    channel.onmessage = (msg) => {
      if (msg === null) {
        onChunk({} as T, true);
      } else {
        onChunk(msg, false);
      }
    };

    // Trigger the stream
    const finalArgs = { ...args, onEvent: channel };
    await invoke(streamId, finalArgs);

    return () => {
      // In Tauri v2 Channels, there's no explicit unsubscribe,
      // but we could send an abort signal via another invoke if needed.
    };
  }
}
