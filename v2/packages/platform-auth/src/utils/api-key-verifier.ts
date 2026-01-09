/**
 * API Key verification utilities
 */

import { timingSafeEqual } from 'node:crypto';
import type {
  AdminApiKeySecret,
  PlatformAuthConfig,
  PlatformAuthContext,
  PlatformAuthProvider,
  PlatformAuthResult,
} from '../types/platform-types';
import { getAdminApiKey, invalidateSecretCache } from './secrets-manager';

/**
 * Default secret name for admin API key
 */
const DEFAULT_SECRET_NAME = 'automabase/admin-api-key';

/**
 * Parse API key from header value
 * Supports formats:
 * - "keyId:secret" (X-Admin-Key header)
 * - "AdminKey keyId:secret" (Authorization header)
 *
 * @param headerValue The header value
 * @returns Parsed key ID and secret, or null if invalid format
 */
export function parseApiKeyHeader(headerValue: string): { keyId: string; secret: string } | null {
  if (!headerValue) {
    return null;
  }

  let keyPart = headerValue;

  // Handle "AdminKey keyId:secret" format
  if (headerValue.startsWith('AdminKey ')) {
    keyPart = headerValue.slice(9); // Remove "AdminKey " prefix
  }

  // Parse "keyId:secret" format
  const colonIndex = keyPart.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }

  const keyId = keyPart.slice(0, colonIndex);
  const secret = keyPart.slice(colonIndex + 1);

  if (!keyId || !secret) {
    return null;
  }

  return { keyId, secret };
}

/**
 * Timing-safe string comparison
 * Prevents timing attacks by ensuring constant-time comparison
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  return timingSafeEqual(bufA, bufB);
}

/**
 * Get stored secret from environment variable (for local development)
 * Format: LOCAL_ADMIN_API_KEY=keyId:secret
 */
function getLocalAdminApiKey(): AdminApiKeySecret | null {
  const localKey = process.env.LOCAL_ADMIN_API_KEY;
  if (!localKey) {
    return null;
  }

  const colonIndex = localKey.indexOf(':');
  if (colonIndex === -1) {
    return null;
  }

  const keyId = localKey.slice(0, colonIndex);
  const secret = localKey.slice(colonIndex + 1);

  if (!keyId || !secret) {
    return null;
  }

  return { keyId, secret };
}

/**
 * Verify an API key against the stored secret
 *
 * @param authHeader The X-Admin-Key or Authorization header value
 * @param config Platform auth configuration
 * @returns Authentication result
 */
export async function verifyApiKey(
  authHeader: string | undefined,
  config: Partial<PlatformAuthConfig> = {}
): Promise<PlatformAuthResult> {
  const { secretName = DEFAULT_SECRET_NAME, region, cacheTtlSeconds } = config;

  // Check if header is provided
  if (!authHeader) {
    return {
      success: false,
      error: {
        code: 'MISSING_API_KEY',
        message: 'X-Admin-Key header is required',
      },
    };
  }

  // Parse the header
  const parsed = parseApiKeyHeader(authHeader);
  if (!parsed) {
    return {
      success: false,
      error: {
        code: 'INVALID_API_KEY_FORMAT',
        message: 'Invalid API key format. Expected: keyId:secret',
      },
    };
  }

  // Try local environment variable first (for development)
  const localSecret = getLocalAdminApiKey();
  if (localSecret) {
    const keyIdMatch = secureCompare(parsed.keyId, localSecret.keyId);
    const secretMatch = secureCompare(parsed.secret, localSecret.secret);

    if (keyIdMatch && secretMatch) {
      const context: PlatformAuthContext = {
        type: 'api-key',
        keyId: parsed.keyId,
        authenticatedAt: new Date().toISOString(),
      };
      return { success: true, context };
    }

    // If local key is set but doesn't match, still return invalid
    return {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    };
  }

  // Fetch the stored secret from Secrets Manager
  let storedSecret: AdminApiKeySecret;
  try {
    storedSecret = await getAdminApiKey(secretName, region, cacheTtlSeconds);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a "not found" error
    if (message.includes('ResourceNotFoundException') || message.includes('not found')) {
      return {
        success: false,
        error: {
          code: 'SECRET_NOT_FOUND',
          message: `Admin API key secret not found: ${secretName}`,
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'SECRET_FETCH_ERROR',
        message: `Failed to fetch admin API key: ${message}`,
      },
    };
  }

  // Verify key ID and secret
  const keyIdMatch = secureCompare(parsed.keyId, storedSecret.keyId);
  const secretMatch = secureCompare(parsed.secret, storedSecret.secret);

  if (!keyIdMatch || !secretMatch) {
    return {
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    };
  }

  // Success
  const context: PlatformAuthContext = {
    type: 'api-key',
    keyId: parsed.keyId,
    authenticatedAt: new Date().toISOString(),
  };

  return { success: true, context };
}

/**
 * Create an API Key auth provider
 * Implements PlatformAuthProvider interface for extensibility
 *
 * @param config Platform auth configuration
 * @returns Platform auth provider
 */
export function createApiKeyAuthProvider(
  config: Partial<PlatformAuthConfig> = {}
): PlatformAuthProvider {
  return {
    async authenticate(authHeader: string | undefined): Promise<PlatformAuthResult> {
      return verifyApiKey(authHeader, config);
    },

    invalidateCache(): void {
      invalidateSecretCache();
    },
  };
}
