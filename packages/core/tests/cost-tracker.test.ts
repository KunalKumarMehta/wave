import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../src/domain/cost-tracker.js';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('starts with zero cost', () => {
    const summary = tracker.getSummary();
    expect(summary.totalCost).toBe(0);
    expect(summary.totalPromptTokens).toBe(0);
    expect(summary.totalCompletionTokens).toBe(0);
  });

  it('calculates cost for known models', () => {
    const cost = tracker.calculateCost({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 1000,
      completionTokens: 500,
      timestamp: Date.now(),
    });

    // gemini-2.5-flash: input $0.15/1M, output $0.60/1M
    // 1000 input: 0.00015
    // 500 output: 0.0003
    const expected = (1000 / 1_000_000) * 0.15 + (500 / 1_000_000) * 0.60;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('returns 0 for unknown models', () => {
    const cost = tracker.calculateCost({
      provider: 'unknown',
      model: 'mystery-model',
      promptTokens: 1000,
      completionTokens: 500,
      timestamp: Date.now(),
    });

    expect(cost).toBe(0);
  });

  it('accumulates usage across calls', () => {
    tracker.record({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 1000,
      completionTokens: 500,
      timestamp: Date.now(),
    });

    tracker.record({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 2000,
      completionTokens: 1000,
      timestamp: Date.now(),
    });

    const summary = tracker.getSummary();
    expect(summary.totalPromptTokens).toBe(3000);
    expect(summary.totalCompletionTokens).toBe(1500);
    expect(summary.entries).toHaveLength(2);
  });

  it('tracks per-provider breakdown', () => {
    tracker.record({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 1000,
      completionTokens: 500,
      timestamp: Date.now(),
    });

    tracker.record({
      provider: 'openai',
      model: 'gpt-4o-mini',
      promptTokens: 500,
      completionTokens: 200,
      timestamp: Date.now(),
    });

    const summary = tracker.getSummary();
    expect(Object.keys(summary.byProvider)).toHaveLength(2);
    expect(summary.byProvider.gemini.calls).toBe(1);
    expect(summary.byProvider.openai.calls).toBe(1);
  });

  it('enforces budget', () => {
    tracker.setBudget(0.001); // Very small budget

    tracker.record({
      provider: 'openai',
      model: 'gpt-4o',
      promptTokens: 1_000_000, // $2.50
      completionTokens: 0,
      timestamp: Date.now(),
    });

    expect(tracker.isOverBudget()).toBe(true);
    expect(tracker.getRemainingBudget()).toBe(0);
  });

  it('resets correctly', () => {
    tracker.record({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptTokens: 1000,
      completionTokens: 500,
      timestamp: Date.now(),
    });

    tracker.reset();
    const summary = tracker.getSummary();
    expect(summary.totalCost).toBe(0);
    expect(summary.entries).toHaveLength(0);
  });

  it('formats cost correctly', () => {
    expect(tracker.formatCost(0.005)).toBe('$0.0050');
    expect(tracker.formatCost(1.23)).toBe('$1.230');
    expect(tracker.formatCost(0.0001)).toBe('<$0.001');
    expect(tracker.formatCost(0)).toBe('$0');
  });
});
