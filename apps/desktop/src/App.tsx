import { useState } from 'react';
import { PlatformProvider, SidePanel, SettingsView } from '@wave/ui-components';
import { InputBar } from '@wave/ui-components/src/chat/InputBar.js';
import { MessageList } from '@wave/ui-components/src/chat/MessageList.js';
import { NativeIPCProvider, NativeStorageProvider } from '@wave/native-bindings';
import type { ProviderName } from '@wave/core/src/state/settings.js';
import { PROVIDER_CATALOG } from '@wave/core/src/state/settings.js';
import type { Message } from '@wave/core';

import './App.css';

const ipc = new NativeIPCProvider();
const storage = new NativeStorageProvider();

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

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<ProviderName>('gemini');
  const [activeModel, setActiveModel] = useState(PROVIDER_CATALOG.gemini.defaultModel);

  const handleSend = (content: string) => {
    setMessages(prev => [
      ...prev,
      { id: Date.now().toString(), role: 'user', content, timestamp: Date.now() }
    ]);
  };

  return (
    <PlatformProvider ipc={ipc} storage={storage} ui={ui}>
      <SidePanel
        onSettingsClick={() => setSettingsOpen(!settingsOpen)}
        onNewChat={() => setMessages([])}
        onHistoryClick={() => {}}
        activeProvider={activeProvider}
        activeModel={activeModel}
        totalCost={0}
        totalTokens={0}
      >
        {settingsOpen ? (
          <SettingsView
            activeProvider={activeProvider}
            activeModel={activeModel}
            onProviderChange={setActiveProvider}
            onModelChange={setActiveModel}
            onClose={() => setSettingsOpen(false)}
          />
        ) : (
          <MessageList messages={messages} />
        )}
      </SidePanel>
      {!settingsOpen && (
        <InputBar
          onSend={handleSend}
          disabled={false}
        />
      )}
    </PlatformProvider>
  );
}

export default App;
