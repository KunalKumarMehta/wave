/**
 * Agent Loop — multi-step observe-think-act execution engine.
 *
 * State machine: OBSERVE → THINK → ACT → OBSERVE → ... → DONE
 *
 * Each iteration:
 * 1. Extract page context (AX tree)
 * 2. Build LLM prompt with context + action history
 * 3. Stream LLM response, accumulate full text
 * 4. Parse tool call from response
 * 5. Execute action via CDP (or terminate if done/no-action)
 * 6. Loop with updated state
 *
 * @see AGENTS.md — Agent Action System
 */

import type { StreamAdapter, StreamRequest } from './stream-provider.js';
import type { StreamChunk } from '../types/stream.js';
import type { ContentPart } from '../types/message.js';
import { ContextBuilder } from './context-builder.js';
import { AGENT_SYSTEM_PROMPT } from './agent-tools.js';
import { parseToolCall, isTerminalAction } from './tool-call-parser.js';
import type { PageContext } from '../abstractions/cdp.js';



export interface AgentLoopConfig {
  maxSteps: number;
  adapter: StreamAdapter;
  apiKey: string;
  model: string;
  tabId: string | number;
  query: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (chunk: StreamChunk) => void;
  onStatus: (status: string, data?: Record<string, unknown>) => void;
  onAction: (action: string, params: Record<string, unknown>) => Promise<unknown>;
  onActionConfirm?: (action: string, params: Record<string, unknown>) => Promise<boolean>;
  onError?: (error: Error, action: string) => void;
  getPageContext: (tabId: string | number) => Promise<PageContext>;
  captureScreenshot?: (tabId: string | number) => Promise<string>;
  useVisionFallback?: boolean;
  signal?: AbortSignal;
}

export interface AgentStepRecord {
  action: string;
  params: Record<string, unknown>;
  result: unknown;
}

export interface AgentLoopResult {
  steps: number;
  actions: AgentStepRecord[];
  finalResponse: string;
}

/**
 * Run the agent loop. Streams text to onChunk for UI display.
 * Returns when done() is called or maxSteps reached.
 */
export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const {
    maxSteps, adapter, apiKey, model, tabId, query,
    history, onChunk, onStatus, onAction, onActionConfirm, onError, getPageContext, 
    useVisionFallback, captureScreenshot, signal,
  } = config;

  const actions: AgentStepRecord[] = [];
  const loopHistory: Array<{ role: 'user' | 'assistant'; content: string | ContentPart[] }> = [
    ...history.slice(-4),
  ];

  let finalResponse = '';
  let currentTabId = tabId;

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) break;

    // ── OBSERVE ──
    onStatus('extracting_page', { step, tabId: currentTabId });
    const pageCtx = await getPageContext(currentTabId);
    const allTabs = await onAction('list_tabs', {});

    // ── BUILD CONTEXT ──
    const contextBuilder = new ContextBuilder(8192)
      .system(AGENT_SYSTEM_PROMPT)
      .pageContext(pageCtx.markdown, pageCtx.url, pageCtx.title);

    // Add tab list to context if multiple tabs exist
    if (Array.isArray(allTabs) && allTabs.length > 1) {
      const tabList = allTabs.map(t => `- [ID: ${t.id}] ${t.title} (${t.url})`).join('\n');
      contextBuilder.system(`Currently open tabs:\n${tabList}\nActive Tab ID: ${currentTabId}`);
    }

    // ── VISION FALLBACK ──
    if (useVisionFallback !== false && captureScreenshot && pageCtx.stats.totalNodes < 5) {
      onStatus('taking_screenshot', { reason: 'sparse_ax_tree', count: pageCtx.stats.totalNodes });
      try {
        const screenshot = await captureScreenshot(currentTabId);
        if (screenshot) {
          contextBuilder.screenshot(screenshot);
        }
      } catch (err) {
        console.warn('[Wave] Screenshot fallback failed:', err);
      }
    }

    // Add action history as assistant/user pairs
    if (actions.length > 0) {
      const actionSummary = actions.map((a) =>
        `Executed: ${a.action}(${JSON.stringify(a.params)}) → ${JSON.stringify(a.result)}`
      ).join('\n');
      contextBuilder.history([
        ...loopHistory,
        { role: 'assistant', content: `Previous actions:\n${actionSummary}` },
      ]);
    } else {
      contextBuilder.history(loopHistory);
    }

    const ctx = contextBuilder.query(query).build();

    onStatus('thinking', {
      step,
      tabId: currentTabId,
      pageStats: pageCtx.stats,
      tokenEstimate: ctx.tokenEstimate,
      droppedContext: ctx.dropped,
    });

    // ── THINK (stream LLM) ──
    const request: StreamRequest = { messages: ctx.messages, model };
    let fullText = '';

    await adapter.stream(
      request,
      apiKey,
      (chunk: StreamChunk) => {
        if (chunk.type === 'text_delta') {
          fullText += chunk.content;
        }
        // Forward all chunks to UI
        onChunk(chunk);
      },
      signal,
    );

    finalResponse = fullText;

    // ── PARSE ACTION ──
    const toolCall = parseToolCall(fullText);

    if (!toolCall) {
      // No action found — treat as final text-only response
      break;
    }

    if (isTerminalAction(toolCall)) {
      // done() — loop complete
      break;
    }

    // Resolve backendNodeId from element map if ref provided
    const params = { ...toolCall.params };
    if (params.ref && pageCtx.elements) {
      const el = pageCtx.elements[params.ref as string] as { backendNodeId?: number; name?: string } | undefined;
      if (el?.backendNodeId) {
        params.backendNodeId = el.backendNodeId;
      }
      if (el?.name) {
        params.name = el.name;
      }
    }

    // ── CONFIRM ──
    if (onActionConfirm) {
      const allowed = await onActionConfirm(toolCall.action, params);
      if (!allowed) {
        onChunk({ type: 'text_delta', content: `\n\n> ❌ Action denied by user: ${toolCall.action}. Stopping loop.` });
        break;
      }
    }

    // ── ACT ──
    onStatus('executing_action', {
      step,
      action: toolCall.action,
      params,
    });

    let result: unknown;
    try {
      if (toolCall.action === 'navigate' || toolCall.action === 'open_tab') {
        onStatus(toolCall.action === 'navigate' ? 'navigating' : 'opening_tab', { url: params.url });
      }

      result = await onAction(toolCall.action, params);

      // Handle tab switching logic
      if (toolCall.action === 'switch_tab' && params.id) {
        currentTabId = params.id as string;
        onChunk({ type: 'text_delta', content: `\n\n> 🔄 Switched to tab: ${currentTabId}` });
      } else if (toolCall.action === 'open_tab' && (result as any)?.id) {
        currentTabId = (result as any).id;
        onChunk({ type: 'text_delta', content: `\n\n> 🆕 Opened new tab and switched to it: ${currentTabId}` });
        await sleep(2000); // Wait for new tab load
      }

      if (toolCall.action === 'navigate') {
        await sleep(2000); // Wait for page to load
      } else {
        await sleep(500);
      }
    } catch (error) {
      const err = error as Error;
      onError?.(err, toolCall.action);
      result = { error: err.message };
      onChunk({ type: 'text_delta', content: `\n\n> ⚠️ Action failed: ${err.message}. Agent will decide next step.` });
    }

    actions.push({ action: toolCall.action, params: toolCall.params, result });

    // Add this step's response to loop history for next iteration
    loopHistory.push({ role: 'assistant', content: fullText });
    loopHistory.push({
      role: 'user',
      content: `Action "${toolCall.action}" executed. Result: ${JSON.stringify(result)}. Here is the updated page state.`,
    });

    // Separator in UI between steps - replaced with marker for component visualization
    onChunk({ 
      type: 'text_delta', 
      content: `\n\n<!-- AGENT_STEP: ${JSON.stringify({ 
        step: step + 1, 
        action: toolCall.action, 
        target: params.name || params.text || params.url || params.id || params.ref || 'target'
      })} -->\n\n` 
    });
  }

  // If we hit maxSteps without done(), warn
  if (actions.length >= maxSteps) {
    onChunk({
      type: 'text_delta',
      content: `\n\n> ⚠️ Reached maximum of ${maxSteps} steps. Stopping.`,
    });
  }

  return { steps: actions.length, actions, finalResponse };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
