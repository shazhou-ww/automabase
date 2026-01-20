/**
 * IndexedDB storage for CryptoKey persistence
 *
 * Stores private keys securely in IndexedDB using structured clone.
 * Falls back to in-memory storage in Node.js environments (e.g., E2E tests).
 */

const DB_NAME = 'automata-client';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

// In-memory storage for Node.js environments
const memoryStorage = new Map<string, { privateKey: CryptoKey; publicKey: string }>();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/**
 * Check if IndexedDB is available (browser environment)
 */
function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * Open IndexedDB database
 */
async function openDB(): Promise<IDBDatabase> {
  if (!isIndexedDBAvailable()) {
    throw new Error('IndexedDB not available - this should not happen in browser environment');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'accountId' });
      }
    };
  });
}

/**
 * Store private key for an account
 *
 * @param accountId - Account ID
 * @param privateKey - CryptoKey to store (must be extractable)
 * @param publicKey - Base64URL-encoded public key
 */
export async function storeKeyPair(
  accountId: string,
  privateKey: CryptoKey,
  publicKey: string
): Promise<void> {
  if (isIndexedDBAvailable()) {
    // Browser environment - use IndexedDB
    const keyBytes = await crypto.subtle.exportKey('pkcs8', privateKey);
    const privateKeyBase64 = base64UrlEncode(new Uint8Array(keyBytes));

    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.put({
        accountId,
        privateKey: privateKeyBase64,
        publicKey,
        createdAt: new Date().toISOString(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } else {
    // Node.js environment - use in-memory storage
    memoryStorage.set(accountId, { privateKey, publicKey });
  }
}

/**
 * Load private key for an account
 *
 * @param accountId - Account ID
 * @returns CryptoKey if found, undefined otherwise
 */
export async function loadKeyPair(
  accountId: string
): Promise<{ privateKey: CryptoKey; publicKey: string } | undefined> {
  if (isIndexedDBAvailable()) {
    // Browser environment - use IndexedDB
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(accountId);

      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          resolve(undefined);
          return;
        }

        // Import private key from stored format
        const keyBytes = base64UrlDecode(data.privateKey);
        crypto.subtle
          .importKey(
            'pkcs8',
            toArrayBuffer(keyBytes),
            {
              name: 'ECDSA',
              namedCurve: 'P-256',
            },
            true, // extractable for future storage
            ['sign']
          )
          .then((privateKey) => {
            resolve({
              privateKey,
              publicKey: data.publicKey,
            });
          })
          .catch(reject);
      };

      request.onerror = () => reject(request.error);
    });
  } else {
    // Node.js environment - use in-memory storage
    return memoryStorage.get(accountId);
  }
}

/**
 * Delete stored key pair for an account
 *
 * @param accountId - Account ID
 */
export async function deleteKeyPair(accountId: string): Promise<void> {
  if (isIndexedDBAvailable()) {
    // Browser environment - use IndexedDB
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(accountId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } else {
    // Node.js environment - use in-memory storage
    memoryStorage.delete(accountId);
  }
}

/**
 * Base64URL encode bytes
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode to bytes
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
