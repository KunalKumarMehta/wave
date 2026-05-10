/**
 * Token cost tracking — per-provider pricing and session budget.
 * 
 * Prices as of 2025-05 (USD per 1M tokens).
 * @see Knowledge Base: Wave 5.2
 */

export interface TokenUsage {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens?: number;
  timestamp: number;
}

export interface CostSummary {
  totalCost: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  byProvider: Record<string, { cost: number; calls: number; tokens: number }>;
  entries: TokenUsage[];
}

// Pricing per 1M tokens (input / output)
const PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o':          { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':     { input: 0.15,  output: 0.60 },
  'gpt-4.1':         { input: 2.00,  output: 8.00 },
  'gpt-4.1-mini':    { input: 0.40,  output: 1.60 },
  'gpt-4.1-nano':    { input: 0.10,  output: 0.40 },
  'o4-mini':         { input: 1.10,  output: 4.40 },
  // Anthropic
  'claude-sonnet-4-20250514':    { input: 3.00,  output: 15.00 },
  'claude-haiku-4-20250514':     { input: 0.80,  output: 4.00 },
  'claude-3-5-haiku-20241022':   { input: 0.80,  output: 4.00 },
  // Gemini
  'gemini-2.5-flash': { input: 0.15,  output: 0.60 },
  'gemini-2.5-pro':   { input: 1.25,  output: 10.00 },
  'gemini-2.0-flash':  { input: 0.10,  output: 0.40 },
};

export class CostTracker {
  private entries: TokenUsage[] = [];
  private budgetUsd: number | null = null;

  setBudget(usd: number): void {
    this.budgetUsd = usd;
  }

  record(usage: TokenUsage): number {
    this.entries.push(usage);
    return this.calculateCost(usage);
  }

  calculateCost(usage: TokenUsage): number {
    const prices = PRICING[usage.model];
    if (!prices) return 0;

    const inputCost = (usage.promptTokens / 1_000_000) * prices.input;
    const outputCost = (usage.completionTokens / 1_000_000) * prices.output;
    return inputCost + outputCost;
  }

  getSummary(): CostSummary {
    const byProvider: Record<string, { cost: number; calls: number; tokens: number }> = {};
    let totalCost = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    for (const entry of this.entries) {
      const cost = this.calculateCost(entry);
      totalCost += cost;
      totalPromptTokens += entry.promptTokens;
      totalCompletionTokens += entry.completionTokens;

      if (!byProvider[entry.provider]) {
        byProvider[entry.provider] = { cost: 0, calls: 0, tokens: 0 };
      }
      byProvider[entry.provider].cost += cost;
      byProvider[entry.provider].calls += 1;
      byProvider[entry.provider].tokens += entry.promptTokens + entry.completionTokens;
    }

    return { totalCost, totalPromptTokens, totalCompletionTokens, byProvider, entries: this.entries };
  }

  isOverBudget(): boolean {
    if (this.budgetUsd === null) return false;
    return this.getSummary().totalCost >= this.budgetUsd;
  }

  getRemainingBudget(): number | null {
    if (this.budgetUsd === null) return null;
    return Math.max(0, this.budgetUsd - this.getSummary().totalCost);
  }

  formatCost(cost: number): string {
    if (cost < 0.01) return `$${(cost * 100).toFixed(3)}¢`;
    return `$${cost.toFixed(4)}`;
  }

  reset(): void {
    this.entries = [];
  }
}

// Singleton for the session
export const costTracker = new CostTracker();
