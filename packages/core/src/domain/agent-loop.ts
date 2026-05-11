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
import { ContextBuilder } from './context-builder.js';
import { AGENT_SYSTEM_PROMPT } from './agent-tools.js';
import { parseToolCall, isTerminalAction } from './tool-call-parser.js';

export interface PageContext {
  markdown: string;
  elements: Record<string, unknown>;
  stats: { totalNodes: number; filteredNodes: number; outputTokenEstimate: number };
  url: string;
  title: string;
}

export interface AgentLoopConfig {
  maxSteps: number;
  adapter: StreamAdapter;
  apiKey: string;
  model: string;
  tabId: number;
  query: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (chunk: StreamChunk) => void;
  onStatus: (status: string, data?: Record<string, unknown>) => void;
  onAction: (action: string, params: Record<string, unknown>) => Promise<unknown>;
  getPageContext: (tabId: number) => Promise<PageContext>;
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
    history, onChunk, onStatus, onAction, getPageContext, signal,
  } = config;

  const actions: AgentStepRecord[] = [];
  const loopHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.slice(-4),
  ];

  let finalResponse = '';

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) break;

    // ── OBSERVE ──
    onStatus('extracting_page', { step });
    const pageCtx = await getPageContext(tabId);

    // ── BUILD CONTEXT ──
    const contextBuilder = new ContextBuilder(8192)
      .system(AGENT_SYSTEM_PROMPT)
      .pageContext(pageCtx.markdown, pageCtx.url, pageCtx.title);

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

    // ── ACT ──
    onStatus('executing_action', {
      step,
      action: toolCall.action,
      params: toolCall.params,
    });

    // Resolve backendNodeId from element map if ref provided
    const params = { ...toolCall.params };
    if (params.ref && pageCtx.elements) {
      const el = pageCtx.elements[params.ref as string] as { backendNodeId?: number } | undefined;
      if (el?.backendNodeId) {
        params.backendNodeId = el.backendNodeId;
      }
    }

    const result = await onAction(toolCall.action, params);
    actions.push({ action: toolCall.action, params: toolCall.params, result });

    // Brief pause for page to settle after action
    await sleep(500);

    // Add this step's response to loop history for next iteration
    loopHistory.push({ role: 'assistant', content: fullText });
    loopHistory.push({
      role: 'user',
      content: `Action "${toolCall.action}" executed. Here is the updated page state.`,
    });

    // Separator in UI between steps
    onChunk({ type: 'text_delta', content: '\n\n---\n\n' });
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
