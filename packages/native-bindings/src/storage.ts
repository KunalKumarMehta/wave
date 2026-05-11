import { load, Store } from '@tauri-apps/plugin-store';
import type { StorageProvider } from '@wave/core';

export class NativeStorageProvider implements StorageProvider {
  // Lazily loaded store
  private configStore: Store | null = null;
  private secureStore: Store | null = null;

  private async getConfigStore(): Promise<Store> {
    if (!this.configStore) {
      this.configStore = await load('config.json');
    }
    return this.configStore;
  }

  private async getSecureStore(): Promise<Store> {
    if (!this.secureStore) {
      // In a real implementation, we'd use a secure native keychain plugin.
      // For now, we stub it with a store file.
      this.secureStore = await load('secure.json');
    }
    return this.secureStore;
  }

  config = {
    get: async <T>(key: string): Promise<T | null> => {
      const store = await this.getConfigStore();
      return (await store.get<T>(key)) ?? null;
    },
    set: async <T>(key: string, value: T): Promise<void> => {
      const store = await this.getConfigStore();
      await store.set(key, value);
      await store.save();
    },
    delete: async (key: string): Promise<void> => {
      const store = await this.getConfigStore();
      await store.delete(key);
      await store.save();
    },
  };

  // Stubs for Phase 3 (Tauri SQLite / FS / CEF integration)
  database = {
    query: async <T>(_queryStr: string, _params?: unknown[]): Promise<T[]> => {
      console.warn('[NativeStorage] Database not yet implemented');
      return [];
    },
    insert: async (_table: string, _data: Record<string, unknown>): Promise<void> => {
      console.warn('[NativeStorage] Database not yet implemented');
    },
    update: async (_table: string, _id: string, _data: Record<string, unknown>): Promise<void> => {
      console.warn('[NativeStorage] Database not yet implemented');
    },
    delete: async (_table: string, _id: string): Promise<void> => {
      console.warn('[NativeStorage] Database not yet implemented');
    },
  };

  cache = {
    storeBlob: async (_key: string, _blob: Blob | ArrayBuffer): Promise<void> => {
      console.warn('[NativeStorage] Cache not yet implemented');
    },
    retrieveBlob: async (_key: string): Promise<Blob | null> => {
      console.warn('[NativeStorage] Cache not yet implemented');
      return null;
    },
    deleteBlob: async (_key: string): Promise<void> => {
      console.warn('[NativeStorage] Cache not yet implemented');
    },
  };

  secure = {
    getSecret: async (key: string): Promise<string | null> => {
      const store = await this.getSecureStore();
      return (await store.get<string>(key)) ?? null;
    },
    setSecret: async (key: string, secret: string): Promise<void> => {
      const store = await this.getSecureStore();
      await store.set(key, secret);
      await store.save();
    },
    deleteSecret: async (key: string): Promise<void> => {
      const store = await this.getSecureStore();
      await store.delete(key);
      await store.save();
    },
  };
}
