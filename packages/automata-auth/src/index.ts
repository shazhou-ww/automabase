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
 * Tenant configuration stored in DynamoDB
 */
export interface TenantConfig {
  /** Tenant ID (ULID format) */
  tenantId: string;
  /** JWKS URI for fetching public keys */
  jwksUri: string;
  /** Expected issuer URL */
  issuer: string;
  /** Expected audience */
  audience: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Tenant registration request
 */
export interface TenantRegistrationRequest {
  /** Tenant ID (ULID format, 26 characters) */
  tenantId: string;
  /** JWKS URI for fetching public keys */
  jwksUri: string;
  /** Issuer URL */
  issuer: string;
  /** Expected audience */
  audience: string;
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

/**
 * Decode JWT token without verification to extract claims
 * Useful for getting tenant_id before full verification
 *
 * @param token - JWT token string
 * @param tenantIdClaim - Claim name for tenant ID (default: 'tenant_id')
 * @returns Object with userId and tenantId, or null if invalid
 */
export function decodeTokenClaims(
  token: string,
  tenantIdClaim = 'tenant_id'
): { userId: string; tenantId: string } | null {
  try {
    const decoded = jose.decodeJwt(token);
    const userId = decoded.sub;
    const tenantId = decoded[tenantIdClaim] as string | undefined;

    if (!userId || !tenantId) {
      return null;
    }

    return { userId, tenantId };
  } catch {
    return null;
  }
}

/**
 * Verify JWT with dynamic tenant configuration
 * First decodes the token to get tenant_id, then uses provided config getter
 *
 * @param token - JWT token string
 * @param getTenantConfig - Function to get tenant config by tenantId
 * @param tenantIdClaim - Claim name for tenant ID (default: 'tenant_id')
 * @returns Verified token with userId and tenantId
 * @throws AuthError if verification fails
 */
export async function verifyJwtWithTenantConfig(
  token: string,
  getTenantConfig: (tenantId: string) => Promise<TenantConfig | null>,
  tenantIdClaim = 'tenant_id'
): Promise<VerifiedToken> {
  // First decode the token to get tenant_id (without verification)
  const claims = decodeTokenClaims(token, tenantIdClaim);
  if (!claims) {
    throw new AuthError('Invalid token format or missing required claims', 'INVALID_TOKEN');
  }

  // Get tenant configuration
  const tenantConfig = await getTenantConfig(claims.tenantId);
  if (!tenantConfig) {
    throw new AuthError(`Unknown tenant: ${claims.tenantId}`, 'INVALID_TOKEN');
  }

  // Build JWT config from tenant config
  const jwtConfig: JwtConfig = {
    jwksUri: tenantConfig.jwksUri,
    issuer: tenantConfig.issuer,
    audience: tenantConfig.audience,
    tenantIdClaim,
  };

  // Verify with full validation
  return verifyJwt(token, jwtConfig);
}

/**
 * Validate ULID format
 * ULID is 26 characters, base32 encoded (0-9, A-Z excluding I, L, O, U)
 */
export function isValidUlid(str: string): boolean {
  if (str.length !== 26) {
    return false;
  }
  // ULID uses Crockford's Base32: 0-9 and A-Z excluding I, L, O, U
  const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  return ulidRegex.test(str);
}

/**
 * Validate a tenant registration request
 * @param request - The registration request to validate
 * @returns Array of validation errors, empty if valid
 */
export function validateTenantRegistration(request: TenantRegistrationRequest): string[] {
  const errors: string[] = [];

  // Validate tenantId (ULID format)
  if (!request.tenantId) {
    errors.push('tenantId is required');
  } else if (!isValidUlid(request.tenantId)) {
    errors.push('tenantId must be a valid ULID (26 characters)');
  }

  // Validate jwksUri
  if (!request.jwksUri) {
    errors.push('jwksUri is required');
  } else {
    try {
      const url = new URL(request.jwksUri);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('jwksUri must use http or https protocol');
      }
    } catch {
      errors.push('jwksUri must be a valid URL');
    }
  }

  // Validate issuer
  if (!request.issuer) {
    errors.push('issuer is required');
  } else {
    try {
      new URL(request.issuer);
    } catch {
      errors.push('issuer must be a valid URL');
    }
  }

  // Validate audience
  if (!request.audience) {
    errors.push('audience is required');
  }

  return errors;
}

/**
 * Fetch and validate JWKS from a URI
 * @param jwksUri - The JWKS endpoint URL
 * @returns true if valid, throws AuthError otherwise
 */
export async function validateJwksEndpoint(jwksUri: string): Promise<boolean> {
  try {
    const response = await fetch(jwksUri);
    if (!response.ok) {
      throw new AuthError(
        `JWKS endpoint returned status ${response.status}`,
        'JWKS_ERROR'
      );
    }

    const jwks = await response.json() as { keys?: unknown[] };
    if (!jwks.keys || !Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      throw new AuthError('JWKS must contain at least one key', 'JWKS_ERROR');
    }

    // Validate at least one key is RSA for signing
    const hasValidKey = jwks.keys.some((key: unknown) => {
      const k = key as Record<string, unknown>;
      return k.kty === 'RSA' && k.use === 'sig' && k.alg === 'RS256';
    });

    if (!hasValidKey) {
      throw new AuthError(
        'JWKS must contain at least one RSA key for RS256 signing',
        'JWKS_ERROR'
      );
    }

    return true;
  } catch (err) {
    if (err instanceof AuthError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new AuthError(`Failed to fetch JWKS: ${message}`, 'JWKS_ERROR');
  }
}
