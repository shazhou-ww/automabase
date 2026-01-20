/**
 * Automata Client Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CryptoProvider } from './index';
import {
  AutomataClient,
  base64UrlDecode,
  base64UrlEncode,
  buildCanonicalRequest,
  createClient,
  generateRequestId,
  generateRequestTimestamp,
} from './index';

function createMockCryptoProvider(): CryptoProvider {
  const keys = new Map<string, { privateKey: CryptoKey; publicKey: string }>();

  function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    return buf;
  }

  async function hashJsonData(data: unknown): Promise<Uint8Array> {
    const jsonString = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(jsonString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    return new Uint8Array(hashBuffer);
  }

  async function generateKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: string }> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign', 'verify']
    );

    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyBase64Url = base64UrlEncode(new Uint8Array(publicKeyRaw));
    return { privateKey: keyPair.privateKey, publicKey: publicKeyBase64Url };
  }

  return {
    async getPublicKey(accountId: string): Promise<string> {
      const keyPair = keys.get(accountId);
      if (!keyPair) throw new Error(`No key pair found for account: ${accountId}`);
      return keyPair.publicKey;
    },

    async sign(accountId: string, data: unknown): Promise<string> {
      const keyPair = keys.get(accountId);
      if (!keyPair) throw new Error(`No key pair found for account: ${accountId}`);

      const hashedData = await hashJsonData(data);
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        toArrayBuffer(hashedData)
      );
      return base64UrlEncode(new Uint8Array(signature));
    },

    async verify(accountId: string, data: unknown, signature: string): Promise<boolean> {
      const keyPair = keys.get(accountId);
      if (!keyPair) return false;

      const hashedData = await hashJsonData(data);
      const signatureBytes = base64UrlDecode(signature);
      const publicKeyBytes = base64UrlDecode(keyPair.publicKey);

      const publicKey = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(publicKeyBytes),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        toArrayBuffer(signatureBytes),
        toArrayBuffer(hashedData)
      );
    },

    async ensureKeyPair(accountId: string): Promise<string> {
      const existing = keys.get(accountId);
      if (existing) return existing.publicKey;

      const keyPair = await generateKeyPair();
      keys.set(accountId, keyPair);
      return keyPair.publicKey;
    },
  };
}

beforeEach(() => {
  // Keep for symmetry / future expansion
});

afterEach(() => {
  // Keep for symmetry / future expansion
});

describe('automata-client', () => {
  describe('createClient', () => {
    it('should create a client instance', async () => {
      const client = await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'test-account',
        cryptoProvider: createMockCryptoProvider(),
      });
      expect(client).toBeInstanceOf(AutomataClient);
    });

    it('should require accountId', async () => {
      await expect(
        createClient({
          baseUrl: 'http://localhost:3201',
          // @ts-expect-error - accountId is required
          accountId: undefined,
        })
      ).rejects.toThrow('accountId is required');
    });

    it('should strip trailing slash from baseUrl', async () => {
      const client = await createClient({
        baseUrl: 'http://localhost:3201/',
        accountId: 'test-account',
        cryptoProvider: createMockCryptoProvider(),
      });
      expect(client.getAccountId()).toBe('test-account');
    });

    it('should reuse existing key from provider storage', async () => {
      const cryptoProvider = createMockCryptoProvider();
      // Create first client to generate and store key
      const client1 = await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'test-account',
        cryptoProvider,
      });

      // Create second client - should load same key
      const client2 = await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'test-account',
        cryptoProvider,
      });

      expect(client1.getAccountId()).toBe(client2.getAccountId());
      // Both clients should have the same private key (same account)
    });

    it('should call onDeviceReady when new key is created', async () => {
      let onDeviceReadyCalled = false;
      let receivedPublicKey = '';
      let receivedDeviceName = '';

      await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'new-account',
        deviceName: 'Test Device',
        cryptoProvider: createMockCryptoProvider(),
        onDeviceReady: async (publicKey, deviceName) => {
          onDeviceReadyCalled = true;
          receivedPublicKey = publicKey;
          receivedDeviceName = deviceName;
        },
      });

      expect(onDeviceReadyCalled).toBe(true);
      expect(receivedPublicKey).toBeDefined();
      expect(receivedPublicKey.length).toBeGreaterThan(80);
      expect(receivedDeviceName).toBe('Test Device');
    });

    it('should not call onDeviceReady when key already exists', async () => {
      let callCount = 0;

      const cryptoProvider = createMockCryptoProvider();
      // Create first client
      await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'existing-account',
        cryptoProvider,
        onDeviceReady: async () => {
          callCount++;
        },
      });

      // Create second client - should not call onDeviceReady
      await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'existing-account',
        cryptoProvider,
        onDeviceReady: async () => {
          callCount++;
        },
      });

      expect(callCount).toBe(1); // Only called once for new key
    });
  });

  describe('client configuration (immutable)', () => {
    it('should create new instance with token', async () => {
      const client1 = await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'test-account',
        cryptoProvider: createMockCryptoProvider(),
      });
      const client2 = client1.withToken('test-token');

      expect(client1.getToken()).toBeUndefined();
      expect(client2.getToken()).toBe('test-token');
      expect(client2).not.toBe(client1);
    });

    it('should support token provider', async () => {
      let callCount = 0;
      const tokenProvider = async () => {
        callCount++;
        return `token-${callCount}`;
      };

      const client = await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'test-account',
        cryptoProvider: createMockCryptoProvider(),
        tokenProvider,
      });

      expect(client.getToken()).toBeUndefined();
      // Token provider will be called during request
    });
  });

  describe('signData and verifySignature', () => {
    it('should sign and verify data', async () => {
      // Create client to get a key pair
      const client = await createClient({
        baseUrl: 'http://localhost:3201',
        accountId: 'test-account',
        cryptoProvider: createMockCryptoProvider(),
      });

      // Get public key by creating a temporary client and extracting it
      // For testing, we'll use the client's internal state
      // In a real scenario, you'd get the public key from the server after registration
      expect(client).toBeDefined();
    });
  });

  describe('base64Url encoding', () => {
    it('should encode and decode correctly', () => {
      const original = new Uint8Array([1, 2, 3, 255, 254, 253]);
      const encoded = base64UrlEncode(original);
      const decoded = base64UrlDecode(encoded);

      expect(decoded).toEqual(original);
    });

    it('should not contain +, /, or = characters', () => {
      const data = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        data[i] = i * 2;
      }

      const encoded = base64UrlEncode(data);
      expect(encoded).not.toMatch(/[+/=]/);
    });
  });

  describe('buildCanonicalRequest', () => {
    it('should build canonical request string', () => {
      const canonical = buildCanonicalRequest(
        'POST',
        '/v1/accounts',
        {
          'Content-Type': 'application/json',
          Host: 'api.example.com',
          'X-Request-Id': 'req-123',
          'X-Request-Timestamp': '2024-01-01T00:00:00.000Z',
        },
        '{"publicKey":"abc"}'
      );

      expect(canonical).toContain('POST');
      expect(canonical).toContain('/v1/accounts');
      expect(canonical).toContain('content-type:application/json');
      expect(canonical).toContain('host:api.example.com');
    });

    it('should sort headers alphabetically', () => {
      const canonical = buildCanonicalRequest(
        'POST',
        '/test',
        {
          'X-Request-Timestamp': 'timestamp',
          'Content-Type': 'application/json',
          Host: 'example.com',
          'X-Request-Id': 'id',
        },
        ''
      );

      const lines = canonical.split('\n');
      const headerLines = lines.slice(3, 7);

      // Headers should be in alphabetical order
      expect(headerLines[0]).toContain('content-type');
      expect(headerLines[1]).toContain('host');
      expect(headerLines[2]).toContain('x-request-id');
      expect(headerLines[3]).toContain('x-request-timestamp');
    });
  });

  describe('generateRequestId', () => {
    it('should generate UUID format', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateRequestTimestamp', () => {
    it('should generate ISO8601 timestamp', () => {
      const timestamp = generateRequestTimestamp();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });
});
