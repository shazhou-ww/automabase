/**
 * Automata Client Types
 *
 * Type definitions for API requests and responses
 */

// ============================================================================
// Common Types
// ============================================================================

/** OAuth Provider types */
export type OAuthProvider = 'google' | 'github' | 'cognito';

/** Account status */
export type AccountStatus = 'active' | 'suspended' | 'deleted';

/** Automata status */
export type AutomataStatus = 'active' | 'archived';

// ============================================================================
// Account Types
// ============================================================================

/**
 * Account entity
 */
export interface Account {
  /** Account ID (ULID) */
  accountId: string;

  /** OAuth Provider's subject claim */
  oauthSubject: string;

  /** OAuth Provider identifier */
  oauthProvider: OAuthProvider;

  /** Display name */
  displayName: string;

  /** Email address */
  email?: string;

  /** Avatar URL */
  avatarUrl?: string;

  /** Account status */
  status: AccountStatus;

  /** Creation timestamp (ISO8601) */
  createdAt: string;

  /** Last update timestamp (ISO8601) */
  updatedAt: string;
}

// ============================================================================
// Device Types
// ============================================================================

/** Device status */
export type DeviceStatus = 'active' | 'revoked';

/** Device type */
export type DeviceType = 'browser' | 'mobile' | 'desktop' | 'server' | 'other';

/**
 * Device entity (represents a client with ECDSA P-256 keypair)
 */
export interface Device {
  /** Device ID (ULID) */
  deviceId: string;

  /** Owner Account ID */
  accountId: string;

  /** ECDSA P-256 public key, Base64URL encoded (raw format) */
  publicKey: string;

  /** Device name (user-defined) */
  deviceName: string;

  /** Device type */
  deviceType?: DeviceType;

  /** Device status */
  status: DeviceStatus;

  /** Last active timestamp (ISO8601) */
  lastActiveAt: string;

  /** Creation timestamp (ISO8601) */
  createdAt: string;

  /** Last update timestamp (ISO8601) */
  updatedAt: string;
}

// ============================================================================
// Automata Types
// ============================================================================

/**
 * Automata entity (state machine instance)
 */
export interface Automata {
  /** Automata ID (ULID format) */
  automataId: string;

  /** Owner Account ID */
  ownerAccountId: string;

  /** Blueprint identifier: {appId}:{name}:{hash} */
  blueprintId: string;

  /** App ID extracted from blueprintId */
  appId: string;

  /** Current state */
  currentState: unknown;

  /** Current version (6-char Base62) */
  version: string;

  /** Automata status */
  status: AutomataStatus;

  /** Creation timestamp (ISO8601) */
  createdAt: string;

  /** Last update timestamp (ISO8601) */
  updatedAt: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Automata Event entity as returned from API
 */
export interface AutomataEvent {
  /** Event ID ({automataId}:{baseVersion}) */
  eventId: string;

  /** Base version (6-char Base62) */
  baseVersion: string;

  /** Event type */
  eventType: string;

  /** Event payload data */
  eventData: unknown;

  /** Sender Account ID */
  senderAccountId: string;

  /** Event timestamp (ISO8601) */
  timestamp: string;
}

// ============================================================================
// API Request Types
// ============================================================================

/** HTTP methods supported by the API */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Request options for API calls
 */
export interface RequestOptions {
  /** HTTP method */
  method: HttpMethod;

  /** Request path (e.g., '/v1/accounts/me') */
  path: string;

  /** Request body (will be JSON serialized) */
  body?: unknown;

  /** Override auth token for this request */
  token?: string;

  /** Additional headers */
  headers?: Record<string, string>;

  /** Skip request signing (for read operations) */
  skipSignature?: boolean;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T = unknown> {
  /** HTTP status code */
  status: number;

  /** Response data */
  data: T;

  /** Response headers */
  headers: Headers;
}

// ============================================================================
// API Response Types
// ============================================================================

/** GET /v1/accounts/me response */
export interface GetMeResponse {
  registered: boolean;
  account?: Account;
  cognitoUser?: {
    sub: string;
    email?: string;
    name?: string;
  };
}

/** POST /v1/accounts response */
export interface CreateAccountResponse {
  account: Account;
  device: Device | null;
  isNew: boolean;
}

/** PATCH /v1/accounts/me response */
export interface UpdateAccountResponse {
  account: Account;
}

/** GET /v1/accounts/:accountId response */
export interface GetAccountResponse {
  account: Account;
}

/** GET /v1/accounts/me/devices response */
export interface ListDevicesResponse {
  devices: Device[];
}

/** POST /v1/accounts/me/devices response */
export interface RegisterDeviceResponse {
  device: Device;
}

/** DELETE /v1/accounts/me/devices/:deviceId response */
export interface RevokeDeviceResponse {
  device: Device;
}

/** POST /v1/accounts/:accountId/automatas response */
export interface CreateAutomataResponse {
  automataId: string;
  blueprintId: string;
  currentState: unknown;
  version: string;
  createdAt: string;
}

/** GET /v1/accounts/:accountId/automatas response */
export interface ListAutomatasResponse {
  automatas: Automata[];
  nextCursor?: string;
}

/** GET /v1/accounts/:accountId/automatas/:automataId response */
export interface GetAutomataResponse {
  automataId: string;
  ownerAccountId: string;
  blueprintId: string;
  blueprint: unknown | null;
  currentState: unknown;
  version: string;
  status: AutomataStatus;
  createdAt: string;
  updatedAt: string;
}

/** GET /v1/accounts/:accountId/automatas/:automataId/state response */
export interface GetAutomataStateResponse {
  currentState: unknown;
  version: string;
  status: AutomataStatus;
}

/** POST /v1/accounts/:accountId/automatas/:automataId/archive response */
export interface ArchiveAutomataResponse {
  automataId: string;
  status: AutomataStatus;
  updatedAt: string;
}

/** POST /v1/accounts/:accountId/automatas/:automataId/unarchive response */
export interface UnarchiveAutomataResponse {
  automataId: string;
  status: AutomataStatus;
  updatedAt: string;
}

/** POST /v1/accounts/:accountId/automatas/:automataId/events response */
export interface SendEventResponse {
  eventId: string;
  baseVersion: string;
  newVersion: string;
  newState: unknown;
  timestamp: string;
}

/** GET /v1/accounts/:accountId/automatas/:automataId/events response */
export interface ListEventsResponse {
  events: AutomataEvent[];
  nextAnchor?: string;
}

/** GET /v1/accounts/:accountId/automatas/:automataId/events/:version response */
export type GetEventResponse = AutomataEvent;

/** POST /v1/ws/token response */
export interface GetWsTokenResponse {
  token: string;
}

/** API Error response */
export interface ApiErrorResponse {
  error: string;
  code?: string;
}

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Token provider function for automatic token refresh
 *
 * @returns Promise resolving to a JWT token (with or without 'Bearer ' prefix)
 */
export type TokenProvider = () => Promise<string>;

/**
 * Callback function called when a new device key pair is created
 *
 * This is called after a new key pair is generated and stored.
 * Use this to register the device with the server.
 *
 * @param publicKey - Base64URL-encoded public key
 * @param deviceName - Suggested device name (can be customized)
 * @returns Promise that resolves when device registration is complete
 */
export type OnDeviceReady = (publicKey: string, deviceName: string) => Promise<void>;

/**
 * CryptoProvider interface for cryptographic operations
 *
 * Provides methods for:
 * - Getting public key for an account
 * - Signing data for an account
 * - Verifying signatures
 */
export interface CryptoProvider {
  /**
   * Get the public key for an account
   *
   * @param accountId - Account ID
   * @returns Base64URL-encoded public key
   * @throws Error if account has no key pair
   */
  getPublicKey(accountId: string): Promise<string>;

  /**
   * Sign JSON data for an account
   *
   * @param accountId - Account ID
   * @param data - JSON data to sign (will be stringified and hashed)
   * @returns Base64URL-encoded signature
   * @throws Error if account has no key pair
   */
  sign(accountId: string, data: unknown): Promise<string>;

  /**
   * Verify a signature for JSON data
   *
   * @param accountId - Account ID
   * @param data - JSON data that was signed
   * @param signature - Base64URL-encoded signature to verify
   * @returns True if signature is valid
   */
  verify(accountId: string, data: unknown, signature: string): Promise<boolean>;

  /**
   * Ensure a key pair exists for an account
   *
   * If no key pair exists, generates and stores a new one.
   * Returns the public key.
   *
   * @param accountId - Account ID
   * @returns Base64URL-encoded public key
   */
  ensureKeyPair(accountId: string): Promise<string>;
}

/**
 * Client configuration options
 */
export interface ClientConfig {
  /** API base URL (e.g., 'http://localhost:3201' or 'https://api.automabase.io') */
  baseUrl: string;

  /** Account ID (required) - used to identify and load/store keys */
  accountId: string;

  /**
   * CryptoProvider for cryptographic operations
   *
   * Use @automabase/crypto-provider-browser for browser environments
   * Use @automabase/crypto-provider-nodejs for Node.js environments
   */
  cryptoProvider: CryptoProvider;

  /** Default timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** JWT token (with or without 'Bearer ' prefix) */
  token?: string;

  /** Token provider function for automatic token refresh */
  tokenProvider?: TokenProvider;

  /**
   * Callback called when a new device key pair is created
   *
   * This is called after a new key pair is generated and stored.
   * Use this to register the device with the server using the public key.
   */
  onDeviceReady?: OnDeviceReady;

  /**
   * Device name for new device registration
   *
   * Used when calling onDeviceReady callback.
   * Defaults to a browser-detected name or 'Unknown Device'.
   */
  deviceName?: string;
}

/**
 * List automatas options
 */
export interface ListAutomatasOptions {
  /** Maximum number of items to return */
  limit?: number;

  /** Pagination cursor from previous response */
  cursor?: string;

  /** Override account ID for this request */
  accountId?: string;
}

/**
 * List events options
 */
export interface ListEventsOptions {
  /** Query direction: 'forward' (old to new) or 'backward' (new to old) */
  direction?: 'forward' | 'backward';

  /** Start from this version anchor */
  anchor?: string;

  /** Maximum number of items to return */
  limit?: number;

  /** Override account ID for this request */
  accountId?: string;
}
