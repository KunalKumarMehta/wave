import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAgentLoop } from '@wave/core/src/domain/agent-loop.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Agent Loop E2E (Mocked Controller)', () => {
  let dom: JSDOM;

  beforeEach(() => {
    vi.useFakeTimers();
    const html = fs.readFileSync(path.resolve(__dirname, '../test-fixtures/test-page.html'), 'utf8');
    dom = new JSDOM(html, { url: 'http://localhost:3000', runScripts: 'dangerously' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should complete a multi-step task', async () => {
    const mockAdapter = {
      stream: vi.fn().mockImplementation(async (req, opts, onChunk) => {
        const hasType = req.messages.some((m: any) => {
          const text = typeof m.content === 'string' ? m.content : m.content.map((p: any) => p.text || '').join(' ');
          return m.role === 'assistant' && text.includes('type');
        });
        const hasClick = req.messages.some((m: any) => {
          const text = typeof m.content === 'string' ? m.content : m.content.map((p: any) => p.text || '').join(' ');
          return m.role === 'assistant' && text.includes('click');
        });
        
        if (!hasType) {
          onChunk({ type: 'text_delta', content: 'Typing...\n```json\n{"action": "type", "ref": "e4", "text": "test@example.com"}\n```' });
        } else if (!hasClick) {
          onChunk({ type: 'text_delta', content: 'Clicking...\n```json\n{"action": "click", "ref": "e6"}\n```' });
        } else {
          onChunk({ type: 'text_delta', content: 'Done!\n```json\n{"action": "done", "summary": "Logged in"}\n```' });
        }
        onChunk({ type: 'done' });
      })
    };

    const mockController = {
      extractPageContext: () => ({
        url: 'http://localhost:3000',
        title: 'Test Page',
        elements: {
          'e4': { ref: 'e4', tag: 'input', role: 'textbox', name: 'Email' },
          'e6': { ref: 'e6', tag: 'button', role: 'button', name: 'Login' }
        },
        markdown: '[ref=e4] textbox "Email"\n[ref=e6] button "Login"',
        stats: { totalNodes: 2, filteredNodes: 0, outputTokenEstimate: 10 }
      }),
      executeAction: async (action: string, params: any) => {
        if (action === 'type' && params.ref === 'e4') {
          const el = dom.window.document.getElementById('email') as HTMLInputElement;
          el.value = params.text;
          return { success: true };
        }
        if (action === 'click' && params.ref === 'e6') {
          const el = dom.window.document.getElementById('login-btn');
          el?.click();
          return { success: true };
        }
        return { success: true };
      }
    };

    const loopPromise = runAgentLoop({
      maxSteps: 3,
      adapter: mockAdapter as any,
      apiKey: 'test-key',
      model: 'test-model',
      tabId: 'browser',
      query: 'Login',
      history: [],
      onChunk: () => {},
      onStatus: () => {},
      onAction: (action, params) => {
        if (action === 'list_tabs') return Promise.resolve([]);
        return mockController.executeAction(action, params);
      },
      getPageContext: () => Promise.resolve(mockController.extractPageContext() as any),
    });

    // Advance timers multiple times because there are multiple steps with sleeps
    for (let i = 0; i < 5; i++) {
      await vi.runAllTimersAsync();
    }
    
    const loopResult = await loopPromise;

    expect(loopResult.steps).toBeGreaterThanOrEqual(2);
    
    const input = dom.window.document.getElementById('email') as HTMLInputElement;
    expect(input.value).toBe('test@example.com');
    
    const status = dom.window.document.getElementById('status');
    expect(status?.textContent).toContain('test@example.com');
  });
});
