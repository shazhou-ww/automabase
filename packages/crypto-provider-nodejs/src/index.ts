/**
 * @automabase/crypto-provider-nodejs
 *
 * Node.js implementation of CryptoProvider using file system for key storage.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CryptoProvider } from '@automabase/automata-client';

// Default key storage directory
const DEFAULT_KEY_DIR = path.join(process.cwd(), '.automata-keys');

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/**
 * Get key file path for an account
 */
function getKeyFilePath(accountId: string, keyDir: string = DEFAULT_KEY_DIR): string {
  // Sanitize accountId for filename
  const sanitized = accountId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(keyDir, `${sanitized}.json`);
}

/**
 * Store key pair in file system
 */
async function storeKeyPair(
  accountId: string,
  privateKey: CryptoKey,
  publicKey: string,
  keyDir: string = DEFAULT_KEY_DIR
): Promise<void> {
  // Ensure directory exists
  await fs.mkdir(keyDir, { recursive: true });

  // Export private key
  const keyBytes = await crypto.subtle.exportKey('pkcs8', privateKey);
  const privateKeyBase64 = base64UrlEncode(new Uint8Array(keyBytes));

  const keyData = {
    accountId,
    privateKey: privateKeyBase64,
    publicKey,
    createdAt: new Date().toISOString(),
  };

  const filePath = getKeyFilePath(accountId, keyDir);
  await fs.writeFile(filePath, JSON.stringify(keyData, null, 2), 'utf-8');
}

/**
 * Load key pair from file system
 */
async function loadKeyPair(
  accountId: string,
  keyDir: string = DEFAULT_KEY_DIR
): Promise<{ privateKey: CryptoKey; publicKey: string } | undefined> {
  const filePath = getKeyFilePath(accountId, keyDir);

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const keyData = JSON.parse(fileContent);

    const keyBytes = base64UrlDecode(keyData.privateKey);
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      toArrayBuffer(keyBytes),
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['sign']
    );

    return {
      privateKey,
      publicKey: keyData.publicKey,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
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
    true, // extractable for file system storage
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
 * Node.js CryptoProvider implementation
 */
export class NodeCryptoProvider implements CryptoProvider {
  private keyDir: string;

  constructor(keyDir?: string) {
    this.keyDir = keyDir || DEFAULT_KEY_DIR;
  }

  async getPublicKey(accountId: string): Promise<string> {
    const keyPair = await loadKeyPair(accountId, this.keyDir);
    if (!keyPair) {
      throw new Error(`No key pair found for account: ${accountId}`);
    }
    return keyPair.publicKey;
  }

  async sign(accountId: string, data: unknown): Promise<string> {
    const keyPair = await loadKeyPair(accountId, this.keyDir);
    if (!keyPair) {
      throw new Error(`No key pair found for account: ${accountId}`);
    }

    const hashedData = await hashJsonData(data);
    return signData(hashedData, keyPair.privateKey);
  }

  async verify(accountId: string, data: unknown, signature: string): Promise<boolean> {
    const keyPair = await loadKeyPair(accountId, this.keyDir);
    if (!keyPair) {
      return false;
    }

    const hashedData = await hashJsonData(data);
    return verifySignature(signature, hashedData, keyPair.publicKey);
  }

  async ensureKeyPair(accountId: string): Promise<string> {
    let keyPair = await loadKeyPair(accountId, this.keyDir);

    if (!keyPair) {
      // Generate new key pair
      keyPair = await generateKeyPair();
      await storeKeyPair(accountId, keyPair.privateKey, keyPair.publicKey, this.keyDir);
    }

    return keyPair.publicKey;
  }
}

/**
 * Create a new NodeCryptoProvider instance
 *
 * @param keyDir - Optional directory for key storage (default: .automata-keys in current directory)
 */
export function createCryptoProvider(keyDir?: string): CryptoProvider {
  return new NodeCryptoProvider(keyDir);
}

/**
 * Base64URL encode bytes
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode to bytes
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}
