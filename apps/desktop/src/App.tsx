import { useState, useCallback, useEffect, useRef } from 'react';
import { PlatformProvider, SidePanel, SettingsView } from '@wave/ui-components';
import { InputBar } from '@wave/ui-components/src/chat/InputBar.js';
import { MessageList } from '@wave/ui-components/src/chat/MessageList.js';
import { ConversationDrawer } from '@wave/ui-components/src/layout/ConversationDrawer.js';
import { NativeIPCProvider, NativeStorageProvider, NativeBrowserController } from '@wave/native-bindings';
import type { ProviderName } from '@wave/core/src/state/settings.js';
import { PROVIDER_CATALOG } from '@wave/core/src/state/settings.js';
import type { Message } from '@wave/core';
import { costTracker } from '@wave/core/src/domain/cost-tracker.js';
import { createConversationStorage, type ConversationSummary } from '@wave/core/src/domain/conversation-storage.js';
import { OpenAIAdapter } from '@wave/core/src/domain/adapters/openai.js';
import { AnthropicAdapter } from '@wave/core/src/domain/adapters/anthropic.js';
import { GeminiAdapter } from '@wave/core/src/domain/adapters/gemini.js';
import { ProviderRouter, type ProviderRoute } from '@wave/core/src/domain/provider-router.js';
import { runAgentLoop } from '@wave/core/src/domain/agent-loop.js';
import { serializeAXTree } from '@wave/core/src/domain/ax-serializer.js';

import './App.css';

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

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isPageQuery(query: string): boolean {
  const pageKeywords = [
    'this page', 'this site', 'this tab', 'the page', 'current page',
    'summarize', 'summarise', 'what is this', "what's on",
    'click', 'type', 'fill', 'navigate', 'scroll',
    'find on', 'read', 'extract', 'scrape',
  ];
  return pageKeywords.some((kw) => query.toLowerCase().includes(kw));
}

// ── CDP Operations ───────────────────────────────────────────────

async function getPageContext(tabId: number) {
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

async function handleAgentAction(tabId: number, action: string, params: Record<string, unknown>) {
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
        await cdp.sendCommand(target, 'Page.navigate', { url: params.url });
        await cdp.detach(target);
        return { success: true, action: 'navigate', url: params.url as string };
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ProviderName>('gemini');
  const [activeModel, setActiveModel] = useState(PROVIDER_CATALOG.gemini.defaultModel);
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [convList, setConvList] = useState<ConversationSummary[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshCost = useCallback(() => {
    const summary = costTracker.getSummary();
    setTotalCost(summary.totalCost);
    setTotalTokens(summary.totalPromptTokens + summary.totalCompletionTokens);
  }, []);

  const refreshConvList = useCallback(async () => {
    const list = await convStorage.list();
    setConvList(list);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const conv = await convStorage.get(id);
    if (conv) {
      setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
      setActiveConvId(id);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const p = await storage.config.get<string>('activeProvider');
      if (p && p in PROVIDER_CATALOG) {
        setActiveProvider(p as ProviderName);
        const m = await storage.config.get<string>('activeModel');
        setActiveModel(m ?? PROVIDER_CATALOG[p as ProviderName].defaultModel);
      }
      const list = await convStorage.list();
      setConvList(list);
      const lastActiveId = await storage.config.get<string>('activeConvId');
      if (lastActiveId) {
        const conv = await convStorage.get(lastActiveId);
        if (conv) {
          setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
          setActiveConvId(lastActiveId);
          return;
        }
      }
      if (list.length > 0) {
        const conv = await convStorage.get(list[0].id);
        if (conv) {
          setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
          setActiveConvId(list[0].id);
          await storage.config.set('activeConvId', list[0].id);
          return;
        }
      }
      const newId = await convStorage.create(activeProvider, activeModel);
      setActiveConvId(newId);
      setMessages([]);
      await storage.config.set('activeConvId', newId);
      await refreshConvList();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeConvId) storage.config.set('activeConvId', activeConvId);
  }, [activeConvId]);

  const handleNewChat = useCallback(async () => {
    const newId = await convStorage.create(activeProvider, activeModel);
    setActiveConvId(newId);
    setMessages([]);
    costTracker.reset();
    refreshCost();
    await refreshConvList();
  }, [activeProvider, activeModel, refreshCost, refreshConvList]);

  const handleSelectConversation = useCallback(async (id: string) => {
    await loadConversation(id);
    costTracker.reset();
    refreshCost();
  }, [loadConversation, refreshCost]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await convStorage.delete(id);
    await refreshConvList();
    if (id === activeConvId) {
      const list = await convStorage.list();
      if (list.length > 0) await loadConversation(list[0].id);
      else {
        const newId = await convStorage.create(activeProvider, activeModel);
        setActiveConvId(newId);
        setMessages([]);
        await refreshConvList();
      }
    }
  }, [activeConvId, activeProvider, activeModel, loadConversation, refreshConvList]);

  const handleSend = useCallback(async (content: string) => {
    const apiKey = await storage.secure.getSecret(`apikey_${activeProvider}`);
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }

    let convId = activeConvId;
    if (!convId) {
      convId = await convStorage.create(activeProvider, activeModel);
      setActiveConvId(convId);
    }

    const userMsg: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() };
    const assistantMsg: Message = { id: generateId(), role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const isFirstMessage = (await convStorage.get(convId))?.messages.length === 0;
    await convStorage.addMessage(convId, userMsg);
    await refreshConvList();

    if (isFirstMessage) {
      // Inline title generation
      const adapter = adapters[activeProvider];
      if (adapter) {
        try {
          let generatedTitle = '';
          await adapter.stream({
            model: activeModel,
            messages: [
              { role: 'system', content: 'Summarize the user prompt into a short 3-5 word title. Output ONLY the title, no quotes.' },
              { role: 'user', content }
            ]
          }, { apiKey }, (chunk: any) => {
            if (chunk.type === 'text_delta') generatedTitle += chunk.content;
          }, new AbortController().signal);
          
          const finalTitle = generatedTitle.replace(/["']/g, '').trim().slice(0, 60);
          if (finalTitle) {
            await convStorage.updateMeta(convId!, { title: finalTitle });
            await refreshConvList();
          }
        } catch (e) {
          console.error("Failed to generate title", e);
        }
      }
    }

    abortControllerRef.current = new AbortController();

    try {
      if (isPageQuery(content)) {
        const targets = await cdp.getTargets();
        const tab = targets.find((t) => t.type === 'tab');
        
        if (!tab) {
          setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: 'Error: No active debuggable tab found. Ensure Chrome is running with --remote-debugging-port=9222', isStreaming: false } : m));
          setIsStreaming(false);
          return;
        }

        await runAgentLoop({
          maxSteps: 5,
          adapter: adapters[activeProvider],
          apiKey,
          model: activeModel,
          tabId: Number(tab.id),
          query: content,
          history: messages.slice(-6).map((m) => ({ role: m.role as any, content: m.content })),
          onChunk: (chunk: any) => {
            if (chunk.type === 'text_delta') {
              setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content.startsWith('🔍') || m.content.startsWith('🧠') ? chunk.content : m.content + chunk.content } : m));
            } else if (chunk.type === 'done' && chunk.metadata?.usage) {
              costTracker.record({ provider: activeProvider, model: activeModel, promptTokens: chunk.metadata.usage.promptTokens ?? 0, completionTokens: chunk.metadata.usage.completionTokens ?? 0, timestamp: Date.now() });
              refreshCost();
            }
          },
          onStatus: (status: string, data?: any) => {
            const statusText = status === 'extracting_page' ? '🔍 Reading page structure...' : status === 'thinking' ? '🧠 Analyzing page...' : status === 'executing_action' ? `⚡ Executing: ${data?.action ?? 'action'}...` : '';
            if (statusText) setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: statusText } : m));
          },
          onAction: (action: string, params: any) => handleAgentAction(Number(tab.id), action, params),
          getPageContext: (tid: number) => getPageContext(tid),
          signal: abortControllerRef.current.signal,
        });

      } else {
        const routes: ProviderRoute[] = [{ provider: activeProvider, adapter: adapters[activeProvider], apiKey }];
        const router = new ProviderRouter({ routes, maxRetries: 1 });
        
        await router.stream({
          model: activeModel,
          messages: [
            { role: 'system', content: 'You are Wave, an AI browser assistant. Be concise, helpful, and precise.' },
            ...messages.slice(-10).map((m) => ({ role: m.role as any, content: m.content })),
            { role: 'user', content }
          ]
        }, (chunk: any) => {
          if (chunk.type === 'text_delta') {
            setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: m.content + chunk.content } : m));
          } else if (chunk.type === 'error') {
            setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${chunk.content}`, isStreaming: false } : m));
          } else if (chunk.type === 'done' && chunk.metadata?.usage) {
            costTracker.record({ provider: activeProvider, model: activeModel, promptTokens: chunk.metadata.usage.promptTokens ?? 0, completionTokens: chunk.metadata.usage.completionTokens ?? 0, timestamp: Date.now() });
            refreshCost();
          }
        }, abortControllerRef.current.signal);
      }

      setMessages((prev) => {
        const updated = prev.map((m) => m.id === assistantMsg.id ? { ...m, isStreaming: false } : m);
        const finalMsg = updated.find(m => m.id === assistantMsg.id);
        if (finalMsg && convId) convStorage.addMessage(convId, finalMsg);
        return updated;
      });
      setIsStreaming(false);

    } catch (err: any) {
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `Error: ${err.message}`, isStreaming: false } : m));
      setIsStreaming(false);
    }
  }, [messages, activeProvider, activeModel, activeConvId, refreshConvList, refreshCost]);

  return (
    <PlatformProvider ipc={ipc} storage={storage} ui={ui}>
      <ConversationDrawer
        conversations={convList}
        activeConversationId={activeConvId}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        onTogglePin={async (id) => { await convStorage.togglePin(id); refreshConvList(); }}
        onNewChat={handleNewChat}
        onExportAll={async () => {
          const json = await convStorage.exportAll();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `wave_conversations_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        onImportAll={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/json';
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
              if (typeof evt.target?.result === 'string') {
                await convStorage.importAll(evt.target.result);
                refreshConvList();
              }
            };
            reader.readAsText(file);
          };
          input.click();
        }}
      />
      <SidePanel
        onSettingsClick={() => setSettingsOpen(!settingsOpen)}
        onNewChat={handleNewChat}
        onHistoryClick={() => setDrawerOpen(true)}
        activeProvider={activeProvider}
        activeModel={activeModel}
        totalCost={totalCost}
        totalTokens={totalTokens}
      >
        {settingsOpen ? (
          <SettingsView
            activeProvider={activeProvider}
            activeModel={activeModel}
            onProviderChange={(p) => { setActiveProvider(p); setActiveModel(PROVIDER_CATALOG[p].defaultModel); storage.config.set('activeProvider', p); }}
            onModelChange={(m) => { setActiveModel(m); storage.config.set('activeModel', m); }}
            onClose={() => setSettingsOpen(false)}
          />
        ) : (
          <MessageList messages={messages} />
        )}
      </SidePanel>
      {!settingsOpen && (
        <InputBar
          onSend={handleSend}
          disabled={isStreaming}
          placeholder={isStreaming ? 'Wave is thinking...' : undefined}
        />
      )}
    </PlatformProvider>
  );
}

export default App;
