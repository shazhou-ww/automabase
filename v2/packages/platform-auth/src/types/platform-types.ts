/**
 * Platform Authentication Types
 * For Automabase admin APIs
 */

/**
 * Admin API Key stored in AWS Secrets Manager
 */
export interface AdminApiKeySecret {
  /** Public key identifier, used in X-Admin-Key header */
  keyId: string;
  /** Secret value, compared with request header */
  secret: string;
}

/**
 * Platform authentication context after successful authentication
 */
export interface PlatformAuthContext {
  /** Authentication type - extensible for future PaaS user accounts */
  type: 'api-key' | 'user-account';
  /** The authenticated key ID */
  keyId: string;
  /** Timestamp when authentication occurred */
  authenticatedAt: string;
}

/**
 * Platform authentication result
 */
export type PlatformAuthResult =
  | { success: true; context: PlatformAuthContext }
  | { success: false; error: PlatformAuthError };

/**
 * Platform authentication error
 */
export interface PlatformAuthError {
  code: PlatformAuthErrorCode;
  message: string;
}

/**
 * Platform authentication error codes
 */
export type PlatformAuthErrorCode =
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY_FORMAT'
  | 'INVALID_API_KEY'
  | 'SECRET_NOT_FOUND'
  | 'SECRET_FETCH_ERROR';

/**
 * Configuration for platform authentication
 */
export interface PlatformAuthConfig {
  /** AWS Secrets Manager secret name */
  secretName: string;
  /** AWS region (optional, uses default if not specified) */
  region?: string;
  /** Cache TTL in seconds (default: 300 = 5 minutes) */
  cacheTtlSeconds?: number;
}

/**
 * Platform auth provider interface for extensibility
 * Allows swapping API Key auth for user account auth in PaaS version
 */
export interface PlatformAuthProvider {
  /**
   * Authenticate a request
   * @param authHeader The X-Admin-Key or Authorization header value
   * @returns Authentication result
   */
  authenticate(authHeader: string | undefined): Promise<PlatformAuthResult>;

  /**
   * Invalidate cached credentials (for key rotation)
   */
  invalidateCache(): void;
}
