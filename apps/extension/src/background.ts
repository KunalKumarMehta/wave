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
import { ContextBuilder } from '@wave/core/src/domain/context-builder.js';
import { AGENT_SYSTEM_PROMPT } from '@wave/core/src/domain/agent-tools.js';
import { ExtBrowserController } from '@wave/ext-bindings/src/cdp.js';
import type { StreamAdapter, StreamRequest } from '@wave/core/src/domain/stream-provider.js';
import type { StreamChunk } from '@wave/core/src/types/stream.js';

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
            const [x1, y1, x2, _y2, x3, y3] = box.model.content;
            const cx = (x1 + x2) / 2 + ((x3 - x1) / 2);  // Simplified
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
        await cdp.detach(target);
        return { success: true, action: 'navigate', url };
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

    const adapter = adapters[provider];
    if (!adapter) {
      port.postMessage({ error: `Unknown provider: ${provider}` });
      return;
    }

    abortController = new AbortController();
    const request: StreamRequest = { messages, model };

    try {
      await adapter.stream(
        request,
        apiKey,
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
      // 1. Get page context
      port.postMessage({ status: 'extracting_page' });
      const pageCtx = await handleGetPageContext({ tabId });

      // 2. Build context with token budget
      const ctx = new ContextBuilder(8192)
        .system(AGENT_SYSTEM_PROMPT)
        .pageContext(pageCtx.markdown, pageCtx.url, pageCtx.title)
        .history(history.slice(-4)) // Last 2 turns only for agent
        .query(query)
        .build();

      port.postMessage({
        status: 'thinking',
        pageStats: pageCtx.stats,
        tokenEstimate: ctx.tokenEstimate,
        droppedContext: ctx.dropped,
      });

      // 3. Stream LLM response
      const request: StreamRequest = { messages: ctx.messages, model };

      await adapter.stream(
        request,
        apiKey,
        (chunk: StreamChunk) => {
          try { port.postMessage({ chunk }); } catch { abortController?.abort(); }
        },
        abortController.signal,
      );

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
