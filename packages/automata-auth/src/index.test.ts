import { describe, it, expect, beforeEach } from 'vitest';
import { extractBearerToken, AuthError, clearJwksCache } from './index';

describe('automata-auth', () => {
  beforeEach(() => {
    clearJwksCache();
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    });

    it('should handle case-insensitive Bearer prefix', () => {
      expect(extractBearerToken('bearer abc123')).toBe('abc123');
      expect(extractBearerToken('BEARER abc123')).toBe('abc123');
    });

    it('should return null for missing header', () => {
      expect(extractBearerToken(undefined)).toBeNull();
      expect(extractBearerToken(null)).toBeNull();
      expect(extractBearerToken('')).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(extractBearerToken('Basic abc123')).toBeNull();
      expect(extractBearerToken('Bearer')).toBeNull();
      expect(extractBearerToken('Bearer token extra')).toBeNull();
      expect(extractBearerToken('abc123')).toBeNull();
    });
  });

  describe('AuthError', () => {
    it('should create error with correct code', () => {
      const error = new AuthError('Test error', 'INVALID_TOKEN');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('INVALID_TOKEN');
      expect(error.name).toBe('AuthError');
    });
  });

  // Note: Full JWT verification tests would require mocking JWKS endpoint
  // In production, integration tests should be used with real Auth0 test tokens
});
