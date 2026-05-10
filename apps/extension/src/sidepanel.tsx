import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { PlatformProvider } from '@wave/ui-components';
import { SidePanel } from '@wave/ui-components';
import { ExtIPCProvider, ExtStorageProvider } from '@wave/ext-bindings';
import { SettingsView } from '@wave/ui-components/src/layout/SettingsView.js';
import { MessageList } from '@wave/ui-components/src/chat/MessageList.js';
import { InputBar } from '@wave/ui-components/src/chat/InputBar.js';
import type { UIProvider, Message } from '@wave/core';
import type { ProviderName } from '@wave/core/src/state/settings.js';
import { PROVIDER_CATALOG } from '@wave/core/src/state/settings.js';
import { costTracker } from '@wave/core/src/domain/cost-tracker.js';
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
  const [activeProvider, setActiveProvider] = useState<ProviderName>('gemini');
  const [activeModel, setActiveModel] = useState(PROVIDER_CATALOG.gemini.defaultModel);
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);

  const refreshCost = useCallback(() => {
    const summary = costTracker.getSummary();
    setTotalCost(summary.totalCost);
    setTotalTokens(summary.totalPromptTokens + summary.totalCompletionTokens);
  }, []);

  const handleStreamMessages = useStreamHandler(setMessages, setIsStreaming, refreshCost);

  // Load saved settings
  useEffect(() => {
    storage.config.get<string>('activeProvider').then((p) => {
      if (p && p in PROVIDER_CATALOG) {
        setActiveProvider(p as ProviderName);
        storage.config.get<string>('activeModel').then((m) => {
          setActiveModel(m ?? PROVIDER_CATALOG[p as ProviderName].defaultModel);
        });
      }
    });
  }, []);

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

    const isPageAware = isPageQuery(content);

    if (isPageAware) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: 'Error: No active tab found', isStreaming: false }
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
  }, [messages, activeProvider, activeModel, handleStreamMessages]);

  return (
    <PlatformProvider ipc={ipc} storage={storage} ui={ui}>
      <SidePanel
        onSettingsClick={() => setSettingsOpen(!settingsOpen)}
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
