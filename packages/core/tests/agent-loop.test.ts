import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentLoop } from '../src/domain/agent-loop';
import type { PageContext } from '../src/domain/agent-loop';
import type { StreamAdapter } from '../src/domain/stream-provider';

describe('Agent Loop', () => {
  const mockAdapter: StreamAdapter = {
    stream: vi.fn(),
  };

  const mockPageContext: PageContext = {
    markdown: 'test page',
    elements: { 'e1': { backendNodeId: 100, name: 'Button' } },
    stats: { totalNodes: 1, filteredNodes: 1, outputTokenEstimate: 10 },
    url: 'https://example.com',
    title: 'Test',
  };

  const createConfig = () => ({
    maxSteps: 3,
    adapter: mockAdapter,
    apiKey: 'test-key',
    model: 'test-model',
    tabId: 1,
    query: 'click button',
    history: [],
    onChunk: vi.fn(),
    onStatus: vi.fn(),
    onAction: vi.fn().mockImplementation((action: string) => {
      if (action === 'list_tabs') return Promise.resolve([]);
      return Promise.resolve({ success: true });
    }),
    getPageContext: vi.fn().mockResolvedValue(mockPageContext),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops when done() is called', async () => {
    const config = createConfig();
    mockAdapter.stream = vi.fn().mockImplementation(async (req, key, onChunk) => {
      onChunk({ type: 'text_delta', content: 'ACTION: done(summary="Finished task")' });
    });

    const result = await runAgentLoop(config);
    expect(result.steps).toBe(0); // breaks before push to actions
    expect(mockAdapter.stream).toHaveBeenCalledTimes(1);
  });

  it('executes actions and continues loop', async () => {
    const config = createConfig();
    // Step 1: click, Step 2: done
    mockAdapter.stream = vi.fn()
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: click(ref="e1")' });
      })
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: done()' });
      });

    config.onAction.mockResolvedValue({ success: true });

    const result = await runAgentLoop(config);
    expect(result.steps).toBe(1);
    expect(config.onAction).toHaveBeenCalledWith('click', expect.objectContaining({ ref: 'e1', backendNodeId: 100 }));
  });

  it('respects maxSteps', async () => {
    const config = createConfig();
    config.maxSteps = 2;
    mockAdapter.stream = vi.fn().mockImplementation(async (req, key, onChunk) => {
      onChunk({ type: 'text_delta', content: 'ACTION: click(ref="e1")' });
    });

    const result = await runAgentLoop(config);
    expect(result.steps).toBe(2);
    expect(config.onChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Reached maximum') }));
  });

  it('recovers from action errors', async () => {
    const config = createConfig();
    mockAdapter.stream = vi.fn()
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: click(ref="e1")' });
      })
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: done()' });
      });

    config.onAction.mockImplementation((action: string) => {
      if (action === 'list_tabs') return Promise.resolve([]);
      return Promise.reject(new Error('Click failed'));
    });

    const result = await runAgentLoop(config);
    expect(result.steps).toBe(1);
    expect(result.actions[0].result).toEqual({ error: 'Click failed' });
    expect(config.onChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Action failed') }));
  });

  it('handles action confirmation - allowed', async () => {
    const config = createConfig();
    mockAdapter.stream = vi.fn()
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: click(ref="e1")' });
      })
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: done()' });
      });

    const onActionConfirm = vi.fn().mockResolvedValue(true);

    const result = await runAgentLoop({ ...config, onActionConfirm });
    expect(result.steps).toBe(1);
    expect(onActionConfirm).toHaveBeenCalled();
    expect(config.onAction).toHaveBeenCalled();
  });

  it('handles action confirmation - denied', async () => {
    const config = createConfig();
    mockAdapter.stream = vi.fn().mockImplementation(async (req, key, onChunk) => {
      onChunk({ type: 'text_delta', content: 'ACTION: click(ref="e1")' });
    });

    const onActionConfirm = vi.fn().mockResolvedValue(false);

    const result = await runAgentLoop({ ...config, onActionConfirm });
    expect(result.steps).toBe(0);
    expect(onActionConfirm).toHaveBeenCalled();
    expect(config.onAction).not.toHaveBeenCalledWith('click', expect.anything());
    expect(config.onChunk).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Action denied') }));
  });

  it('waits for navigation', async () => {
    const config = createConfig();
    mockAdapter.stream = vi.fn()
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: navigate(url="https://google.com")' });
      })
      .mockImplementationOnce(async (req, key, onChunk) => {
        onChunk({ type: 'text_delta', content: 'ACTION: done()' });
      });

    const result = await runAgentLoop(config);
    expect(config.onStatus).toHaveBeenCalledWith('navigating', expect.any(Object));
    expect(result.steps).toBe(1);
  });

  it('supports onError callback', async () => {
    const config = createConfig();
    mockAdapter.stream = vi.fn().mockImplementation(async (req, key, onChunk) => {
      onChunk({ type: 'text_delta', content: 'ACTION: click(ref="e1")' });
    });

    const onError = vi.fn();
    config.onAction.mockImplementation((action: string) => {
      if (action === 'list_tabs') return Promise.resolve([]);
      return Promise.reject(new Error('Fatal error'));
    });

    // Force break after 1 step to avoid infinite loop in test
    config.maxSteps = 1;

    await runAgentLoop({ ...config, onError });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'click');
  });
});
