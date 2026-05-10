/**
 * Storage abstraction — tiered by data profile.
 * 
 * Chrome Extension: chrome.storage.local, IndexedDB, Web Crypto, chrome.storage.session
 * Tauri Native: tauri-plugin-store, tauri-plugin-sql (SQLite), tauri-plugin-fs, OS keychain
 * 
 * @see Knowledge Base: Wave 5.4 — Portable Chrome Extension to Tauri Abstraction
 */

export interface StorageProvider {
  /** Lightweight key-value for app configuration. */
  config: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };

  /** High-throughput storage for structured data (conversations, analytics). */
  database: {
    query<T>(queryStr: string, params?: unknown[]): Promise<T[]>;
    insert(table: string, data: Record<string, unknown>): Promise<void>;
    update(table: string, id: string, data: Record<string, unknown>): Promise<void>;
    delete(table: string, id: string): Promise<void>;
  };

  /** Binary blob storage for heavy assets (model weights). */
  cache: {
    storeBlob(key: string, blob: Blob | ArrayBuffer): Promise<void>;
    retrieveBlob(key: string): Promise<Blob | null>;
    deleteBlob(key: string): Promise<void>;
  };

  /** Secure storage for sensitive credentials (API keys). */
  secure: {
    getSecret(key: string): Promise<string | null>;
    setSecret(key: string, secret: string): Promise<void>;
    deleteSecret(key: string): Promise<void>;
  };
}
