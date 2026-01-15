/**
 * Automata Client Tests
 */

import { describe, expect, it } from 'vitest';
import {
  AutomataClient,
  base64UrlDecode,
  base64UrlEncode,
  buildCanonicalRequest,
  createClient,
  generateKeyPair,
  generateRequestId,
  generateRequestTimestamp,
  signData,
  verifySignature,
} from './index';

describe('automata-client', () => {
  describe('createClient', () => {
    it('should create a client instance', () => {
      const client = createClient('http://localhost:3000');
      expect(client).toBeInstanceOf(AutomataClient);
    });

    it('should strip trailing slash from baseUrl', () => {
      const client = new AutomataClient({ baseUrl: 'http://localhost:3000/' });
      expect(client.getAccountId()).toBeUndefined();
    });
  });

  describe('client configuration', () => {
    it('should set and get token', () => {
      const client = createClient('http://localhost:3000');
      client.setToken('test-token');
      expect(client.getToken()).toBe('test-token');
    });

    it('should set and get accountId', () => {
      const client = createClient('http://localhost:3000');
      client.setAccountId('acc_123');
      expect(client.getAccountId()).toBe('acc_123');
    });

    it('should support method chaining', () => {
      const client = createClient('http://localhost:3000');
      const result = client.setToken('token').setPrivateKey('key').setAccountId('acc');
      expect(result).toBe(client);
    });
  });

  describe('generateKeyPair', () => {
    it('should generate valid key pair', async () => {
      const keyPair = await generateKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();

      // Ed25519 public key is 32 bytes, Base64URL encoded ~43 chars
      expect(keyPair.publicKey.length).toBeGreaterThan(40);
      // Ed25519 private key is 32 bytes, Base64URL encoded ~43 chars
      expect(keyPair.privateKey.length).toBeGreaterThan(40);
    });

    it('should generate different keys each time', async () => {
      const keyPair1 = await generateKeyPair();
      const keyPair2 = await generateKeyPair();

      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
    });
  });

  describe('signData and verifySignature', () => {
    it('should sign and verify data', async () => {
      const keyPair = await generateKeyPair();
      const data = new TextEncoder().encode('Hello, World!');

      const signature = await signData(data, keyPair.privateKey);
      expect(signature).toBeDefined();

      const isValid = await verifySignature(signature, data, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong data', async () => {
      const keyPair = await generateKeyPair();
      const data = new TextEncoder().encode('Hello, World!');
      const wrongData = new TextEncoder().encode('Wrong data');

      const signature = await signData(data, keyPair.privateKey);
      const isValid = await verifySignature(signature, wrongData, keyPair.publicKey);
      expect(isValid).toBe(false);
    });

    it('should fail verification with wrong key', async () => {
      const keyPair1 = await generateKeyPair();
      const keyPair2 = await generateKeyPair();
      const data = new TextEncoder().encode('Hello, World!');

      const signature = await signData(data, keyPair1.privateKey);
      const isValid = await verifySignature(signature, data, keyPair2.publicKey);
      expect(isValid).toBe(false);
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
