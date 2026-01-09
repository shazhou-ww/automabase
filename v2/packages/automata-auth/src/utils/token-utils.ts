import * as jose from 'jose';
import { AuthError } from '../errors/auth-error';
import type { JwtConfig, TenantConfig, VerifiedToken } from '../types/auth-types';
import { verifyJwt } from './jwt-verifier';

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
