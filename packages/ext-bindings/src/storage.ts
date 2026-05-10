/**
 * Chrome Extension Storage implementation.
 * 
 * config  → chrome.storage.local (key-value)
 * database → IndexedDB via Dexie.js (structured data) — Sprint 2+
 * cache   → IndexedDB ArrayBuffers (binary blobs) — Sprint 2+
 * secure  → chrome.storage.session (ephemeral, shared via setAccessLevel)
 * 
 * @see Knowledge Base: Wave 5.1, Wave 5.2, Wave 5.4
 */

import type { StorageProvider } from '@wave/core';

export class ExtStorageProvider implements StorageProvider {
  config = {
    async get<T>(key: string): Promise<T | null> {
      return new Promise((resolve) => {
        chrome.storage.local.get(key, (result) => {
          resolve((result[key] as T) ?? null);
        });
      });
    },

    async set<T>(key: string, value: T): Promise<void> {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
      });
    },

    async delete(key: string): Promise<void> {
      return new Promise((resolve) => {
        chrome.storage.local.remove(key, resolve);
      });
    },
  };

  // Stub — full Dexie implementation in Sprint 2
  database = {
    async query<T>(_queryStr: string, _params?: unknown[]): Promise<T[]> {
      console.warn('[ExtStorage] database.query not yet implemented');
      return [];
    },
    async insert(_table: string, _data: Record<string, unknown>): Promise<void> {
      console.warn('[ExtStorage] database.insert not yet implemented');
    },
    async update(_table: string, _id: string, _data: Record<string, unknown>): Promise<void> {
      console.warn('[ExtStorage] database.update not yet implemented');
    },
    async delete(_table: string, _id: string): Promise<void> {
      console.warn('[ExtStorage] database.delete not yet implemented');
    },
  };

  // Stub — Sprint 2
  cache = {
    async storeBlob(_key: string, _blob: Blob | ArrayBuffer): Promise<void> {
      console.warn('[ExtStorage] cache.storeBlob not yet implemented');
    },
    async retrieveBlob(_key: string): Promise<Blob | null> {
      console.warn('[ExtStorage] cache.retrieveBlob not yet implemented');
      return null;
    },
    async deleteBlob(_key: string): Promise<void> {
      console.warn('[ExtStorage] cache.deleteBlob not yet implemented');
    },
  };

  /**
   * Secure storage using chrome.storage.session.
   * Requires setAccessLevel(TRUSTED_AND_UNTRUSTED_CONTEXTS) in service worker
   * to be accessible from Side Panel.
   */
  secure = {
    async getSecret(key: string): Promise<string | null> {
      return new Promise((resolve) => {
        chrome.storage.session.get(key, (result) => {
          resolve((result[key] as string) ?? null);
        });
      });
    },

    async setSecret(key: string, secret: string): Promise<void> {
      return new Promise((resolve) => {
        chrome.storage.session.set({ [key]: secret }, resolve);
      });
    },

    async deleteSecret(key: string): Promise<void> {
      return new Promise((resolve) => {
        chrome.storage.session.remove(key, resolve);
      });
    },
  };
}
