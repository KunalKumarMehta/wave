/**
 * Wave — Background Service Worker
 * 
 * Stateless router: handles message dispatch, cloud stream proxying, CDP orchestration.
 * All persistent state lives in chrome.storage.
 * 
 * @see Knowledge Base: Wave 5.1 — MV3 Architecture
 */

import { OpenAIAdapter } from '@wave/core/src/domain/adapters/openai.js';
import { AnthropicAdapter } from '@wave/core/src/domain/adapters/anthropic.js';
import { GeminiAdapter } from '@wave/core/src/domain/adapters/gemini.js';
import { serializeAXTree } from '@wave/core/src/domain/ax-serializer.js';
import { ExtBrowserController } from '@wave/ext-bindings/src/cdp.js';
import { ExtTabController } from '@wave/ext-bindings/src/tabs.js';
import { TabManager } from '@wave/core/src/domain/tab-manager.js';
import { ProviderRouter } from '@wave/core/src/domain/provider-router.js';
import { runAgentLoop } from '@wave/core/src/domain/agent-loop.js';
import type { StreamAdapter, StreamRequest } from '@wave/core/src/domain/stream-provider.js';
import type { StreamChunk } from '@wave/core/src/types/stream.js';
import type { ProviderRoute } from '@wave/core/src/domain/provider-router.js';

// Allow Side Panel to access session storage (API keys)
chrome.storage.session.setAccessLevel({
  accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
});

// Open Side Panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Adapter registry
const adapters: Record<string, StreamAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  gemini: new GeminiAdapter(),
};

// CDP controller
const cdp = new ExtBrowserController();
const tabController = new ExtTabController();
const tabManager = new TabManager(tabController);

// ── Router Builder ──────────────────────────────────────────────

/** Fetch stored API key for a provider. */
async function getStoredKey(provider: string): Promise<string | null> {
  const result = await chrome.storage.session.get(`apikey_${provider}`);
  return result[`apikey_${provider}`] ?? null;
}

/**
 * Build ProviderRouter with primary provider first, fallbacks from other configured providers.
 */
async function buildRouter(
  primaryProvider: string,
  primaryKey: string,
  onFailover?: (from: string, to: string, reason: string) => void,
): Promise<ProviderRouter> {
  const routes: ProviderRoute[] = [];

  // Primary first
  if (adapters[primaryProvider]) {
    routes.push({ provider: primaryProvider, adapter: adapters[primaryProvider], apiKey: primaryKey });
  }

  // Add fallbacks from other configured providers
  for (const [name, adapter] of Object.entries(adapters)) {
    if (name === primaryProvider) continue;
    const key = await getStoredKey(name);
    if (key) {
      routes.push({ provider: name, adapter, apiKey: key });
    }
  }

  return new ProviderRouter({ routes, maxRetries: 1, onFailover });
}

// ── Message Router ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { command, args } = message;

  switch (command) {
    case 'ping':
      sendResponse({ data: 'pong' });
      break;

    case 'getApiKey': {
      const provider = args?.provider as string;
      chrome.storage.session.get(`apikey_${provider}`, (result) => {
        sendResponse({ data: result[`apikey_${provider}`] ?? null });
      });
      return true;
    }

    case 'saveApiKey': {
      const { provider, key } = args as { provider: string; key: string };
      chrome.storage.session.set({ [`apikey_${provider}`]: key }, () => {
        sendResponse({ data: true });
      });
      return true;
    }

    case 'getPageContext': {
      handleGetPageContext(args as { tabId: number })
        .then((data) => sendResponse({ data }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    case 'agentAction': {
      handleAgentAction(args as { tabId: number; action: string; params: Record<string, unknown> })
        .then((data) => sendResponse({ data }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    default:
      sendResponse({ error: `Unknown command: ${command}` });
  }

  return false;
});

// ── CDP: Get Page Context ───────────────────────────────────────

async function handleGetPageContext(args: { tabId: number }) {
  const target = { id: String(args.tabId), type: 'tab' as const };

  try {
    await cdp.attach(target);

    // Enable Accessibility domain
    await cdp.sendCommand(target, 'Accessibility.enable');

    // Get full AX tree
    const result = await cdp.sendCommand<{ nodes: unknown[] }>(
      target,
      'Accessibility.getFullAXTree',
      { depth: 4 }
    );

    // Get page URL and title
    const pageInfo = await cdp.sendCommand<{ root: { documentURL: string } }>(
      target,
      'DOM.getDocument',
      { depth: 0 }
    );

    // Get tab title (more reliable than DOM title)
    const tab = await chrome.tabs.get(args.tabId);

    // Serialize to Markdown+refs
    const serialized = serializeAXTree(result.nodes as Parameters<typeof serializeAXTree>[0]);

    // Detach immediately to dismiss banner
    await cdp.detach(target);

    return {
      markdown: serialized.markdown,
      elements: Object.fromEntries(serialized.elements),
      stats: serialized.stats,
      url: pageInfo.root.documentURL,
      title: tab.title ?? '',
    };
  } catch (err) {
    // Always try to detach on error
    try { await cdp.detach(target); } catch { /* ignore */ }
    throw err;
  }
}

// ── CDP: Execute Agent Action ───────────────────────────────────

async function handleAgentAction(args: {
  tabId: number;
  action: string;
  params: Record<string, unknown>;
}) {
  const target = { id: String(args.tabId), type: 'tab' as const };

  try {
    await cdp.attach(target);

    switch (args.action) {
      case 'click': {
        const ref = args.params.ref as string;
        const backendNodeId = args.params.backendNodeId as number;

        if (backendNodeId) {
          // Get box model for coordinates
          const box = await cdp.sendCommand<{
            model: { content: number[] };
          }>(target, 'DOM.getBoxModel', { backendNodeId });

          if (box.model?.content) {
            const [x1, y1, _x2, _y2, x3, y3] = box.model.content;
            const centerX = (x1 + x3) / 2;
            const centerY = (y1 + y3) / 2;

            await cdp.sendCommand(target, 'Input.dispatchMouseEvent', {
              type: 'mousePressed', x: centerX, y: centerY, button: 'left', clickCount: 1,
            });
            await cdp.sendCommand(target, 'Input.dispatchMouseEvent', {
              type: 'mouseReleased', x: centerX, y: centerY, button: 'left', clickCount: 1,
            });
          }
        }

        await cdp.detach(target);
        return { success: true, action: 'click', ref };
      }

      case 'type': {
        const ref = args.params.ref as string;
        const text = args.params.text as string;
        const backendNodeId = args.params.backendNodeId as number;

        if (backendNodeId) {
          // Focus the node first
          await cdp.sendCommand(target, 'DOM.focus', { backendNodeId });

          // Select all existing content
          await cdp.sendCommand(target, 'Input.dispatchKeyEvent', {
            type: 'keyDown', key: 'a', modifiers: 2, // Cmd/Ctrl+A
          });
          await cdp.sendCommand(target, 'Input.dispatchKeyEvent', {
            type: 'keyUp', key: 'a', modifiers: 2,
          });

          // Type new text
          await cdp.sendCommand(target, 'Input.insertText', { text });
        }

        await cdp.detach(target);
        return { success: true, action: 'type', ref, text };
      }

      case 'scroll': {
        const direction = args.params.direction as string;
        const amount = (args.params.amount as number) ?? 400;
        const deltaY = direction === 'down' ? amount : -amount;

        await cdp.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: 200, y: 300, deltaX: 0, deltaY,
        });

        await cdp.detach(target);
        return { success: true, action: 'scroll', direction };
      }

      case 'navigate': {
        const url = args.params.url as string;
        await cdp.sendCommand(target, 'Page.navigate', { url });

        // Wait for load event (max 5s)
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 5000);
          const unsubscribe = cdp.onEvent('Page.loadEventFired', () => {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          });
          cdp.sendCommand(target, 'Page.enable').catch(() => {});
        });

        await cdp.detach(target);
        return { success: true, action: 'navigate', url };
      }

      case 'open_tab': {
        const tab = await tabManager.openTab(args.params.url as string);
        await cdp.detach(target);
        return tab;
      }

      case 'switch_tab': {
        await tabManager.switchTab(args.params.id as string);
        await cdp.detach(target);
        return { success: true };
      }

      case 'close_tab': {
        await tabManager.closeTab(args.params.id as string);
        await cdp.detach(target);
        return { success: true };
      }

      case 'list_tabs': {
        const tabs = await tabManager.listTabs();
        await cdp.detach(target);
        return tabs;
      }

      default:
        await cdp.detach(target);
        return { error: `Unknown action: ${args.action}` };
    }
  } catch (err) {
    try { await cdp.detach(target); } catch { /* ignore */ }
    throw err;
  }
}

// ── Stream Connection Handler ───────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'cloud-stream') {
    handleCloudStream(port);
  } else if (port.name === 'agent-stream') {
    handleAgentStream(port);
  }
});

function handleCloudStream(port: chrome.runtime.Port) {
  let abortController: AbortController | null = null;

  port.onMessage.addListener(async (message) => {
    if (message.action !== 'start') return;

    const { provider, model, messages, apiKey } = message.args as {
      provider: string;
      model: string;
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      apiKey: string;
    };

    if (!adapters[provider]) {
      port.postMessage({ error: `Unknown provider: ${provider}` });
      return;
    }

    abortController = new AbortController();
    const request: StreamRequest = { messages, model };

    try {
      // Build router with failover chain
      const router = await buildRouter(provider, apiKey, (from, to, reason) => {
        console.log(`[Wave] Failover: ${from} → ${to}: ${reason}`);
      });

      await router.stream(
        request,
        (chunk: StreamChunk) => {
          try { port.postMessage({ chunk }); } catch { abortController?.abort(); }
        },
        abortController.signal,
      );
      try { port.postMessage({ done: true }); } catch { /* closed */ }
    } catch (err) {
      try {
        port.postMessage({ error: err instanceof Error ? err.message : 'Stream failed' });
      } catch { /* closed */ }
    }
  });

  port.onDisconnect.addListener(() => {
    abortController?.abort();
    abortController = null;
  });
}

function handleAgentStream(port: chrome.runtime.Port) {
  let abortController: AbortController | null = null;

  port.onMessage.addListener(async (message) => {
    if (message.action !== 'start') return;

    const { provider, model, apiKey, tabId, query, history } = message.args as {
      provider: string;
      model: string;
      apiKey: string;
      tabId: number;
      query: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    const adapter = adapters[provider];
    if (!adapter) {
      port.postMessage({ error: `Unknown provider: ${provider}` });
      return;
    }

    abortController = new AbortController();

    try {
      // Run multi-step agent loop
      const result = await runAgentLoop({
        maxSteps: 5,
        adapter,
        apiKey,
        model,
        tabId,
        query,
        history,
        onChunk: (chunk: StreamChunk) => {
          try { port.postMessage({ chunk }); } catch { abortController?.abort(); }
        },
        onStatus: (status: string, data?: Record<string, unknown>) => {
          const statusText = 
            status === 'extracting_page' ? '🔍 Reading page structure...' : 
            status === 'thinking' ? '🧠 Analyzing page...' : 
            status === 'executing_action' ? `⚡ Executing: ${data?.action ?? 'action'}...` :
            status === 'navigating' ? '⏳ Waiting for page to load...' :
            status === 'taking_screenshot' ? '📸 Taking screenshot for visual analysis...' : '';
          try { port.postMessage({ status, statusText, ...data }); } catch { /* closed */ }
        },
        onAction: (action: string, params: Record<string, unknown>) => {
          return handleAgentAction({ tabId, action, params });
        },
        onActionConfirm: (action: string, params: Record<string, unknown>) => {
          return new Promise((resolve) => {
            const confirmId = Math.random().toString(36).slice(2);
            try {
              port.postMessage({ type: 'confirm_action', action, params, confirmId });
              
              const listener = (msg: any) => {
                if (msg.type === 'confirm_action_response' && msg.confirmId === confirmId) {
                  port.onMessage.removeListener(listener);
                  resolve(!!msg.allowed);
                }
              };
              port.onMessage.addListener(listener);
            } catch {
              resolve(false);
            }
          });
        },
        onError: (err, action) => {
          console.error(`[Wave] Agent action error: ${action}`, err);
        },
        getPageContext: (tid: string | number) => handleGetPageContext({ tabId: Number(tid) }),
        captureScreenshot: (tid: string | number) => cdp.captureScreenshot({ id: String(tid), type: 'tab' }),
        useVisionFallback: true, // Default to true, or load from storage
        signal: abortController.signal,
      });

      console.log(`[Wave] Agent loop complete: ${result.steps} steps, ${result.actions.length} actions`);
      try { port.postMessage({ done: true }); } catch { /* closed */ }
    } catch (err) {
      try {
        port.postMessage({ error: err instanceof Error ? err.message : 'Agent failed' });
      } catch { /* closed */ }
    }
  });

  port.onDisconnect.addListener(() => {
    abortController?.abort();
    abortController = null;
  });
}

console.log('[Wave] Service worker initialized');
