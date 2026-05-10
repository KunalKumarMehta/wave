import React, { createContext, useContext } from 'react';
import type { IPCProvider, StorageProvider, UIProvider } from '@wave/core';

interface PlatformContextValue {
  ipc: IPCProvider;
  storage: StorageProvider;
  ui: UIProvider;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

interface PlatformProviderProps {
  ipc: IPCProvider;
  storage: StorageProvider;
  ui: UIProvider;
  children: React.ReactNode;
}

/**
 * Root provider that injects platform-specific bindings.
 * Extension injects ext-bindings, desktop injects native-bindings.
 */
export function PlatformProvider({ ipc, storage, ui, children }: PlatformProviderProps) {
  return (
    <PlatformContext.Provider value={{ ipc, storage, ui }}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return ctx;
}
