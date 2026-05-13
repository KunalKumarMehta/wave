import type { BrowserController, TargetIdentifier, IPCUnsubscribe, PageContext } from '@wave/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DOM_EXTRACTOR_SCRIPT, wrapScriptForResult, getClickScript, getTypeScript } from './dom-extractor';

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
    const targets: TargetIdentifier[] = [];
    
    // Add embedded browser if available
    targets.push({ id: 'browser', type: 'webview' });

    try {
      const res = await fetch('http://localhost:9222/json');
      const cdpTargets = await res.json();
      cdpTargets
        .filter((t: any) => t.type === 'page')
        .forEach((t: any) => targets.push({
          id: t.id,
          type: 'tab' as const,
        }));
    } catch (err) {
      // Ignore if CDP not available
    }

    return targets;
  }

  async extractPageContextFromWebview(_label: string = 'browser'): Promise<PageContext> {
    const requestId = Math.random().toString(36).substring(7);
    const wrappedScript = wrapScriptForResult(DOM_EXTRACTOR_SCRIPT, requestId);

    return new Promise(async (resolve, reject) => {
      let unlistenFn: (() => void) | undefined;
      
      const timeout = setTimeout(() => {
        if (unlistenFn) unlistenFn();
        reject(new Error('DOM extraction timed out'));
      }, 5000);

      unlistenFn = await listen('browser-ipc', (event: any) => {
        try {
          const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
          if (payload.requestId === requestId) {
            clearTimeout(timeout);
            if (unlistenFn) unlistenFn();
            
            if (payload.error) {
              reject(new Error(payload.error));
            } else {
              const data = typeof payload.result === 'string' ? JSON.parse(payload.result) : payload.result;
              resolve({
                url: data.url,
                title: data.title,
                elements: data.elements.reduce((acc: any, el: any) => {
                  acc[el.ref] = el;
                  return acc;
                }, {}),
                markdown: data.elements.map((el: any) => `[ref=${el.ref}] ${el.role} "${el.name}"`).join('\n'),
                stats: {
                  totalNodes: data.elements.length,
                  filteredNodes: 0,
                  outputTokenEstimate: Math.ceil(JSON.stringify(data.elements).length / 3.2)
                }
              });
            }
          }
        } catch (e) {
          // ignore parsing errors
        }
      });

      invoke('eval_browser', { js: wrappedScript }).catch((err) => {
        clearTimeout(timeout);
        if (unlistenFn) unlistenFn();
        reject(err);
      });
    });
  }

  async executeActionInWebview(action: string, params: Record<string, any>, _label: string = 'browser'): Promise<any> {
    let script = '';
    if (action === 'click') {
      script = getClickScript(params.ref);
    } else if (action === 'type') {
      script = getTypeScript(params.ref, params.text);
    } else if (action === 'scroll') {
      const amount = params.direction === 'down' ? 300 : -300;
      script = `window.scrollBy(0, ${amount}); true;`;
    } else if (action === 'navigate') {
      return invoke('navigate_browser', { url: params.url });
    } else {
      throw new Error(`Unsupported action for webview: ${action}`);
    }

    const requestId = Math.random().toString(36).substring(7);
    const wrappedScript = wrapScriptForResult(script, requestId);

    return new Promise(async (resolve, reject) => {
      let unlistenFn: (() => void) | undefined;
      const timeout = setTimeout(() => {
        if (unlistenFn) unlistenFn();
        reject(new Error(`Action ${action} timed out`));
      }, 5000);

      unlistenFn = await listen('browser-ipc', (event: any) => {
        try {
          const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
          if (payload.requestId === requestId) {
            clearTimeout(timeout);
            if (unlistenFn) unlistenFn();
            if (payload.error) reject(new Error(payload.error));
            else resolve(payload.result);
          }
        } catch (e) {}
      });

      invoke('eval_browser', { js: wrappedScript }).catch(reject);
    });
  }
}
