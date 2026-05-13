import { useCallback, useRef, useEffect, useState } from 'react';
import './App.css';
import { PlatformProvider, SidePanel, SettingsView } from '@wave/ui-components';
import { InputBar } from '@wave/ui-components/src/chat/InputBar.js';
import { MessageList } from '@wave/ui-components/src/chat/MessageList.js';
import { ConversationDrawer } from '@wave/ui-components/src/layout/ConversationDrawer.js';
import { ActionConfirmation } from '@wave/ui-components/src/chat/ActionConfirmation.js';
import { NavBar } from '@wave/ui-components/src/layout/NavBar.js';
import { ModelLoader } from '@wave/ui-components/src/layout/ModelLoader.js';
import { localRouter } from '@wave/core/src/domain/local-router.js';
import { NativeIPCProvider, NativeStorageProvider, NativeBrowserController } from '@wave/native-bindings';
import { invoke } from '@tauri-apps/api/core';
import { useConversationManager, generateId, isPageQuery, CHAT_SYSTEM_PROMPT, TITLE_SYSTEM_PROMPT } from '@wave/core';
import type { Message } from '@wave/core';
import { costTracker } from '@wave/core/src/domain/cost-tracker.js';
import { createConversationStorage } from '@wave/core/src/domain/conversation-storage.js';
import { OpenAIAdapter } from '@wave/core/src/domain/adapters/openai.js';
import { AnthropicAdapter } from '@wave/core/src/domain/adapters/anthropic.js';
import { GeminiAdapter } from '@wave/core/src/domain/adapters/gemini.js';
import { ProviderRouter, type ProviderRoute } from '@wave/core/src/domain/provider-router.js';
import { runAgentLoop } from '@wave/core/src/domain/agent-loop.js';
import { serializeAXTree } from '@wave/core/src/domain/ax-serializer.js';

// ── Platform Bindings ───────────────────────────────────────────

const ipc = new NativeIPCProvider();
const storage = new NativeStorageProvider();
const cdp = new NativeBrowserController();

const ui = {
  environment: 'desktop' as const,
  windowControls: {
    minimize: async () => {},
    maximize: async () => {},
    close: async () => {},
  },
  openNewWindow: async () => {},
  copyToClipboard: async (text: string) => { await navigator.clipboard.writeText(text); },
  openExternal: async (url: string) => { window.open(url, '_blank'); },
};

const adapters: Record<string, any> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  gemini: new GeminiAdapter(),
};

const convStorage = createConversationStorage({
  async get<T>(key: string): Promise<T | undefined> {
    const val = await storage.config.get<T>(key);
    return val ?? undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await storage.config.set(key, value);
  },
  async delete(key: string): Promise<void> {
    await storage.config.delete(key);
  },
});

// ── CDP Operations ───────────────────────────────────────────────

async function getPageContext(tabId: string | number) {
  if (tabId === 'browser') {
    return cdp.extractPageContextFromWebview!('browser');
  }
  const target = { id: String(tabId), type: 'tab' as const };
  try {
    await cdp.attach(target);
    await cdp.sendCommand(target, 'Accessibility.enable');
    const result = await cdp.sendCommand<{ nodes: unknown[] }>(target, 'Accessibility.getFullAXTree', { depth: 4 });
    const pageInfo = await cdp.sendCommand<{ root: { documentURL: string } }>(target, 'DOM.getDocument', { depth: 0 });
    const serialized = serializeAXTree(result.nodes as any);
    await cdp.detach(target);
    return {
      markdown: serialized.markdown,
      elements: Object.fromEntries(serialized.elements),
      stats: serialized.stats,
      url: pageInfo.root.documentURL,
      title: 'Browser Page',
    };
  } catch (err) {
    try { await cdp.detach(target); } catch { /* ignore */ }
    throw err;
  }
}

async function handleAgentAction(tabId: string | number, action: string, params: Record<string, unknown>) {
  if (tabId === 'browser') {
    return cdp.executeActionInWebview!(action, params, 'browser');
  }
  const target = { id: String(tabId), type: 'tab' as const };
  try {
    await cdp.attach(target);
    switch (action) {
      case 'click': {
        const backendNodeId = params.backendNodeId as number;
        if (backendNodeId) {
          const box = await cdp.sendCommand<{ model: { content: number[] } }>(target, 'DOM.getBoxModel', { backendNodeId });
          if (box.model?.content) {
            const [x1, y1, _x2, _y2, x3, y3] = box.model.content;
            const centerX = (x1 + x3) / 2;
            const centerY = (y1 + y3) / 2;
            await cdp.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: centerX, y: centerY, button: 'left', clickCount: 1 });
            await cdp.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: centerX, y: centerY, button: 'left', clickCount: 1 });
          }
        }
        await cdp.detach(target);
        return { success: true, action: 'click', ref: params.ref };
      }
      case 'type': {
        const backendNodeId = params.backendNodeId as number;
        if (backendNodeId) {
          await cdp.sendCommand(target, 'DOM.focus', { backendNodeId });
          await cdp.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', modifiers: 2 });
          await cdp.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', modifiers: 2 });
          await cdp.sendCommand(target, 'Input.insertText', { text: params.text });
        }
        await cdp.detach(target);
        return { success: true, action: 'type', ref: params.ref, text: params.text as string };
      }
      case 'navigate': {
        const url = params.url as string;
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
      case 'scroll': {
        const deltaY = params.direction === 'down' ? 400 : -400;
        await cdp.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: 200, y: 300, deltaX: 0, deltaY });
        await cdp.detach(target);
        return { success: true, action: 'scroll' };
      }
      default:
        await cdp.detach(target);
        return { error: `Unknown action: ${action}` };
    }
  } catch (err) {
    try { await cdp.detach(target); } catch { /* ignore */ }
    throw err;
  }
}

// ── App Component ───────────────────────────────────────────────

function App() {
  const mgr = useConversationManager({
    convStorage,
    configStorage: storage.config,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; params: any; resolve: (val: boolean) => void } | null>(null);
  const [localModelLoading, setLocalModelLoading] = useState(false);
  const [localModelProgress, setLocalModelProgress] = useState(0);
  const [useLocalModel, setUseLocalModel] = useState(false);

  useEffect(() => {
    storage.config.get<boolean>('skipLocalModel').then((skip) => {
      if (!skip && 'gpu' in navigator) {
        setLocalModelLoading(true);
        localRouter.init((p) => setLocalModelProgress(p))
          .then(() => {
            setLocalModelLoading(false);
            setUseLocalModel(true);
          })
          .catch((err) => {
            console.warn('[Wave] Local model init failed:', err);
            setLocalModelLoading(false);
          });
      }
    });
  }, []);

  const browserPaneRef = useRef<HTMLDivElement>(null);

  // Sync native browser webview bounds with DOM container
  useEffect(() => {
    if (!browserPaneRef.current) return;

    const updateBounds = () => {
      if (!browserPaneRef.current) return;
      const rect = browserPaneRef.current.getBoundingClientRect();
      const navHeight = 48; // NavBar height
      invoke('set_browser_bounds', {
        x: Math.round(rect.x),
        y: Math.round(rect.y + navHeight),
        width: Math.round(rect.width),
        height: Math.round(rect.height - navHeight),
      });
    };

    const observer = new ResizeObserver(updateBounds);
    observer.observe(browserPaneRef.current);
    
    // Initial update
    updateBounds();

    return () => observer.disconnect();
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isResizingRef = useRef(false);

  const startResizing = useCallback(() => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  }, []);

  const stopResizing = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth > 320 && newWidth < window.innerWidth * 0.6) {
      setSidebarWidth(newWidth);
    }
  }, []);

  const handleSend = useCallback(async (content: string) => {
    const apiKey = await storage.secure.getSecret(`apikey_${mgr.activeProvider}`);
    if (!apiKey) {
      mgr.setSettingsOpen(true);
      return;
    }

    let convId = mgr.activeConvId;
    if (!convId) {
      convId = await convStorage.create(mgr.activeProvider, mgr.activeModel);
    }

    const userMsg: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() };
    const assistantMsg: Message = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true };

    mgr.setMessages((prev) => [...prev, userMsg, assistantMsg]);
    mgr.setIsStreaming(true);

    // Persist user message
    const isFirstMessage = (await convStorage.get(convId))?.messages.length === 0;
    await convStorage.addMessage(convId, userMsg);
    await mgr.refreshConvList();

    // Auto-title via local SLM on first message
    if (isFirstMessage) {
      if (useLocalModel) {
        localRouter.generateTitle(content).then((title) => {
          if (title) {
            convStorage.updateMeta(convId!, { title });
            mgr.refreshConvList();
          }
        });
      } else {
        const adapter = adapters[mgr.activeProvider];
        if (adapter) {
          try {
            let generatedTitle = '';
            await adapter.stream({
              model: mgr.activeModel,
              messages: [
                { role: 'system', content: TITLE_SYSTEM_PROMPT },
                { role: 'user', content }
              ]
            }, { apiKey }, (chunk: any) => {
              if (chunk.type === 'text_delta') generatedTitle += chunk.content;
            }, new AbortController().signal);

            const finalTitle = generatedTitle.replace(/["']/g, '').trim().slice(0, 60);
            if (finalTitle) {
              await convStorage.updateMeta(convId!, { title: finalTitle });
              await mgr.refreshConvList();
            }
          } catch (e) {
            console.error("Failed to generate title", e);
          }
        }
      }
    }

    abortControllerRef.current = new AbortController();

    const classification = await localRouter.classify(content);
    const isPageAware = classification.intent === 'page_query' || classification.intent === 'page_action';

    try {
      if (isPageAware) {
        const targets = await cdp.getTargets();
        const tab = targets.find((t) => t.id === 'browser') || targets.find((t) => t.type === 'tab');

        if (!tab) {
          mgr.setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: 'Error: No active debuggable tab found. Ensure Chrome is running with --remote-debugging-port=9222', isStreaming: false } : m));
          mgr.setIsStreaming(false);
          return;
        }

        await runAgentLoop({
          maxSteps: 5,
          adapter: adapters[mgr.activeProvider],
          apiKey,
          model: mgr.activeModel,
          tabId: tab.id,
          query: content,
          history: mgr.messages.slice(-6).map((m) => ({ role: m.role as any, content: m.content })),
          onChunk: (chunk: any) => {
            if (chunk.type === 'text_delta') {
              mgr.setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content.startsWith('🔍') || m.content.startsWith('🧠') ? chunk.content : m.content + chunk.content } : m));
            } else if (chunk.type === 'done' && chunk.metadata?.usage) {
              costTracker.record({ provider: mgr.activeProvider, model: mgr.activeModel, promptTokens: chunk.metadata.usage.promptTokens ?? 0, completionTokens: chunk.metadata.usage.completionTokens ?? 0, timestamp: Date.now() });
              mgr.refreshCost();
            }
          },
          onStatus: (status: string, data?: any) => {
            const statusText = 
              status === 'extracting_page' ? '🔍 Reading page structure...' : 
              status === 'thinking' ? '🧠 Analyzing page...' : 
              status === 'executing_action' ? `⚡ Executing: ${data?.action ?? 'action'}...` :
              status === 'navigating' ? '⏳ Waiting for page to load...' : '';
            if (statusText) mgr.setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: statusText } : m));
          },
          onAction: (action: string, params: any) => handleAgentAction(tab.id, action, params),
          onActionConfirm: (action: string, params: any) => {
            return new Promise((resolve) => {
              setConfirmAction({ action, params, resolve });
            });
          },
          onError: (err, action) => {
            console.error(`[Wave] Agent action error: ${action}`, err);
          },
          getPageContext: (tid: string | number) => getPageContext(tid),
          signal: abortControllerRef.current.signal,
        });
      } else {
        const routes: ProviderRoute[] = [{ provider: mgr.activeProvider, adapter: adapters[mgr.activeProvider], apiKey }];
        const router = new ProviderRouter({ routes, maxRetries: 1 });

        await router.stream({
          model: mgr.activeModel,
          messages: [
            { role: 'system', content: CHAT_SYSTEM_PROMPT },
            ...mgr.messages.slice(-10).map((m) => ({ role: m.role as any, content: m.content })),
            { role: 'user', content }
          ]
        }, (chunk: any) => {
          if (chunk.type === 'text_delta') {
            mgr.setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + chunk.content } : m));
          } else if (chunk.type === 'error') {
            mgr.setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${chunk.content}`, isStreaming: false } : m));
          } else if (chunk.type === 'done' && chunk.metadata?.usage) {
            costTracker.record({ provider: mgr.activeProvider, model: mgr.activeModel, promptTokens: chunk.metadata.usage.promptTokens ?? 0, completionTokens: chunk.metadata.usage.completionTokens ?? 0, timestamp: Date.now() });
            mgr.refreshCost();
          }
        }, abortControllerRef.current.signal);
      }

      // Finalize message
      mgr.setMessages((prev) => {
        const updated = prev.map((m) => m.id === assistantMsg.id ? { ...m, isStreaming: false } : m);
        const finalMsg = updated.find(m => m.id === assistantMsg.id);
        if (finalMsg && convId) convStorage.addMessage(convId, finalMsg);
        return updated;
      });
      mgr.setIsStreaming(false);

    } catch (err: any) {
      mgr.setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${err.message}`, isStreaming: false } : m));
      mgr.setIsStreaming(false);
    }
  }, [mgr]);

  return (
    <PlatformProvider ipc={ipc} storage={storage} ui={ui}>
      <div className="split-pane">
        <div ref={browserPaneRef} className="browser-pane">
          <NavBar />
          {/* Native webview will be rendered over this area by Tauri */}
          <div className="browser-placeholder">
            <div className="browser-placeholder__msg">
              Browser Webview Active
            </div>
          </div>
        </div>

        <div className="resizer" onMouseDown={startResizing} />

        <div className="chat-sidebar-wrapper" style={{ width: sidebarWidth, flex: 'none' }}>
          <ConversationDrawer
            conversations={mgr.convList}
            activeConversationId={mgr.activeConvId}
            isOpen={mgr.drawerOpen}
            onClose={() => mgr.setDrawerOpen(false)}
            onSelect={mgr.handleSelectConversation}
            onDelete={mgr.handleDeleteConversation}
            onTogglePin={mgr.handleTogglePin}
            onNewChat={mgr.handleNewChat}
            onExportAll={mgr.handleExportAll}
            onImportAll={mgr.handleImportAll}
          />
          <SidePanel
            onSettingsClick={() => mgr.setSettingsOpen(!mgr.settingsOpen)}
            onNewChat={mgr.handleNewChat}
            onHistoryClick={() => mgr.setDrawerOpen(true)}
            activeProvider={mgr.activeProvider}
            activeModel={mgr.activeModel}
            totalCost={mgr.totalCost}
            totalTokens={mgr.totalTokens}
          >
            {mgr.settingsOpen ? (
              <SettingsView
                activeProvider={mgr.activeProvider}
                activeModel={mgr.activeModel}
                onProviderChange={mgr.handleProviderChange}
                onModelChange={mgr.handleModelChange}
                onClose={() => mgr.setSettingsOpen(false)}
              />
            ) : (
              <MessageList messages={mgr.messages} />
            )}
          </SidePanel>
          {confirmAction && (
            <ActionConfirmation 
              action={confirmAction.action}
              params={confirmAction.params}
              onAllow={() => { confirmAction.resolve(true); setConfirmAction(null); }}
              onDeny={() => { confirmAction.resolve(false); setConfirmAction(null); }}
            />
          )}
          {localModelLoading && (
            <ModelLoader 
              progress={localModelProgress} 
              onSkip={() => {
                storage.config.set('skipLocalModel', true);
                setLocalModelLoading(false);
              }} 
            />
          )}
          {!mgr.settingsOpen && (
            <InputBar
              onSend={handleSend}
              disabled={mgr.isStreaming}
              placeholder={mgr.isStreaming ? 'Wave is thinking...' : undefined}
            />
          )}
        </div>
      </div>
    </PlatformProvider>
  );
}

export default App;
