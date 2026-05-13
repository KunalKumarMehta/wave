/**
 * Tool Call Parser — extracts structured agent actions from LLM text output.
 *
 * Supports two formats:
 * 1. JSON block in markdown: ```json\n{"action":"click","ref":"e5"}\n```
 * 2. Inline fallback: ACTION: click(ref="e5")
 *
 * Returns the LAST action found (LLM may narrate before acting).
 * Only one action per response is valid per agent loop contract.
 */

const VALID_ACTIONS = new Set(['click', 'type', 'scroll', 'navigate', 'open_tab', 'switch_tab', 'close_tab', 'list_tabs', 'done']);

export interface ParsedToolCall {
  action: string;
  params: Record<string, unknown>;
}

/**
 * Parse tool call from LLM response text.
 * Returns null if no valid action found.
 */
export function parseToolCall(text: string): ParsedToolCall | null {
  // Strategy 1: JSON block in markdown (preferred)
  const jsonResult = parseJsonBlock(text);
  if (jsonResult) return jsonResult;

  // Strategy 2: Inline ACTION: format (fallback)
  const inlineResult = parseInlineAction(text);
  if (inlineResult) return inlineResult;

  return null;
}

/**
 * Extract JSON action from fenced code blocks.
 * Matches: ```json\n{...}\n``` or ```\n{...}\n```
 * Takes the LAST match (LLM may show examples before real action).
 */
function parseJsonBlock(text: string): ParsedToolCall | null {
  const pattern = /```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/g;
  let lastMatch: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    lastMatch = match[1];
  }

  if (!lastMatch) return null;

  try {
    const parsed = JSON.parse(lastMatch);
    if (!parsed.action || !VALID_ACTIONS.has(parsed.action)) return null;

    const { action, ...params } = parsed;
    return { action, params };
  } catch {
    return null;
  }
}

/**
 * Fallback: parse ACTION: name(key="value", ...) format.
 */
function parseInlineAction(text: string): ParsedToolCall | null {
  const pattern = /ACTION:\s*(\w+)\(([^)]*)\)/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) return null;

  const action = lastMatch[1];
  if (!VALID_ACTIONS.has(action)) return null;

  const paramsStr = lastMatch[2];
  const params: Record<string, unknown> = {};

  // Parse key="value" or key=value pairs
  const paramPattern = /(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*([^\s,]+)/g;
  let paramMatch: RegExpExecArray | null;

  while ((paramMatch = paramPattern.exec(paramsStr)) !== null) {
    const key = paramMatch[1] ?? paramMatch[3];
    const value = paramMatch[2] ?? paramMatch[4];
    params[key] = value;
  }

  return { action, params };
}

/**
 * Check if text contains a complete action block.
 * Used during streaming to know when to stop accumulating.
 */
export function hasCompleteAction(text: string): boolean {
  return parseToolCall(text) !== null;
}

/**
 * Check if the parsed action is a terminal action (done).
 */
export function isTerminalAction(call: ParsedToolCall): boolean {
  return call.action === 'done';
}
