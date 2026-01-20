/**
 * @automabase/crypto-provider-browser
 *
 * Browser implementation of CryptoProvider using IndexedDB for key storage.
 */

import type { CryptoProvider } from '@automabase/automata-client';

const DB_NAME = 'automata-crypto';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/**
 * Open IndexedDB database
 */
async function openDB(): Promise<IDBDatabase> {
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
 * Store key pair in IndexedDB
 */
async function storeKeyPair(
  accountId: string,
  privateKey: CryptoKey,
  publicKey: string
): Promise<void> {
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
}

/**
 * Load key pair from IndexedDB
 */
async function loadKeyPair(
  accountId: string
): Promise<{ privateKey: CryptoKey; publicKey: string } | undefined> {
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

      const keyBytes = base64UrlDecode(data.privateKey);
      crypto.subtle
        .importKey(
          'pkcs8',
          toArrayBuffer(keyBytes),
          {
            name: 'ECDSA',
            namedCurve: 'P-256',
          },
          true,
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
}

/**
 * Generate a new ECDSA P-256 key pair
 */
async function generateKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable for IndexedDB storage
    ['sign', 'verify']
  );

  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64Url = base64UrlEncode(new Uint8Array(publicKeyRaw));

  return {
    privateKey: keyPair.privateKey,
    publicKey: publicKeyBase64Url,
  };
}

/**
 * Hash JSON data for signing
 */
async function hashJsonData(data: unknown): Promise<Uint8Array> {
  const jsonString = JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
  return new Uint8Array(hashBuffer);
}

/**
 * Sign data with private key
 */
async function signData(data: Uint8Array, privateKey: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    privateKey,
    toArrayBuffer(data)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Verify signature
 */
async function verifySignature(
  signature: string,
  data: Uint8Array,
  publicKeyBase64Url: string
): Promise<boolean> {
  try {
    const signatureBytes = base64UrlDecode(signature);
    const publicKeyBytes = base64UrlDecode(publicKeyBase64Url);

    const publicKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(publicKeyBytes),
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    );

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(data)
    );
  } catch {
    return false;
  }
}

/**
 * Browser CryptoProvider implementation
 */
export class BrowserCryptoProvider implements CryptoProvider {
  async getPublicKey(accountId: string): Promise<string> {
    const keyPair = await loadKeyPair(accountId);
    if (!keyPair) {
      throw new Error(`No key pair found for account: ${accountId}`);
    }
    return keyPair.publicKey;
  }

  async sign(accountId: string, data: unknown): Promise<string> {
    const keyPair = await loadKeyPair(accountId);
    if (!keyPair) {
      throw new Error(`No key pair found for account: ${accountId}`);
    }

    const hashedData = await hashJsonData(data);
    return signData(hashedData, keyPair.privateKey);
  }

  async verify(accountId: string, data: unknown, signature: string): Promise<boolean> {
    const keyPair = await loadKeyPair(accountId);
    if (!keyPair) {
      return false;
    }

    const hashedData = await hashJsonData(data);
    return verifySignature(signature, hashedData, keyPair.publicKey);
  }

  async ensureKeyPair(accountId: string): Promise<string> {
    let keyPair = await loadKeyPair(accountId);

    if (!keyPair) {
      // Generate new key pair
      keyPair = await generateKeyPair();
      await storeKeyPair(accountId, keyPair.privateKey, keyPair.publicKey);
    }

    return keyPair.publicKey;
  }
}

/**
 * Create a new BrowserCryptoProvider instance
 */
export function createCryptoProvider(): CryptoProvider {
  return new BrowserCryptoProvider();
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
