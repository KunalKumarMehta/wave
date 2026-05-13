/**
 * Context Builder — priority-based token budget allocation.
 * 
 * Assembles the final prompt from multiple context sources,
 * enforcing a hard token limit with priority ordering:
 *   1. System prompt (always included)
 *   2. User query (always included)
 *   3. Page context (AX tree, truncated to fit)
 *   4. Conversation history (sliding window, oldest dropped first)
 * 
 * @see Knowledge Base: Wave 5.3 — Agent Context Management & Token Budgeting
 */

interface ContextSlot {
  role: 'system' | 'user' | 'assistant';
  content: string;
  priority: number; // lower = higher priority = included first
  label: string;    // for debugging
}

export interface BuiltContext {
  messages: Array<{ 
    role: 'system' | 'user' | 'assistant'; 
    content: string | Array<{ type: string; [key: string]: any }>;
  }>;
  tokenEstimate: number;
  dropped: string[]; // labels of dropped slots
}

/**
 * Estimate tokens from text.
 * Uses heuristic ratios from KB research:
 * - DOM/structured content: 3.2 chars/token
 * - Natural prose: 4.0 chars/token
 */
function estimateTokens(text: string, isDom: boolean = false): number {
  const ratio = isDom ? 3.2 : 4.0;
  return Math.ceil(text.length / ratio);
}

export class ContextBuilder {
  private slots: ContextSlot[] = [];
  private maxTokens: number;
  private _screenshot: string | null = null;

  constructor(maxTokens: number = 4096) {
    this.maxTokens = maxTokens;
  }

  /** Capture screenshot — base64 string. */
  screenshot(base64Image: string): this {
    this._screenshot = base64Image;
    return this;
  }

  /** System prompt — always included (priority 0). */
  system(content: string): this {
    this.slots.push({ role: 'system', content, priority: 0, label: 'system' });
    return this;
  }

  /** Current user query — always included (priority 1). */
  query(content: string): this {
    this.slots.push({ role: 'user', content, priority: 1, label: 'query' });
    return this;
  }

  /** Page AX tree context — high priority (2). */
  pageContext(axMarkdown: string, pageUrl?: string, pageTitle?: string): this {
    let wrapped = '';
    if (pageUrl) wrapped += `Page URL: ${pageUrl}\n`;
    if (pageTitle) wrapped += `Page Title: ${pageTitle}\n`;
    wrapped += `\nPage structure (accessibility tree):\n\`\`\`\n${axMarkdown}\n\`\`\``;
    this.slots.push({ role: 'system', content: wrapped, priority: 2, label: 'page-context' });
    return this;
  }

  /** Conversation history messages — lower priority (10+). Oldest = lowest priority. */
  history(messages: Array<{ role: 'user' | 'assistant'; content: string }>): this {
    // Add in reverse order so newest has lower priority number
    const reversed = [...messages].reverse();
    reversed.forEach((msg, i) => {
      this.slots.push({
        role: msg.role,
        content: msg.content,
        priority: 10 + i, // newest = 10, oldest = 10+n
        label: `history-${messages.length - 1 - i}`,
      });
    });
    return this;
  }

  /** Build final message array within token budget. */
  build(): BuiltContext {
    // Sort by priority (lower number = higher priority)
    const sorted = [...this.slots].sort((a, b) => a.priority - b.priority);

    const included: ContextSlot[] = [];
    const dropped: string[] = [];
    
    // Reserve tokens for screenshot if present (approx 1000 tokens)
    const screenshotTokens = this._screenshot ? 1000 : 0;
    let totalTokens = screenshotTokens;

    for (const slot of sorted) {
      const isDom = slot.label === 'page-context';
      const slotTokens = estimateTokens(slot.content, isDom);

      if (totalTokens + slotTokens <= this.maxTokens) {
        included.push(slot);
        totalTokens += slotTokens;
      } else if (slot.priority <= 1) {
        // System and query are ALWAYS included, even if over budget
        included.push(slot);
        totalTokens += slotTokens;
      } else {
        dropped.push(slot.label);
      }
    }

    // Re-sort included by conversation order:
    // system first, then history (chronological), then query last
    const messages: any[] = [
      // System prompts
      ...included.filter((s) => s.role === 'system').map((s) => ({
        role: s.role,
        content: s.content,
      })),
      // History in chronological order
      ...included
        .filter((s) => s.label.startsWith('history-'))
        .sort((a, b) => {
          const aIdx = parseInt(a.label.split('-')[1]);
          const bIdx = parseInt(b.label.split('-')[1]);
          return aIdx - bIdx;
        })
        .map((s) => ({ role: s.role, content: s.content })),
    ];

    // Query last, with screenshot if available
    const querySlot = included.find((s) => s.label === 'query');
    if (querySlot) {
      if (this._screenshot) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: querySlot.content },
            { type: 'image', data: this._screenshot, mimeType: 'image/png' }
          ]
        });
      } else {
        messages.push({ role: 'user', content: querySlot.content });
      }
    }

    return { messages, tokenEstimate: totalTokens, dropped };
  }
}
