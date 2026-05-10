/**
 * Chrome Extension CDP implementation via chrome.debugger API.
 * 
 * Wraps chrome.debugger.attach/sendCommand/detach behind the BrowserController interface.
 * Handles the MV3 constraint: debugger sessions show a visible banner.
 * 
 * @see Knowledge Base: Wave 5.1, Wave 3.2
 */

import type { BrowserController, TargetIdentifier } from '@wave/core';
import type { IPCUnsubscribe } from '@wave/core';

const CDP_VERSION = '1.3';

// Track attached targets to prevent double-attach
const attachedTargets = new Set<string>();

export class ExtBrowserController implements BrowserController {
  async attach(target: TargetIdentifier): Promise<void> {
    if (attachedTargets.has(target.id)) return;

    return new Promise((resolve, reject) => {
      chrome.debugger.attach({ tabId: Number(target.id) }, CDP_VERSION, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        attachedTargets.add(target.id);
        resolve();
      });
    });
  }

  async detach(target: TargetIdentifier): Promise<void> {
    if (!attachedTargets.has(target.id)) return;

    return new Promise((resolve) => {
      chrome.debugger.detach({ tabId: Number(target.id) }, () => {
        attachedTargets.delete(target.id);
        resolve();
      });
    });
  }

  async sendCommand<T = unknown>(
    target: TargetIdentifier,
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(
        { tabId: Number(target.id) },
        method,
        params ?? {},
        (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result as T);
        }
      );
    });
  }

  onEvent(
    eventName: string,
    handler: (target: TargetIdentifier, payload: unknown) => void
  ): IPCUnsubscribe {
    const listener = (
      source: chrome.debugger.Debuggee,
      method: string,
      params?: object
    ) => {
      if (method === eventName && source.tabId) {
        handler(
          { id: String(source.tabId), type: 'tab' },
          params
        );
      }
    };

    chrome.debugger.onEvent.addListener(listener);
    return () => chrome.debugger.onEvent.removeListener(listener);
  }

  async getTargets(): Promise<TargetIdentifier[]> {
    return new Promise((resolve) => {
      chrome.debugger.getTargets((targets) => {
        resolve(
          targets
            .filter((t) => t.type === 'page' && t.tabId)
            .map((t) => ({
              id: String(t.tabId),
              type: 'tab' as const,
            }))
        );
      });
    });
  }
}
