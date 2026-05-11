import type { BrowserController, TargetIdentifier, IPCUnsubscribe } from '@wave/core';

export class NativeBrowserController implements BrowserController {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private eventListeners = new Map<string, Set<(target: TargetIdentifier, payload: any) => void>>();

  async attach(target: TargetIdentifier): Promise<void> {
    // In a real Tauri/CEF environment, we'd fetch the active debugging port
    // from a Tauri command or config. We'll assume localhost:9222 for now.
    const debuggerUrl = `ws://localhost:9222/devtools/page/${target.id}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(debuggerUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
        } else if (msg.method) {
          const listeners = this.eventListeners.get(msg.method);
          if (listeners) {
            listeners.forEach((fn) => fn(target, msg.params));
          }
        }
      };
    });
  }

  async detach(_target: TargetIdentifier): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async sendCommand<T = unknown>(
    _target: TargetIdentifier,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not attached to any target');
    }

    const id = ++this.messageId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  onEvent(
    eventName: string,
    handler: (target: TargetIdentifier, payload: unknown) => void
  ): IPCUnsubscribe {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(handler);

    return () => {
      const listeners = this.eventListeners.get(eventName);
      if (listeners) {
        listeners.delete(handler);
      }
    };
  }

  async getTargets(): Promise<TargetIdentifier[]> {
    try {
      const res = await fetch('http://localhost:9222/json');
      const targets = await res.json();
      return targets
        .filter((t: any) => t.type === 'page')
        .map((t: any) => ({
          id: t.id,
          type: 'tab' as const,
        }));
    } catch (err) {
      console.warn('Could not fetch CDP targets:', err);
      return [];
    }
  }
}
