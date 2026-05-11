import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PlatformProvider } from '@wave/ui-components';
import { SidePanel } from '@wave/ui-components';
import { ExtIPCProvider, ExtStorageProvider } from '@wave/ext-bindings';
import { SettingsView } from '@wave/ui-components/src/layout/SettingsView.js';
import { ConversationDrawer } from '@wave/ui-components/src/layout/ConversationDrawer.js';
import { MessageList } from '@wave/ui-components/src/chat/MessageList.js';
import { InputBar } from '@wave/ui-components/src/chat/InputBar.js';
import type { UIProvider, Message } from '@wave/core';
import type { ProviderName } from '@wave/core/src/state/settings.js';
import { PROVIDER_CATALOG } from '@wave/core/src/state/settings.js';
import { costTracker } from '@wave/core/src/domain/cost-tracker.js';
import {
  createConversationStorage,
  type ConversationSummary,
} from '@wave/core/src/domain/conversation-storage.js';
import type { StreamChunk } from '@wave/core/src/types/stream.js';

// ── Platform Bindings ───────────────────────────────────────────

const ipc = new ExtIPCProvider();
const storage = new ExtStorageProvider();

const ui: UIProvider = {
  environment: 'extension',
  windowControls: null,
  openNewWindow: async (url: string) => {
    await chrome.tabs.create({ url });
  },
};

// ── Conversation Storage ────────────────────────────────────────

const convStorage = createConversationStorage({
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async delete(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
});

// ── Utility ─────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Detect page-aware queries
function isPageQuery(query: string): boolean {
  const pageKeywords = [
    'this page', 'this site', 'this tab', 'the page', 'current page',
    'summarize', 'summarise', 'what is this', 'what\'s on',
    'click', 'type', 'fill', 'navigate', 'scroll',
    'find on', 'read', 'extract', 'scrape',
  ];
  const lower = query.toLowerCase();
  return pageKeywords.some((kw) => lower.includes(kw));
}

// ── Stream Handler ──────────────────────────────────────────────

interface StreamMsg {
  chunk?: StreamChunk;
  done?: boolean;
  error?: string;
  status?: string;
  pageStats?: unknown;
}

function useStreamHandler(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
  onCostUpdate: () => void,
  activeConvIdRef: React.RefObject<string | null>,
) {
  const handleStreamMessages = useCallback(
    (assistantMsgId: string, port: chrome.runtime.Port, provider: string, model: string) => {
      port.onMessage.addListener((message: StreamMsg) => {
        // Status updates (agent mode)
        if (message.status) {
          const statusText =
            message.status === 'extracting_page'
              ? '🔍 Reading page structure...'
              : message.status === 'thinking'
                ? '🧠 Analyzing page...'
                : message.status === 'executing_action'
                  ? `⚡ Executing: ${(message as Record<string, unknown>).action ?? 'action'}...`
                  : '';
          if (statusText) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: statusText } : m
              )
            );
          }
          return;
        }

        if (message.error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `Error: ${message.error}`, isStreaming: false }
                : m
            )
          );
          setIsStreaming(false);
          port.disconnect();
          return;
        }

        if (message.chunk) {
          const chunk = message.chunk;

          if (chunk.type === 'text_delta') {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const current = m.content;
                const isStatus = current.startsWith('🔍') || current.startsWith('🧠');
                return {
                  ...m,
                  content: isStatus ? chunk.content : current + chunk.content,
                };
              })
            );
          }

          if (chunk.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: `Error: ${chunk.content}`, isStreaming: false }
                  : m
              )
            );
            setIsStreaming(false);
          }

          if (chunk.type === 'done') {
            // Record cost if usage data present
            if (chunk.metadata?.usage) {
              costTracker.record({
                provider,
                model,
                promptTokens: chunk.metadata.usage.promptTokens ?? 0,
                completionTokens: chunk.metadata.usage.completionTokens ?? 0,
                thinkingTokens: chunk.metadata.usage.thinkingTokens,
                timestamp: Date.now(),
              });
              onCostUpdate();
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, isStreaming: false } : m
              )
            );
            setIsStreaming(false);
          }
        }

        if (message.done) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m
            )
          );
          setIsStreaming(false);
          port.disconnect();
        }
      });
    },
    [setMessages, setIsStreaming, onCostUpdate]
  );

  return handleStreamMessages;
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

  // Ref for stream handler to access current conversation ID
  const activeConvIdRef = useRef<string | null>(null);
  activeConvIdRef.current = activeConvId;

  const refreshCost = useCallback(() => {
    const summary = costTracker.getSummary();
    setTotalCost(summary.totalCost);
    setTotalTokens(summary.totalPromptTokens + summary.totalCompletionTokens);
  }, []);

  const handleStreamMessages = useStreamHandler(setMessages, setIsStreaming, refreshCost, activeConvIdRef);

  // Refresh conversation list from storage
  const refreshConvList = useCallback(async () => {
    const list = await convStorage.list();
    setConvList(list);
  }, []);

  // Load a conversation by ID
  const loadConversation = useCallback(async (id: string) => {
    const conv = await convStorage.get(id);
    if (conv) {
      setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
      setActiveConvId(id);
    }
  }, []);

  // Persist messages to active conversation (debounced via effect)
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeConvId || messages.length === 0) return;

    // Debounce: persist 300ms after last message change
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(async () => {
      const conv = await convStorage.get(activeConvId);
      if (!conv) return;

      // Full replace — simpler than diffing during streaming
      const cleaned = messages.map((m) => ({ ...m, isStreaming: false }));
      await chrome.storage.local.set({
        [`conv_${activeConvId}`]: { ...conv, messages: cleaned, updatedAt: Date.now() },
      });
    }, 300);

    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [messages, activeConvId]);

  // Initialize: load settings + last conversation or create new
  useEffect(() => {
    (async () => {
      // Load provider settings
      const p = await storage.config.get<string>('activeProvider');
      if (p && p in PROVIDER_CATALOG) {
        setActiveProvider(p as ProviderName);
        const m = await storage.config.get<string>('activeModel');
        setActiveModel(m ?? PROVIDER_CATALOG[p as ProviderName].defaultModel);
      }

      // Load conversation list
      const list = await convStorage.list();
      setConvList(list);

      // Load last active conversation or most recent
      const lastActiveId = await storage.config.get<string>('activeConvId');

      if (lastActiveId) {
        const conv = await convStorage.get(lastActiveId);
        if (conv) {
          setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
          setActiveConvId(lastActiveId);
          return;
        }
      }

      // Fallback: load most recent conversation
      if (list.length > 0) {
        const conv = await convStorage.get(list[0].id);
        if (conv) {
          setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
          setActiveConvId(list[0].id);
          await storage.config.set('activeConvId', list[0].id);
          return;
        }
      }

      // No conversations — create first one
      const newId = await convStorage.create(activeProvider, activeModel);
      setActiveConvId(newId);
      setMessages([]);
      await storage.config.set('activeConvId', newId);
      await refreshConvList();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist active conversation ID
  useEffect(() => {
    if (activeConvId) {
      storage.config.set('activeConvId', activeConvId);
    }
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

    // If we deleted the active one, switch
    if (id === activeConvId) {
      const list = await convStorage.list();
      if (list.length > 0) {
        await loadConversation(list[0].id);
      } else {
        // Create fresh
        const newId = await convStorage.create(activeProvider, activeModel);
        setActiveConvId(newId);
        setMessages([]);
        await refreshConvList();
      }
    }
  }, [activeConvId, activeProvider, activeModel, loadConversation, refreshConvList]);

  const handleProviderChange = useCallback((p: ProviderName) => {
    setActiveProvider(p);
    setActiveModel(PROVIDER_CATALOG[p].defaultModel);
    storage.config.set('activeProvider', p);
  }, []);

  const handleModelChange = useCallback((m: string) => {
    setActiveModel(m);
    storage.config.set('activeModel', m);
  }, []);

  const handleSend = useCallback(async (content: string) => {
    const apiKey = await storage.secure.getSecret(`apikey_${activeProvider}`);
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }

    // Ensure we have an active conversation
    let convId = activeConvId;
    if (!convId) {
      convId = await convStorage.create(activeProvider, activeModel);
      setActiveConvId(convId);
    }

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    const assistantMsg: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // Persist user message + update title if first message
    await convStorage.addMessage(convId, userMsg);
    await refreshConvList();

    const isPageAware = isPageQuery(content);

    if (isPageAware) {
      // Get the active web page tab (not chrome:// or the side panel itself)
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs.find((t) => t.url?.startsWith('http'));
      if (!tab?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: 'Error: No web page tab found. Navigate to a website first.', isStreaming: false }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      const port = chrome.runtime.connect({ name: 'agent-stream' });
      handleStreamMessages(assistantMsg.id, port, activeProvider, activeModel);

      port.postMessage({
        action: 'start',
        args: {
          provider: activeProvider,
          model: activeModel,
          apiKey,
          tabId: tab.id,
          query: content,
          history: messages.slice(-6).map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        },
      });
    } else {
      const apiMessages = [
        {
          role: 'system' as const,
          content: 'You are Wave, an AI browser assistant. Be concise, helpful, and precise.',
        },
        ...messages.slice(-10).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content },
      ];

      const port = chrome.runtime.connect({ name: 'cloud-stream' });
      handleStreamMessages(assistantMsg.id, port, activeProvider, activeModel);

      port.postMessage({
        action: 'start',
        args: {
          provider: activeProvider,
          model: activeModel,
          messages: apiMessages,
          apiKey,
        },
      });
    }
  }, [messages, activeProvider, activeModel, activeConvId, handleStreamMessages, refreshConvList]);

  return (
    <PlatformProvider ipc={ipc} storage={storage} ui={ui}>
      <ConversationDrawer
        conversations={convList}
        activeConversationId={activeConvId}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        onNewChat={handleNewChat}
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
            onProviderChange={handleProviderChange}
            onModelChange={handleModelChange}
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

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
