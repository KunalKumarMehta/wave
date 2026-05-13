/**
 * Web Crypto AES-GCM encryption for API key persistence.
 * 
 * Key management:
 * - Random AES-256-GCM key generated on first run
 * - Key exported as JWK, stored in chrome.storage.local
 * - CryptoKey cached in chrome.storage.session for fast access
 * 
 * @see Knowledge Base: Wave 5.2 — API Key Security
 */

const MASTER_KEY_STORAGE = '__wave_master_key';
const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;

let cachedKey: CryptoKey | null = null;

async function getMasterKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  // Try session cache first
  const sessionResult = await new Promise<any>((resolve) => {
    chrome.storage.session.get(MASTER_KEY_STORAGE, resolve);
  });

  if (sessionResult[MASTER_KEY_STORAGE]) {
    cachedKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(sessionResult[MASTER_KEY_STORAGE]),
      { name: ALGO, length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    return cachedKey;
  }

  // Try persistent storage
  const localResult = await new Promise<any>((resolve) => {
    chrome.storage.local.get(MASTER_KEY_STORAGE, resolve);
  });

  if (localResult[MASTER_KEY_STORAGE]) {
    const jwk = JSON.parse(localResult[MASTER_KEY_STORAGE]);
    cachedKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: ALGO, length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    // Cache in session for fast access
    await new Promise<void>((resolve) => {
      chrome.storage.session.set({ [MASTER_KEY_STORAGE]: JSON.stringify(jwk) }, resolve);
    });
    return cachedKey;
  }

  // First run — generate new key
  cachedKey = await crypto.subtle.generateKey(
    { name: ALGO, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );

  const jwk = await crypto.subtle.exportKey('jwk', cachedKey);
  const jwkStr = JSON.stringify(jwk);

  await Promise.all([
    new Promise<void>((resolve) => {
      chrome.storage.local.set({ [MASTER_KEY_STORAGE]: jwkStr }, resolve);
    }),
    new Promise<void>((resolve) => {
      chrome.storage.session.set({ [MASTER_KEY_STORAGE]: jwkStr }, resolve);
    }),
  ]);

  return cachedKey;
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoded
  );

  // Pack IV + ciphertext as base64
  const packed = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...packed));
}

export async function decrypt(packed64: string): Promise<string> {
  const key = await getMasterKey();
  const packed = Uint8Array.from(atob(packed64), (c) => c.charCodeAt(0));

  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
