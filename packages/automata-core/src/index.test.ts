import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  decodeBase62,
  encodeBase62,
  encodeBase62Padded,
  generateAccountId,
  generateAccountIdFromBase64,
  INITIAL_VERSION,
  incrementVersion,
  validateBase64PublicKey,
} from './index';

describe('Base62', () => {
  it('should encode and decode correctly', () => {
    expect(encodeBase62(0n)).toBe('0');
    expect(encodeBase62(61n)).toBe('z');
    expect(encodeBase62(62n)).toBe('10');
    expect(encodeBase62(123456789n)).toBe('8M0kX');

    expect(decodeBase62('0')).toBe(0n);
    expect(decodeBase62('z')).toBe(61n);
    expect(decodeBase62('10')).toBe(62n);
    expect(decodeBase62('8M0kX')).toBe(123456789n);
  });

  it('should handle padded encoding', () => {
    expect(encodeBase62Padded(0, 6)).toBe('000000');
    expect(encodeBase62Padded(1, 6)).toBe('000001');
    expect(encodeBase62Padded(62, 6)).toBe('000010');
  });

  it('should increment version', () => {
    expect(incrementVersion('000000')).toBe('000001');
    expect(incrementVersion('00000z')).toBe('000010');
    expect(incrementVersion('0000zz')).toBe('000100');
  });

  it('should compare versions', () => {
    expect(compareVersions('000000', '000001')).toBe(-1);
    expect(compareVersions('000001', '000000')).toBe(1);
    expect(compareVersions('000001', '000001')).toBe(0);
  });

  it('should have correct initial version', () => {
    expect(INITIAL_VERSION).toBe('000000');
  });
});

describe('Hash', () => {
  it('should generate account ID from public key', () => {
    // 32-byte test public key
    const publicKey = new Uint8Array(32).fill(0x42);
    const accountId = generateAccountId(publicKey);

    // Account ID should be ~22 characters
    expect(accountId.length).toBeGreaterThan(15);
    expect(accountId.length).toBeLessThan(25);

    // Same input should produce same output
    expect(generateAccountId(publicKey)).toBe(accountId);
  });

  it('should generate account ID from base64 public key', () => {
    // 32-byte test public key in base64url
    const publicKeyBase64 = 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE';
    const accountId = generateAccountIdFromBase64(publicKeyBase64);

    expect(accountId.length).toBeGreaterThan(15);
    expect(accountId.length).toBeLessThan(25);
  });

  it('should validate public key format', () => {
    // Valid 32-byte key
    expect(validateBase64PublicKey('QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE')).toBe(true);

    // Invalid: wrong length
    expect(validateBase64PublicKey('QUFBQUFBQUFB')).toBe(false);

    // Invalid: not base64
    expect(validateBase64PublicKey('not-valid-base64!!!')).toBe(false);
  });
});
