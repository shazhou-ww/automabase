import { describe, it, expect } from 'vitest';
import {
  canonicalizeQueryString,
  canonicalizeHeaders,
  hashBody,
  buildCanonicalRequest,
  hashCanonicalRequest,
  buildAndHashCanonicalRequest,
  type RequestInfo,
} from './canonical-request';

describe('canonical-request', () => {
  describe('canonicalizeQueryString', () => {
    it('should return empty string for undefined', () => {
      expect(canonicalizeQueryString(undefined)).toBe('');
    });

    it('should return empty string for empty object', () => {
      expect(canonicalizeQueryString({})).toBe('');
    });

    it('should sort params alphabetically', () => {
      const result = canonicalizeQueryString({ z: '1', a: '2', m: '3' });
      expect(result).toBe('a=2&m=3&z=1');
    });

    it('should handle array values', () => {
      const result = canonicalizeQueryString({ tag: ['b', 'a'] });
      expect(result).toBe('tag=a&tag=b');
    });

    it('should URL encode special characters', () => {
      const result = canonicalizeQueryString({ key: 'hello world', special: 'a=b&c' });
      expect(result).toBe('key=hello%20world&special=a%3Db%26c');
    });

    it('should filter undefined values', () => {
      const result = canonicalizeQueryString({ a: '1', b: undefined, c: '3' });
      expect(result).toBe('a=1&c=3');
    });
  });

  describe('canonicalizeHeaders', () => {
    it('should only include signed headers', () => {
      const headers = {
        Host: 'api.example.com',
        'X-Request-Id': '123',
        'X-Request-Timestamp': '2024-01-01T00:00:00Z',
        'Content-Type': 'application/json',
        'X-Custom': 'ignored',
        Authorization: 'Bearer token',
      };

      const { canonical, signedHeaders } = canonicalizeHeaders(headers);

      expect(signedHeaders).toBe('content-type;host;x-request-id;x-request-timestamp');
      expect(canonical).toBe(
        'content-type:application/json\n' +
        'host:api.example.com\n' +
        'x-request-id:123\n' +
        'x-request-timestamp:2024-01-01T00:00:00Z'
      );
    });

    it('should lowercase header names and trim values', () => {
      const { canonical } = canonicalizeHeaders({
        'HOST': '  example.com  ',
        'X-REQUEST-ID': '  abc  ',
      });

      expect(canonical).toBe('host:example.com\nx-request-id:abc');
    });
  });

  describe('hashBody', () => {
    it('should hash empty body', () => {
      const hash = hashBody('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should hash JSON body', () => {
      const hash = hashBody('{"hello":"world"}');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should handle undefined as empty', () => {
      const hash = hashBody(undefined);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('buildCanonicalRequest', () => {
    it('should build correct canonical request', () => {
      const request: RequestInfo = {
        method: 'POST',
        path: '/v1/automatas',
        queryParams: { limit: '10' },
        headers: {
          Host: 'api.example.com',
          'X-Request-Id': 'uuid-123',
          'X-Request-Timestamp': '2024-01-01T00:00:00Z',
          'Content-Type': 'application/json',
        },
        body: '{"name":"test"}',
      };

      const canonical = buildCanonicalRequest(request);
      const lines = canonical.split('\n');

      // Line 0: HTTP Method
      expect(lines[0]).toBe('POST');
      // Line 1: Path
      expect(lines[1]).toBe('/v1/automatas');
      // Line 2: Query String
      expect(lines[2]).toBe('limit=10');
      // Lines 3-6: Canonical Headers (4 headers, sorted alphabetically)
      expect(lines[3]).toBe('content-type:application/json');
      expect(lines[4]).toBe('host:api.example.com');
      expect(lines[5]).toBe('x-request-id:uuid-123');
      expect(lines[6]).toBe('x-request-timestamp:2024-01-01T00:00:00Z');
      // Line 7: Signed Headers
      expect(lines[7]).toBe('content-type;host;x-request-id;x-request-timestamp');
      // Line 8: Body SHA256
      expect(lines[8]).toHaveLength(64);
    });

    it('should handle GET request without body', () => {
      const request: RequestInfo = {
        method: 'GET',
        path: '/v1/accounts/me',
        headers: {
          Host: 'api.example.com',
        },
      };

      const canonical = buildCanonicalRequest(request);
      expect(canonical).toContain('GET');
      expect(canonical).toContain('/v1/accounts/me');
    });
  });

  describe('buildAndHashCanonicalRequest', () => {
    it('should return both canonical and hashed request', () => {
      const request: RequestInfo = {
        method: 'POST',
        path: '/test',
        headers: { Host: 'localhost' },
        body: '{}',
      };

      const { canonicalRequest, hashedRequest } = buildAndHashCanonicalRequest(request);

      expect(canonicalRequest).toContain('POST');
      expect(hashedRequest).toHaveLength(64);
      expect(hashCanonicalRequest(canonicalRequest)).toBe(hashedRequest);
    });
  });
});

