/**
 * Platform Auth Tests
 */

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { parseApiKeyHeader } from './utils/api-key-verifier';
import { extractApiKeyHeader } from './utils/middleware';

describe('parseApiKeyHeader', () => {
  it('should parse keyId:secret format', () => {
    const result = parseApiKeyHeader('admin-001:my-secret-key');
    expect(result).toEqual({
      keyId: 'admin-001',
      secret: 'my-secret-key',
    });
  });

  it('should parse AdminKey keyId:secret format', () => {
    const result = parseApiKeyHeader('AdminKey admin-001:my-secret-key');
    expect(result).toEqual({
      keyId: 'admin-001',
      secret: 'my-secret-key',
    });
  });

  it('should handle secrets with colons', () => {
    const result = parseApiKeyHeader('admin-001:secret:with:colons');
    expect(result).toEqual({
      keyId: 'admin-001',
      secret: 'secret:with:colons',
    });
  });

  it('should return null for empty string', () => {
    const result = parseApiKeyHeader('');
    expect(result).toBeNull();
  });

  it('should return null for missing colon', () => {
    const result = parseApiKeyHeader('no-colon-here');
    expect(result).toBeNull();
  });

  it('should return null for empty keyId', () => {
    const result = parseApiKeyHeader(':secret-only');
    expect(result).toBeNull();
  });

  it('should return null for empty secret', () => {
    const result = parseApiKeyHeader('keyid-only:');
    expect(result).toBeNull();
  });
});

describe('extractApiKeyHeader', () => {
  const createEvent = (headers: Record<string, string>): APIGatewayProxyEvent => ({
    headers,
    body: null,
    httpMethod: 'GET',
    path: '/test',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '/test',
    isBase64Encoded: false,
    multiValueHeaders: {},
  });

  it('should extract X-Admin-Key header', () => {
    const event = createEvent({ 'X-Admin-Key': 'admin-001:secret' });
    expect(extractApiKeyHeader(event)).toBe('admin-001:secret');
  });

  it('should extract lowercase x-admin-key header', () => {
    const event = createEvent({ 'x-admin-key': 'admin-001:secret' });
    expect(extractApiKeyHeader(event)).toBe('admin-001:secret');
  });

  it('should extract Authorization header with AdminKey scheme', () => {
    const event = createEvent({ Authorization: 'AdminKey admin-001:secret' });
    expect(extractApiKeyHeader(event)).toBe('AdminKey admin-001:secret');
  });

  it('should prefer X-Admin-Key over Authorization', () => {
    const event = createEvent({
      'X-Admin-Key': 'from-admin-key',
      Authorization: 'AdminKey from-auth',
    });
    expect(extractApiKeyHeader(event)).toBe('from-admin-key');
  });

  it('should return undefined for missing headers', () => {
    const event = createEvent({});
    expect(extractApiKeyHeader(event)).toBeUndefined();
  });

  it('should return undefined for non-AdminKey Authorization', () => {
    const event = createEvent({ Authorization: 'Bearer some-jwt-token' });
    expect(extractApiKeyHeader(event)).toBeUndefined();
  });
});
