import React, { useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { PlatformProvider } from '@wave/ui-components';
import { SidePanel } from '@wave/ui-components';
import { ExtIPCProvider, ExtStorageProvider } from '@wave/ext-bindings';
import { SettingsView } from '@wave/ui-components/src/layout/SettingsView.js';
import { ConversationDrawer } from '@wave/ui-components/src/layout/ConversationDrawer.js';
import { MessageList } from '@wave/ui-components/src/chat/MessageList.js';
import { InputBar } from '@wave/ui-components/src/chat/InputBar.js';
import type { UIProvider, Message } from '@wave/core';
import { useConversationManager, generateId, isPageQuery, TITLE_SYSTEM_PROMPT } from '@wave/core';
import { costTracker } from '@wave/core/src/domain/cost-tracker.js';
import { createConversationStorage } from '@wave/core/src/domain/conversation-storage.js';
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
  const mgr = useConversationManager({
    convStorage,
    configStorage: storage.config,
  });

  const handleStreamMessages = useStreamHandler(mgr.setMessages, mgr.setIsStreaming, mgr.refreshCost);

  // Debounced persistence of messages to storage
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!mgr.activeConvId || mgr.messages.length === 0) return;

    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(async () => {
      const conv = await convStorage.get(mgr.activeConvId!);
      if (!conv) return;
      const cleaned = mgr.messages.map((m) => ({ ...m, isStreaming: false }));
      await chrome.storage.local.set({
        [`conv_${mgr.activeConvId}`]: { ...conv, messages: cleaned, updatedAt: Date.now() },
      });
    }, 300);

    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [mgr.messages, mgr.activeConvId]);

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

    // Auto-title via LLM on first message
    if (isFirstMessage) {
      const titlePort = chrome.runtime.connect({ name: 'cloud-stream' });
      let generatedTitle = '';
      titlePort.onMessage.addListener((msg: StreamMsg) => {
        if (msg.chunk?.type === 'text_delta') {
          generatedTitle += msg.chunk.content;
        }
        if (msg.done || msg.chunk?.type === 'done') {
          titlePort.disconnect();
          const finalTitle = generatedTitle.replace(/["']/g, '').trim().slice(0, 60);
          if (finalTitle) {
            convStorage.updateMeta(convId!, { title: finalTitle }).then(mgr.refreshConvList);
          }
        }
      });
      titlePort.postMessage({
        action: 'start',
        args: {
          provider: mgr.activeProvider,
          model: mgr.activeModel,
          messages: [
            { role: 'system', content: TITLE_SYSTEM_PROMPT },
            { role: 'user', content }
          ],
          apiKey,
        },
      });
    }

    const isPageAware = isPageQuery(content);

    if (isPageAware) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs.find((t) => t.url?.startsWith('http'));
      if (!tab?.id) {
        mgr.setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: 'Error: No web page tab found. Navigate to a website first.', isStreaming: false }
              : m
          )
        );
        mgr.setIsStreaming(false);
        return;
      }

      const port = chrome.runtime.connect({ name: 'agent-stream' });
      handleStreamMessages(assistantMsg.id, port, mgr.activeProvider, mgr.activeModel);

      port.postMessage({
        action: 'start',
        args: {
          provider: mgr.activeProvider,
          model: mgr.activeModel,
          apiKey,
          tabId: tab.id,
          query: content,
          history: mgr.messages.slice(-6).map((m) => ({
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
        ...mgr.messages.slice(-10).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content },
      ];

      const port = chrome.runtime.connect({ name: 'cloud-stream' });
      handleStreamMessages(assistantMsg.id, port, mgr.activeProvider, mgr.activeModel);

      port.postMessage({
        action: 'start',
        args: {
          provider: mgr.activeProvider,
          model: mgr.activeModel,
          messages: apiMessages,
          apiKey,
        },
      });
    }
  }, [mgr, handleStreamMessages]);

  return (
    <PlatformProvider ipc={ipc} storage={storage} ui={ui}>
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
      {!mgr.settingsOpen && (
        <InputBar
          onSend={handleSend}
          disabled={mgr.isStreaming}
          placeholder={mgr.isStreaming ? 'Wave is thinking...' : undefined}
        />
      )}
    </PlatformProvider>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
