/**
 * useConversationManager — shared hook for multi-conversation management.
 *
 * Used by both Extension (sidepanel.tsx) and Desktop (App.tsx) to manage
 * conversation lifecycle: create, load, switch, delete, pin, export/import.
 *
 * @see HANDOFF.md — Sprint 15 (shared hooks refactor)
 */

import { useState, useCallback, useEffect } from 'react';
import type { Message } from '../types/message.js';
import { costTracker } from '../domain/cost-tracker.js';
import type { ConversationStorageAPI, ConversationSummary } from '../domain/conversation-storage.js';
import type { StorageProvider } from '../abstractions/storage.js';
import type { ProviderName } from '../state/settings.js';
import { PROVIDER_CATALOG } from '../state/settings.js';

export interface ConversationManagerConfig {
  convStorage: ConversationStorageAPI;
  configStorage: StorageProvider['config'];
}

export interface ConversationManagerState {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  activeConvId: string | null;
  convList: ConversationSummary[];
  totalCost: number;
  totalTokens: number;
  activeProvider: ProviderName;
  activeModel: string;
  settingsOpen: boolean;
  drawerOpen: boolean;
  isStreaming: boolean;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface ConversationManagerActions {
  refreshCost: () => void;
  refreshConvList: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  handleNewChat: () => Promise<void>;
  handleSelectConversation: (id: string) => Promise<void>;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleTogglePin: (id: string) => Promise<void>;
  handleProviderChange: (p: ProviderName) => void;
  handleModelChange: (m: string) => void;
  handleExportAll: () => Promise<void>;
  handleImportAll: () => void;
  setSettingsOpen: (open: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
}

export function useConversationManager(
  config: ConversationManagerConfig,
): ConversationManagerState & ConversationManagerActions {
  const { convStorage, configStorage } = config;

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

  // ── Cost ──────────────────────────────────────────────────

  const refreshCost = useCallback(() => {
    const summary = costTracker.getSummary();
    setTotalCost(summary.totalCost);
    setTotalTokens(summary.totalPromptTokens + summary.totalCompletionTokens);
  }, []);

  // ── Conversation list ────────────────────────────────────

  const refreshConvList = useCallback(async () => {
    const list = await convStorage.list();
    setConvList(list);
  }, [convStorage]);

  const loadConversation = useCallback(async (id: string) => {
    const conv = await convStorage.get(id);
    if (conv) {
      setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
      setActiveConvId(id);
    }
  }, [convStorage]);

  // ── Init ──────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      // Load provider settings
      const p = await configStorage.get<string>('activeProvider');
      if (p && p in PROVIDER_CATALOG) {
        setActiveProvider(p as ProviderName);
        const m = await configStorage.get<string>('activeModel');
        setActiveModel(m ?? PROVIDER_CATALOG[p as ProviderName].defaultModel);
      }

      // Load conversations
      const list = await convStorage.list();
      setConvList(list);

      // Restore last active conversation
      const lastActiveId = await configStorage.get<string>('activeConvId');
      if (lastActiveId) {
        const conv = await convStorage.get(lastActiveId);
        if (conv) {
          setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
          setActiveConvId(lastActiveId);
          return;
        }
      }

      // Fallback: most recent
      if (list.length > 0) {
        const conv = await convStorage.get(list[0].id);
        if (conv) {
          setMessages(conv.messages.map((m) => ({ ...m, isStreaming: false })));
          setActiveConvId(list[0].id);
          await configStorage.set('activeConvId', list[0].id);
          return;
        }
      }

      // No conversations — create first
      const newId = await convStorage.create('gemini', PROVIDER_CATALOG.gemini.defaultModel);
      setActiveConvId(newId);
      setMessages([]);
      await configStorage.set('activeConvId', newId);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist active conversation ID
  useEffect(() => {
    if (activeConvId) configStorage.set('activeConvId', activeConvId);
  }, [activeConvId, configStorage]);

  // ── Handlers ──────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    const newId = await convStorage.create(activeProvider, activeModel);
    setActiveConvId(newId);
    setMessages([]);
    costTracker.reset();
    refreshCost();
    await refreshConvList();
  }, [activeProvider, activeModel, refreshCost, refreshConvList, convStorage]);

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
      if (list.length > 0) {
        await loadConversation(list[0].id);
      } else {
        const newId = await convStorage.create(activeProvider, activeModel);
        setActiveConvId(newId);
        setMessages([]);
        await refreshConvList();
      }
    }
  }, [activeConvId, activeProvider, activeModel, loadConversation, refreshConvList, convStorage]);

  const handleTogglePin = useCallback(async (id: string) => {
    await convStorage.togglePin(id);
    await refreshConvList();
  }, [convStorage, refreshConvList]);

  const handleProviderChange = useCallback((p: ProviderName) => {
    setActiveProvider(p);
    setActiveModel(PROVIDER_CATALOG[p].defaultModel);
    configStorage.set('activeProvider', p);
  }, [configStorage]);

  const handleModelChange = useCallback((m: string) => {
    setActiveModel(m);
    configStorage.set('activeModel', m);
  }, [configStorage]);

  const handleExportAll = useCallback(async () => {
    const json = await convStorage.exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wave_conversations_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [convStorage]);

  const handleImportAll = useCallback(() => {
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
          await refreshConvList();
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [convStorage, refreshConvList]);

  return {
    // State
    messages, setMessages,
    activeConvId,
    convList,
    totalCost, totalTokens,
    activeProvider, activeModel,
    settingsOpen, drawerOpen,
    isStreaming, setIsStreaming,
    // Actions
    refreshCost, refreshConvList, loadConversation,
    handleNewChat, handleSelectConversation, handleDeleteConversation,
    handleTogglePin, handleProviderChange, handleModelChange,
    handleExportAll, handleImportAll,
    setSettingsOpen, setDrawerOpen,
  };
}
