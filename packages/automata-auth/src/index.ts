/**
 * Automata Auth - JWT verification utilities
 * Supports Auth0 and other OAuth providers using JWKS
 */

import * as jose from 'jose';

/**
 * Configuration for JWT verification
 */
export interface JwtConfig {
  /** JWKS URI for fetching public keys (e.g., https://your-tenant.auth0.com/.well-known/jwks.json) */
  jwksUri: string;
  /** Expected issuer (e.g., https://your-tenant.auth0.com/) */
  issuer: string;
  /** Expected audience (your API identifier) */
  audience: string;
  /** Claim name for tenant ID (default: 'tenant_id') */
  tenantIdClaim?: string;
  /** Cache duration for JWKS in milliseconds (default: 600000 = 10 minutes) */
  jwksCacheDuration?: number;
}

/**
 * Verified JWT payload with user and tenant information
 */
export interface VerifiedToken {
  /** User ID (from 'sub' claim) */
  userId: string;
  /** Tenant ID (from configured claim) */
  tenantId: string;
  /** Raw JWT payload */
  payload: jose.JWTPayload;
}

/**
 * Authentication error
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_CLAIMS' | 'JWKS_ERROR'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// JWKS cache per URI
const jwksCache = new Map<string, { jwks: jose.JWTVerifyGetKey; expiresAt: number }>();

/**
 * Get or create JWKS remote key set with caching
 */
function getJwks(config: JwtConfig): jose.JWTVerifyGetKey {
  const cacheKey = config.jwksUri;
  const cacheDuration = config.jwksCacheDuration ?? 600000; // 10 minutes default
  const now = Date.now();

  const cached = jwksCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.jwks;
  }

  const jwks = jose.createRemoteJWKSet(new URL(config.jwksUri));
  jwksCache.set(cacheKey, { jwks, expiresAt: now + cacheDuration });
  return jwks;
}

/**
 * Verify a JWT token and extract user/tenant information
 *
 * @param token - JWT token string (without 'Bearer ' prefix)
 * @param config - JWT verification configuration
 * @returns Verified token with userId and tenantId
 * @throws AuthError if verification fails
 */
export async function verifyJwt(token: string, config: JwtConfig): Promise<VerifiedToken> {
  const tenantIdClaim = config.tenantIdClaim ?? 'tenant_id';

  try {
    const jwks = getJwks(config);

    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
    });

    // Extract user ID from 'sub' claim
    const userId = payload.sub;
    if (!userId) {
      throw new AuthError('Missing sub claim in token', 'MISSING_CLAIMS');
    }

    // Extract tenant ID from configured claim
    const tenantId = payload[tenantIdClaim] as string | undefined;
    if (!tenantId) {
      throw new AuthError(`Missing ${tenantIdClaim} claim in token`, 'MISSING_CLAIMS');
    }

    return {
      userId,
      tenantId,
      payload,
    };
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }

    if (err instanceof jose.errors.JWTExpired) {
      throw new AuthError('Token has expired', 'EXPIRED_TOKEN');
    }

    if (err instanceof jose.errors.JWTClaimValidationFailed) {
      throw new AuthError(`Token validation failed: ${err.message}`, 'INVALID_TOKEN');
    }

    if (err instanceof jose.errors.JWKSNoMatchingKey) {
      throw new AuthError('No matching key found in JWKS', 'JWKS_ERROR');
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new AuthError(`Token verification failed: ${message}`, 'INVALID_TOKEN');
  }
}

/**
 * Extract Bearer token from Authorization header
 *
 * @param authHeader - Authorization header value (e.g., "Bearer xxx")
 * @returns Token string or null if not present/invalid
 */
export function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Create a JWT verifier function with pre-configured settings
 * Useful for reusing configuration across multiple verifications
 */
export function createJwtVerifier(config: JwtConfig) {
  return (token: string) => verifyJwt(token, config);
}

/**
 * Clear the JWKS cache (useful for testing or key rotation)
 */
export function clearJwksCache(): void {
  jwksCache.clear();
}
