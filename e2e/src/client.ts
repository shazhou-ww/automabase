/**
 * E2E Test API Client
 *
 * Provides methods for calling Automabase API endpoints
 */

import * as crypto from 'node:crypto';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { config } from './config';

// Polyfill for @noble/ed25519
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  /** Skip request signing (for read operations) */
  skipSignature?: boolean;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

/**
 * Generate Ed25519 key pair for testing
 */
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const privateKeyBytes = ed.utils.randomPrivateKey();
  const publicKeyBytes = await ed.getPublicKey(privateKeyBytes);

  return {
    publicKey: base64UrlEncode(publicKeyBytes),
    privateKey: base64UrlEncode(privateKeyBytes),
  };
}

/**
 * Sign data with Ed25519 private key
 */
export async function signData(data: Uint8Array, privateKeyBase64Url: string): Promise<string> {
  const privateKey = base64UrlDecode(privateKeyBase64Url);
  const signature = await ed.sign(data, privateKey);
  return base64UrlEncode(signature);
}

/**
 * Build canonical request for signing
 */
function buildCanonicalRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string
): string {
  const signedHeaders = ['content-type', 'host', 'x-request-id', 'x-request-timestamp'];

  // Normalize and sort headers
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (signedHeaders.includes(lowerKey) && value) {
      normalizedHeaders[lowerKey] = value.trim();
    }
  }

  const sortedKeys = Object.keys(normalizedHeaders).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${normalizedHeaders[k]}`).join('\n');
  const signedHeadersStr = sortedKeys.join(';');

  // Hash body
  const bodyHash = crypto
    .createHash('sha256')
    .update(body || '')
    .digest('hex');

  return [method, path, '', canonicalHeaders, signedHeadersStr, bodyHash].join('\n');
}

/**
 * Sign a request
 */
async function signRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | undefined,
  privateKey: string
): Promise<string> {
  const canonicalRequest = buildCanonicalRequest(method, path, headers, body);
  const hashedRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const signature = await signData(new TextEncoder().encode(hashedRequest), privateKey);
  return `Algorithm=Ed25519, Signature=${signature}`;
}

/**
 * Base64URL encode
 */
function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/**
 * API Client class
 */
export class ApiClient {
  private baseUrl: string;
  private token?: string;
  private privateKey?: string;
  private accountId?: string;

  constructor(baseUrl: string = config.apiBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Set authentication token
   */
  setToken(token: string): this {
    this.token = token;
    return this;
  }

  /**
   * Set private key for request signing
   */
  setPrivateKey(privateKey: string): this {
    this.privateKey = privateKey;
    return this;
  }

  /**
   * Set account ID for API calls
   */
  setAccountId(accountId: string): this {
    this.accountId = accountId;
    return this;
  }

  /**
   * Get current account ID
   */
  getAccountId(): string | undefined {
    return this.accountId;
  }

  /**
   * Make API request
   */
  async request<T = unknown>(options: RequestOptions): Promise<ApiResponse<T>> {
    const { method, path, body, token, headers: customHeaders, skipSignature } = options;

    const url = `${this.baseUrl}${path}`;
    const bodyStr = body ? JSON.stringify(body) : undefined;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Host: new URL(this.baseUrl).host,
      ...customHeaders,
    };

    // Add auth token
    const authToken = token || this.token;
    if (authToken) {
      headers.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }

    // Add request ID and timestamp for write operations
    const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isWriteOperation) {
      headers['X-Request-Id'] = crypto.randomUUID();
      headers['X-Request-Timestamp'] = new Date().toISOString();

      // Sign request if we have a private key
      if (this.privateKey && !skipSignature) {
        headers['X-Signature'] = await signRequest(method, path, headers, bodyStr, this.privateKey);
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: bodyStr,
    });

    let data: T;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = (await response.json()) as T;
    } else {
      data = (await response.text()) as unknown as T;
    }

    return {
      status: response.status,
      data,
      headers: response.headers,
    };
  }

  // Account API
  async getMe(): Promise<
    ApiResponse<{ registered: boolean; account?: unknown; cognitoUser?: unknown }>
  > {
    return this.request({ method: 'GET', path: '/v1/accounts/me' });
  }

  async createAccount(
    publicKey: string
  ): Promise<ApiResponse<{ account: unknown; isNew: boolean }>> {
    return this.request({
      method: 'POST',
      path: '/v1/accounts',
      body: { publicKey },
    });
  }

  async updateAccount(updates: {
    displayName?: string;
    avatarUrl?: string;
  }): Promise<ApiResponse<{ account: unknown }>> {
    return this.request({
      method: 'PATCH',
      path: '/v1/accounts/me',
      body: updates,
    });
  }

  async getAccount(accountId: string): Promise<ApiResponse<{ account: unknown }>> {
    return this.request({ method: 'GET', path: `/v1/accounts/${accountId}` });
  }

  // Automata API - now requires accountId in path
  async createAutomata(
    blueprint: unknown,
    blueprintSignature?: string,
    accountId?: string
  ): Promise<ApiResponse<unknown>> {
    const targetAccountId = accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId parameter.');
    }
    return this.request({
      method: 'POST',
      path: `/v1/accounts/${targetAccountId}/automatas`,
      body: { blueprint, blueprintSignature },
    });
  }

  async listAutomatas(options?: {
    limit?: number;
    cursor?: string;
    accountId?: string;
  }): Promise<ApiResponse<{ automatas: unknown[]; nextCursor?: string }>> {
    const targetAccountId = options?.accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId in options.');
    }
    let path = `/v1/accounts/${targetAccountId}/automatas`;
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    if (params.toString()) path += `?${params.toString()}`;

    return this.request({ method: 'GET', path });
  }

  async getAutomata(automataId: string, accountId?: string): Promise<ApiResponse<unknown>> {
    const targetAccountId = accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId parameter.');
    }
    return this.request({
      method: 'GET',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}`,
    });
  }

  async getAutomataState(
    automataId: string,
    accountId?: string
  ): Promise<ApiResponse<{ currentState: unknown; version?: number; status?: string }>> {
    const targetAccountId = accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId parameter.');
    }
    return this.request({
      method: 'GET',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/state`,
    });
  }

  async updateAutomata(
    automataId: string,
    updates: { status?: string },
    accountId?: string
  ): Promise<ApiResponse<unknown>> {
    const targetAccountId = accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId parameter.');
    }
    return this.request({
      method: 'PATCH',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}`,
      body: updates,
    });
  }

  // Event API - now requires accountId in path
  async sendEvent(
    automataId: string,
    eventType: string,
    eventData: unknown,
    accountId?: string
  ): Promise<ApiResponse<unknown>> {
    const targetAccountId = accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId parameter.');
    }
    return this.request({
      method: 'POST',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/events`,
      body: { eventType, eventData },
    });
  }

  async listEvents(
    automataId: string,
    options?: {
      direction?: 'forward' | 'backward';
      anchor?: string;
      limit?: number;
      accountId?: string;
    }
  ): Promise<ApiResponse<{ events: unknown[]; nextAnchor?: string }>> {
    const targetAccountId = options?.accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId in options.');
    }
    let path = `/v1/accounts/${targetAccountId}/automatas/${automataId}/events`;
    const params = new URLSearchParams();
    if (options?.direction) params.set('direction', options.direction);
    if (options?.anchor) params.set('anchor', options.anchor);
    if (options?.limit) params.set('limit', String(options.limit));
    if (params.toString()) path += `?${params.toString()}`;

    return this.request({ method: 'GET', path });
  }

  async getEvent(
    automataId: string,
    version: string,
    accountId?: string
  ): Promise<ApiResponse<unknown>> {
    const targetAccountId = accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId parameter.');
    }
    return this.request({
      method: 'GET',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/events/${version}`,
    });
  }

  // WebSocket API
  async getWsToken(): Promise<ApiResponse<{ token: string }>> {
    return this.request({
      method: 'POST',
      path: '/v1/ws/token',
    });
  }
}

/**
 * Create a new API client instance
 */
export function createClient(baseUrl?: string): ApiClient {
  return new ApiClient(baseUrl);
}
