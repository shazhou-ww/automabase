/**
 * Request Signature Verification
 * Based on BUSINESS_MODEL_SPEC.md Section 4.2
 */

import { createHash } from 'crypto';

/**
 * Extract headers from API Gateway event
 */
function extractHeaders(event: {
  headers?: Record<string, string | undefined>;
  multiValueHeaders?: Record<string, string[] | undefined>;
}): Record<string, string> {
  const headers: Record<string, string> = {};

  // API Gateway normalizes headers to lowercase
  const source = event.multiValueHeaders || event.headers || {};

  for (const [key, value] of Object.entries(source)) {
    if (value) {
      // Use first value if array, otherwise use string
      headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
  }

  return headers;
}

/**
 * Build canonical query string (sorted by key)
 */
function buildCanonicalQueryString(queryParams?: Record<string, string | string[]>): string {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return '';
  }

  const params: Array<{ key: string; value: string }> = [];

  for (const [key, value] of Object.entries(queryParams)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        params.push({ key, value: v });
      }
    } else {
      params.push({ key, value });
    }
  }

  // Sort by key, then by value
  params.sort((a, b) => {
    if (a.key !== b.key) {
      return a.key.localeCompare(b.key);
    }
    return a.value.localeCompare(b.value);
  });

  // URL encode and join
  return params
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
}

/**
 * Build canonical headers string
 * Headers must be sorted by lowercase key
 */
function buildCanonicalHeaders(headers: Record<string, string>, signedHeaders: string[]): string {
  const canonicalHeaders: string[] = [];

  for (const headerName of signedHeaders.sort()) {
    const value = headers[headerName.toLowerCase()];
    if (value) {
      canonicalHeaders.push(`${headerName.toLowerCase()}:${value.trim()}`);
    }
  }

  return canonicalHeaders.join('\n') + '\n';
}

/**
 * Compute SHA256 hash of request body
 */
function computeBodyHash(body: string | null | undefined): string {
  if (!body) {
    return createHash('sha256').update('').digest('hex');
  }

  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * Build canonical request string
 * Format: {HTTP-Method}\n{Path}\n{Query-String}\n{Canonical-Headers}\n{Signed-Headers}\n{Body-SHA256}
 */
export function buildCanonicalRequest(
  method: string,
  path: string,
  queryParams: Record<string, string | string[]> | undefined,
  headers: Record<string, string>,
  signedHeaders: string[],
  body: string | null | undefined
): string {
  const queryString = buildCanonicalQueryString(queryParams);
  const canonicalHeaders = buildCanonicalHeaders(headers, signedHeaders);
  const signedHeadersStr = signedHeaders.sort().join(';');
  const bodyHash = computeBodyHash(body);

  return [
    method.toUpperCase(),
    path,
    queryString,
    canonicalHeaders,
    signedHeadersStr,
    bodyHash,
  ].join('\n');
}

/**
 * Extract required headers for signature verification
 */
export function extractSignedHeaders(headers: Record<string, string>): {
  signedHeaders: string[];
  missingHeaders: string[];
} {
  const requiredHeaders = ['host', 'x-request-id', 'x-request-timestamp'];
  const signedHeaders: string[] = [];
  const missingHeaders: string[] = [];

  for (const header of requiredHeaders) {
    const headerLower = header.toLowerCase();
    if (headers[headerLower]) {
      signedHeaders.push(header);
    } else {
      missingHeaders.push(header);
    }
  }

  // Add content-type if body exists
  if (headers['content-type']) {
    signedHeaders.push('content-type');
  }

  return { signedHeaders, missingHeaders };
}

/**
 * Verify Ed25519 signature
 */
export async function verifyRequestSignature(
  signature: string,
  canonicalRequest: string,
  publicKeyBase64Url: string
): Promise<boolean> {
  try {
    // Decode Base64URL public key
    const publicKeyBytes = Buffer.from(publicKeyBase64Url, 'base64url');

    // Decode Base64URL signature
    const signatureBytes = Buffer.from(signature, 'base64url');

    // Import Ed25519 public key using Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    // Verify signature
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      signatureBytes,
      Buffer.from(canonicalRequest, 'utf8')
    );

    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Verify request signature from API Gateway event
 */
export async function verifyRequestSignatureFromEvent(
  event: {
    httpMethod: string;
    path: string;
    queryStringParameters?: Record<string, string | undefined> | null;
    multiValueQueryStringParameters?: Record<string, string[] | undefined> | null;
    headers?: Record<string, string | undefined>;
    multiValueHeaders?: Record<string, string[] | undefined>;
    body?: string | null;
  },
  sessionPublicKey: string
): Promise<{ valid: boolean; error?: string }> {
  // Extract headers
  const headers = extractHeaders(event);

  // Extract signature
  const signature = headers['x-request-signature'];
  if (!signature) {
    return { valid: false, error: 'Missing X-Request-Signature header' };
  }

  // Extract signed headers
  const { signedHeaders, missingHeaders } = extractSignedHeaders(headers);
  if (missingHeaders.length > 0) {
    return {
      valid: false,
      error: `Missing required headers: ${missingHeaders.join(', ')}`,
    };
  }

  // Build query parameters (prefer multiValue, fallback to single)
  // Convert single-value params to multi-value format for consistency
  let queryParams: Record<string, string | string[]> | undefined;
  if (event.multiValueQueryStringParameters) {
    // Filter out undefined values
    queryParams = {};
    for (const [key, value] of Object.entries(event.multiValueQueryStringParameters)) {
      if (value !== undefined) {
        queryParams[key] = value;
      }
    }
  } else if (event.queryStringParameters) {
    // Convert single-value to multi-value format
    queryParams = {};
    for (const [key, value] of Object.entries(event.queryStringParameters)) {
      if (value !== undefined) {
        queryParams[key] = value;
      }
    }
  }

  // Build canonical request
  const canonicalRequest = buildCanonicalRequest(
    event.httpMethod,
    event.path,
    queryParams,
    headers,
    signedHeaders,
    event.body
  );

  // Verify signature
  const isValid = await verifyRequestSignature(signature, canonicalRequest, sessionPublicKey);

  if (!isValid) {
    return { valid: false, error: 'Invalid request signature' };
  }

  return { valid: true };
}

