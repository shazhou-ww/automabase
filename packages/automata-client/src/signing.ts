/**
 * Request signing utilities
 *
 * Implements the Automabase request signing protocol for write operations.
 */

import { createHash, randomUUID } from 'node:crypto';
import { signData } from './crypto';

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
 * Sign a request using Ed25519
 *
 * @param method - HTTP method
 * @param path - Request path
 * @param headers - Request headers
 * @param body - Request body (JSON string)
 * @param privateKey - Base64URL-encoded Ed25519 private key
 * @returns Signature header value
 */
export async function signRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | undefined,
  privateKey: string
): Promise<string> {
  const canonicalRequest = buildCanonicalRequest(method, path, headers, body);
  const hashedRequest = createHash('sha256').update(canonicalRequest).digest('hex');
  const signature = await signData(new TextEncoder().encode(hashedRequest), privateKey);
  return `Algorithm=Ed25519, Signature=${signature}`;
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
