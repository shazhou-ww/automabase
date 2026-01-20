/**
 * Request signing utilities
 *
 * Implements the Automabase request signing protocol for write operations.
 * Uses ECDSA P-256 algorithm.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { CryptoProvider } from './types';

/**
 * Headers required for request signing
 */
export interface SignableHeaders {
  'Content-Type': string;
  Host: string;
  'X-Request-Id': string;
  'X-Request-Timestamp': string;
  [key: string]: string;
}

/**
 * Build canonical request string for signing
 *
 * The canonical request format:
 * - HTTP Method
 * - Request Path
 * - Empty line (for query string, not used)
 * - Canonical Headers (sorted, lowercase key:value pairs)
 * - Signed Headers (semicolon-separated list of header names)
 * - SHA256 hash of request body
 */
export function buildCanonicalRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string
): string {
  const signedHeaderNames = ['content-type', 'host', 'x-request-id', 'x-request-timestamp'];

  // Normalize and sort headers
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (signedHeaderNames.includes(lowerKey) && value) {
      normalizedHeaders[lowerKey] = value.trim();
    }
  }

  const sortedKeys = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${normalizedHeaders[k]}`).join('\n');
  const signedHeadersStr = sortedKeys.join(';');

  // Hash body
  const bodyHash = createHash('sha256')
    .update(body || '')
    .digest('hex');

  return [method, path, '', canonicalHeaders, signedHeadersStr, bodyHash].join('\n');
}

/**
 * Sign a request using ECDSA P-256
 *
 * @param method - HTTP method
 * @param path - Request path
 * @param headers - Request headers
 * @param body - Request body (JSON string)
 * @param accountId - Account ID for signing
 * @param cryptoProvider - CryptoProvider instance
 * @returns Signature header value
 */
export async function signRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | undefined,
  accountId: string,
  cryptoProvider: CryptoProvider
): Promise<string> {
  const canonicalRequest = buildCanonicalRequest(method, path, headers, body);
  const hashedRequest = createHash('sha256').update(canonicalRequest).digest('hex');

  // Sign the hashed request using CryptoProvider
  const signature = await cryptoProvider.sign(accountId, { hash: hashedRequest });
  return `Algorithm=ECDSA-P256, Signature=${signature}`;
}

/**
 * Generate request ID
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Generate request timestamp
 */
export function generateRequestTimestamp(): string {
  return new Date().toISOString();
}
