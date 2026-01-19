/**
 * Automata API Client
 *
 * A type-safe client for interacting with the Automabase API.
 */

import { generateRequestId, generateRequestTimestamp, signRequest } from './signing';
import type {
  ApiResponse,
  ArchiveAutomataResponse,
  ClientConfig,
  CreateAccountResponse,
  CreateAutomataResponse,
  GetAccountResponse,
  GetAutomataResponse,
  GetAutomataStateResponse,
  GetEventResponse,
  GetMeResponse,
  GetWsTokenResponse,
  ListAutomatasOptions,
  ListAutomatasResponse,
  ListDevicesResponse,
  ListEventsOptions,
  ListEventsResponse,
  RegisterDeviceResponse,
  RequestOptions,
  RevokeDeviceResponse,
  SendEventResponse,
  UnarchiveAutomataResponse,
  UpdateAccountResponse,
} from './types';

/**
 * Default client configuration
 */
const DEFAULT_CONFIG: Partial<ClientConfig> = {
  timeout: 30000,
};

/**
 * Automata API Client
 *
 * Provides methods for interacting with all Automabase API endpoints.
 *
 * @example
 * ```typescript
 * import { AutomataClient, generateKeyPair } from '@automabase/automata-client';
 *
 * const client = new AutomataClient({ baseUrl: 'https://api.automabase.io' });
 * const keyPair = await generateKeyPair();
 *
 * client
 *   .setToken(jwtToken)
 *   .setPrivateKey(keyPair.privateKey);
 *
 * // Create account and register device at the same time
 * const { data } = await client.createAccount({
 *   publicKey: keyPair.publicKey,
 *   deviceName: 'My Browser',
 * });
 * client.setAccountId(data.account.accountId);
 *
 * const automata = await client.createAutomata(myBlueprint);
 * ```
 */
export class AutomataClient {
  private baseUrl: string;
  private timeout: number;
  private token?: string;
  private privateKey?: string;
  private accountId?: string;

  /**
   * Create a new AutomataClient instance
   *
   * @param config - Client configuration
   */
  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? DEFAULT_CONFIG.timeout ?? 30000;
  }

  // ===========================================================================
  // Configuration Methods
  // ===========================================================================

  /**
   * Set the authentication token (JWT)
   *
   * @param token - JWT token (with or without 'Bearer ' prefix)
   * @returns this (for chaining)
   */
  setToken(token: string): this {
    this.token = token;
    return this;
  }

  /**
   * Get the current authentication token
   */
  getToken(): string | undefined {
    return this.token;
  }

  /**
   * Set the private key for request signing
   *
   * @param privateKey - Base64URL-encoded Ed25519 private key
   * @returns this (for chaining)
   */
  setPrivateKey(privateKey: string): this {
    this.privateKey = privateKey;
    return this;
  }

  /**
   * Set the default account ID for API calls
   *
   * @param accountId - Account ID to use for requests
   * @returns this (for chaining)
   */
  setAccountId(accountId: string): this {
    this.accountId = accountId;
    return this;
  }

  /**
   * Get the current account ID
   */
  getAccountId(): string | undefined {
    return this.accountId;
  }

  // ===========================================================================
  // Generic Request Method
  // ===========================================================================

  /**
   * Make a raw API request
   *
   * @param options - Request options
   * @returns API response with typed data
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
      headers['X-Request-Id'] = generateRequestId();
      headers['X-Request-Timestamp'] = generateRequestTimestamp();

      // Sign request if we have a private key
      if (this.privateKey && !skipSignature) {
        headers['X-Signature'] = await signRequest(method, path, headers, bodyStr, this.privateKey);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr,
        signal: controller.signal,
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
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ===========================================================================
  // Account API
  // ===========================================================================

  /**
   * Get current user's account information
   *
   * @returns Current user info with registration status
   */
  async getMe(): Promise<ApiResponse<GetMeResponse>> {
    return this.request({
      method: 'GET',
      path: '/v1/accounts/me',
    });
  }

  /**
   * Create or retrieve an account
   *
   * If an account with the matching OAuth identity exists, it will be returned.
   * Otherwise, a new account will be created.
   *
   * Optionally, you can provide a publicKey to register a device at the same time.
   *
   * @param options - Optional parameters
   * @param options.publicKey - Ed25519 public key (Base64URL encoded) for device registration
   * @param options.deviceName - Device name (required if publicKey is provided)
   * @returns Account data, device data (if registered), and whether account was newly created
   */
  async createAccount(options?: {
    publicKey?: string;
    deviceName?: string;
  }): Promise<ApiResponse<CreateAccountResponse>> {
    return this.request({
      method: 'POST',
      path: '/v1/accounts',
      body: options || {},
    });
  }

  /**
   * Update current user's account
   *
   * @param updates - Fields to update
   * @returns Updated account
   */
  async updateAccount(updates: {
    displayName?: string;
    avatarUrl?: string;
  }): Promise<ApiResponse<UpdateAccountResponse>> {
    return this.request({
      method: 'PATCH',
      path: '/v1/accounts/me',
      body: updates,
    });
  }

  /**
   * Get an account by ID
   *
   * @param accountId - Account ID to retrieve
   * @returns Account data
   */
  async getAccount(accountId: string): Promise<ApiResponse<GetAccountResponse>> {
    return this.request({
      method: 'GET',
      path: `/v1/accounts/${accountId}`,
    });
  }

  // ==========================================================================
  // Device API
  // ==========================================================================

  /**
   * List devices for the current user
   *
   * @returns List of active devices
   */
  async listDevices(): Promise<ApiResponse<ListDevicesResponse>> {
    return this.request({
      method: 'GET',
      path: '/v1/accounts/me/devices',
    });
  }

  /**
   * Register a new device
   *
   * @param publicKey - Ed25519 public key (Base64URL encoded)
   * @param deviceName - Human-readable device name
   * @param deviceType - Optional device type
   * @returns Registered device data
   */
  async registerDevice(
    publicKey: string,
    deviceName: string,
    deviceType?: 'browser' | 'mobile' | 'desktop' | 'server' | 'other'
  ): Promise<ApiResponse<RegisterDeviceResponse>> {
    return this.request({
      method: 'POST',
      path: '/v1/accounts/me/devices',
      body: { publicKey, deviceName, deviceType },
    });
  }

  /**
   * Revoke a device
   *
   * @param deviceId - Device ID to revoke
   * @returns Revoked device data
   */
  async revokeDevice(deviceId: string): Promise<ApiResponse<RevokeDeviceResponse>> {
    return this.request({
      method: 'DELETE',
      path: `/v1/accounts/me/devices/${deviceId}`,
    });
  }

  // ===========================================================================
  // Automata API
  // ===========================================================================

  /**
   * Resolve account ID from parameter or instance default
   */
  private resolveAccountId(accountId?: string): string {
    const targetAccountId = accountId || this.accountId;
    if (!targetAccountId) {
      throw new Error('accountId is required. Call setAccountId() or pass accountId parameter.');
    }
    return targetAccountId;
  }

  /**
   * Create a new automata (state machine instance)
   *
   * @param blueprint - Blueprint definition
   * @param options - Additional options
   * @returns Created automata info
   */
  async createAutomata(
    blueprint: unknown,
    options?: {
      blueprintSignature?: string;
      accountId?: string;
    }
  ): Promise<ApiResponse<CreateAutomataResponse>> {
    const accountId = this.resolveAccountId(options?.accountId);
    return this.request({
      method: 'POST',
      path: `/v1/accounts/${accountId}/automatas`,
      body: {
        blueprint,
        blueprintSignature: options?.blueprintSignature,
      },
    });
  }

  /**
   * List automatas for an account
   *
   * @param options - List options (pagination, account override)
   * @returns List of automatas with pagination cursor
   */
  async listAutomatas(options?: ListAutomatasOptions): Promise<ApiResponse<ListAutomatasResponse>> {
    const accountId = this.resolveAccountId(options?.accountId);

    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);

    let path = `/v1/accounts/${accountId}/automatas`;
    if (params.toString()) path += `?${params.toString()}`;

    return this.request({ method: 'GET', path });
  }

  /**
   * Get a specific automata
   *
   * @param automataId - Automata ID
   * @param accountId - Optional account ID override
   * @returns Automata data
   */
  async getAutomata(
    automataId: string,
    accountId?: string
  ): Promise<ApiResponse<GetAutomataResponse>> {
    const targetAccountId = this.resolveAccountId(accountId);
    return this.request({
      method: 'GET',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}`,
    });
  }

  /**
   * Get automata's current state
   *
   * @param automataId - Automata ID
   * @param accountId - Optional account ID override
   * @returns Current state, version, and status
   */
  async getAutomataState(
    automataId: string,
    accountId?: string
  ): Promise<ApiResponse<GetAutomataStateResponse>> {
    const targetAccountId = this.resolveAccountId(accountId);
    return this.request({
      method: 'GET',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/state`,
    });
  }

  /**
   * Archive an automata
   *
   * @param automataId - Automata ID to archive
   * @param accountId - Optional account ID override
   * @returns Updated automata status
   */
  async archiveAutomata(
    automataId: string,
    accountId?: string
  ): Promise<ApiResponse<ArchiveAutomataResponse>> {
    const targetAccountId = this.resolveAccountId(accountId);
    return this.request({
      method: 'POST',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/archive`,
    });
  }

  /**
   * Unarchive an automata
   *
   * @param automataId - Automata ID to unarchive
   * @param accountId - Optional account ID override
   * @returns Updated automata status
   */
  async unarchiveAutomata(
    automataId: string,
    accountId?: string
  ): Promise<ApiResponse<UnarchiveAutomataResponse>> {
    const targetAccountId = this.resolveAccountId(accountId);
    return this.request({
      method: 'POST',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/unarchive`,
    });
  }

  // ===========================================================================
  // Event API
  // ===========================================================================

  /**
   * Send an event to an automata
   *
   * Events trigger state transitions in the automata.
   *
   * @param automataId - Target automata ID
   * @param eventType - Event type name
   * @param eventData - Event payload
   * @param accountId - Optional account ID override
   * @returns Event result with new state
   */
  async sendEvent(
    automataId: string,
    eventType: string,
    eventData: unknown,
    accountId?: string
  ): Promise<ApiResponse<SendEventResponse>> {
    const targetAccountId = this.resolveAccountId(accountId);
    return this.request({
      method: 'POST',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/events`,
      body: { eventType, eventData },
    });
  }

  /**
   * List events for an automata
   *
   * @param automataId - Automata ID
   * @param options - Query options (direction, anchor, limit)
   * @returns List of events with pagination anchor
   */
  async listEvents(
    automataId: string,
    options?: ListEventsOptions
  ): Promise<ApiResponse<ListEventsResponse>> {
    const targetAccountId = this.resolveAccountId(options?.accountId);

    const params = new URLSearchParams();
    if (options?.direction) params.set('direction', options.direction);
    if (options?.anchor) params.set('anchor', options.anchor);
    if (options?.limit) params.set('limit', String(options.limit));

    let path = `/v1/accounts/${targetAccountId}/automatas/${automataId}/events`;
    if (params.toString()) path += `?${params.toString()}`;

    return this.request({ method: 'GET', path });
  }

  /**
   * Get a specific event
   *
   * @param automataId - Automata ID
   * @param version - Event version
   * @param accountId - Optional account ID override
   * @returns Event data
   */
  async getEvent(
    automataId: string,
    version: string,
    accountId?: string
  ): Promise<ApiResponse<GetEventResponse>> {
    const targetAccountId = this.resolveAccountId(accountId);
    return this.request({
      method: 'GET',
      path: `/v1/accounts/${targetAccountId}/automatas/${automataId}/events/${version}`,
    });
  }

  // ===========================================================================
  // WebSocket API
  // ===========================================================================

  /**
   * Get a WebSocket connection token
   *
   * The token is short-lived and should be used immediately to establish
   * a WebSocket connection.
   *
   * @returns WebSocket token
   */
  async getWsToken(): Promise<ApiResponse<GetWsTokenResponse>> {
    return this.request({
      method: 'POST',
      path: '/v1/ws/token',
    });
  }
}

/**
 * Create a new AutomataClient instance
 *
 * @param baseUrl - API base URL
 * @returns New client instance
 */
export function createClient(baseUrl: string): AutomataClient {
  return new AutomataClient({ baseUrl });
}
