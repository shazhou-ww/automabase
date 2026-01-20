/**
 * Automata API Client
 *
 * A type-safe, immutable client for interacting with the Automabase API.
 * Uses functional programming patterns with immutable state.
 * Uses CryptoProvider for cryptographic operations.
 */

import { generateRequestId, generateRequestTimestamp, signRequest } from './signing';
import type {
  ApiResponse,
  ArchiveAutomataResponse,
  ClientConfig,
  CreateAccountResponse,
  CreateAutomataResponse,
  CryptoProvider,
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
  TokenProvider,
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
 * Immutable Automata API Client State
 */
export interface AutomataClientState {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly token?: string;
  readonly tokenProvider?: TokenProvider;
  readonly cryptoProvider: CryptoProvider;
  readonly accountId: string;
}

/**
 * Automata API Client
 *
 * Provides methods for interacting with all Automabase API endpoints.
 * All methods return new client instances (immutable), except for API call methods.
 *
 * Keys are automatically managed in IndexedDB - no need to manually handle key generation or storage.
 *
 * @example
 * ```typescript
 * import { createClient } from '@automabase/automata-client';
 *
 * const client = await createClient({
 *   baseUrl: 'https://api.automabase.io',
 *   accountId: 'acc_123',
 *   token: jwtToken,
 *   onDeviceReady: async (publicKey, deviceName) => {
 *     // Register device with server
 *     await fetch('/api/devices', {
 *       method: 'POST',
 *       body: JSON.stringify({ publicKey, deviceName }),
 *     });
 *   },
 * });
 *
 * // Client is ready to use with keys automatically loaded/created
 * const automata = await client.createAutomata(myBlueprint);
 * ```
 */
export class AutomataClient {
  private readonly state: AutomataClientState;

  /**
   * Create a new AutomataClient instance
   *
   * @param state - Client state (internal use)
   * @internal
   */
  constructor(state: AutomataClientState) {
    this.state = state;
  }

  /**
   * Create a new client instance with updated token
   *
   * @param token - JWT token (with or without 'Bearer ' prefix)
   * @returns New client instance with updated token
   */
  withToken(token: string): AutomataClient {
    return new AutomataClient({
      baseUrl: this.state.baseUrl,
      timeout: this.state.timeout,
      token,
      tokenProvider: this.state.tokenProvider,
      cryptoProvider: this.state.cryptoProvider,
      accountId: this.state.accountId,
    });
  }

  /**
   * Create a new client instance with token provider
   *
   * @param tokenProvider - Function that returns a promise resolving to a token
   * @returns New client instance with token provider
   */
  withTokenProvider(tokenProvider: TokenProvider): AutomataClient {
    return new AutomataClient({
      baseUrl: this.state.baseUrl,
      timeout: this.state.timeout,
      token: this.state.token,
      tokenProvider,
      cryptoProvider: this.state.cryptoProvider,
      accountId: this.state.accountId,
    });
  }

  /**
   * Get the current authentication token
   */
  getToken(): string | undefined {
    return this.state.token;
  }

  /**
   * Get the current account ID
   */
  getAccountId(): string {
    return this.state.accountId;
  }

  /**
   * Get the current token, refreshing if a token provider is available
   *
   * @returns Current or refreshed token
   */
  private async getTokenAsync(): Promise<string | undefined> {
    if (this.state.token) {
      return this.state.token;
    }
    if (this.state.tokenProvider) {
      return await this.state.tokenProvider();
    }
    return undefined;
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

    const url = `${this.state.baseUrl}${path}`;
    const bodyStr = body ? JSON.stringify(body) : undefined;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Host: new URL(this.state.baseUrl).host,
      ...customHeaders,
    };

    // Add auth token (use provided token, or get from state/provider)
    let authToken = token;
    if (!authToken) {
      authToken = await this.getTokenAsync();
    }
    if (authToken) {
      headers.Authorization = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
    }

    // Add request ID and timestamp for write operations
    const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isWriteOperation) {
      headers['X-Request-Id'] = generateRequestId();
      headers['X-Request-Timestamp'] = generateRequestTimestamp();

      // Sign request using CryptoProvider
      if (!skipSignature) {
        headers['X-Signature'] = await signRequest(
          method,
          path,
          headers,
          bodyStr,
          this.state.accountId,
          this.state.cryptoProvider
        );
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.state.timeout);

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
   * @param options.publicKey - ECDSA P-256 public key (Base64URL encoded) for device registration
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
   * @param publicKey - ECDSA P-256 public key (Base64URL encoded)
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
    return accountId || this.state.accountId;
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
 * Get default device name based on browser environment
 */
function getDefaultDeviceName(): string {
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome Browser';
    if (ua.includes('Firefox')) return 'Firefox Browser';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari Browser';
    if (ua.includes('Edge')) return 'Edge Browser';
    return 'Browser';
  }
  return 'Unknown Device';
}

/**
 * Create a new AutomataClient instance with automatic key management
 *
 * This function:
 * 1. Ensures a key pair exists for the account (using CryptoProvider)
 * 2. Calls onDeviceReady callback if a new key was created
 *
 * @param config - Client configuration (accountId and cryptoProvider are required)
 * @returns Promise resolving to a new client instance
 */
export async function createClient(config: ClientConfig): Promise<AutomataClient> {
  if (!config.accountId) {
    throw new Error('accountId is required in ClientConfig');
  }
  if (!config.cryptoProvider) {
    throw new Error('cryptoProvider is required in ClientConfig');
  }

  const baseUrl = config.baseUrl.replace(/\/$/, '');
  const timeout = config.timeout ?? DEFAULT_CONFIG.timeout ?? 30000;

  // Determine if a key already exists for this account.
  // By contract, CryptoProvider.getPublicKey throws if the key pair doesn't exist.
  let hadExistingKey = true;
  try {
    await config.cryptoProvider.getPublicKey(config.accountId);
  } catch {
    hadExistingKey = false;
  }

  // Ensure key pair exists (will load existing or create new)
  const publicKey = await config.cryptoProvider.ensureKeyPair(config.accountId);

  // Only call onDeviceReady when we actually created a new key pair.
  if (config.onDeviceReady && !hadExistingKey) {
    const deviceName = config.deviceName || getDefaultDeviceName();
    await config.onDeviceReady(publicKey, deviceName);
  }

  return new AutomataClient({
    baseUrl,
    timeout,
    token: config.token,
    tokenProvider: config.tokenProvider,
    cryptoProvider: config.cryptoProvider,
    accountId: config.accountId,
  });
}
