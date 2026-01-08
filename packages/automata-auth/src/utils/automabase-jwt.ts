/**
 * Automabase JWT Verification Utilities
 * Based on BUSINESS_MODEL_SPEC.md Section 4.1
 */

import * as jose from 'jose';
import { AuthError } from '../errors/auth-error';
import type {
  AutomabaseJwtClaims,
  TenantConfig,
  VerifiedAutomabaseToken,
} from '../types/auth-types';
import { getJwks } from './jwks-cache';

/**
 * Decode an Automabase JWT without verification to extract the issuer (tenantId)
 * Used to look up tenant config before full verification
 */
export function decodeAutomabaseToken(token: string): {
  tenantId: string;
  subjectId: string;
} | null {
  try {
    const decoded = jose.decodeJwt(token) as Partial<AutomabaseJwtClaims>;

    if (!decoded.iss || !decoded.sub) {
      return null;
    }

    return {
      tenantId: decoded.iss,
      subjectId: decoded.sub,
    };
  } catch {
    return null;
  }
}

/**
 * Verify an Automabase JWT and extract claims
 *
 * @param token - JWT token string (without 'Bearer ' prefix)
 * @param tenantConfig - Tenant configuration for verification
 * @returns Verified token with tenantId, subjectId, scopes, and sessionPublicKey
 * @throws AuthError if verification fails
 */
export async function verifyAutomabaseJwt(
  token: string,
  tenantConfig: TenantConfig
): Promise<VerifiedAutomabaseToken> {
  try {
    const jwks = getJwks({
      jwksUri: tenantConfig.jwksUri,
      issuer: tenantConfig.issuer,
      audience: tenantConfig.audience,
    });

    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: tenantConfig.issuer,
      audience: tenantConfig.audience,
    });

    const claims = payload as unknown as AutomabaseJwtClaims;

    // Validate required claims
    if (!claims.sub) {
      throw new AuthError('Missing sub claim in token', 'MISSING_CLAIMS');
    }

    if (!claims.scope || !Array.isArray(claims.scope)) {
      throw new AuthError('Missing or invalid scope claim in token', 'MISSING_CLAIMS');
    }

    if (!claims.spk) {
      throw new AuthError('Missing spk (session public key) claim in token', 'MISSING_CLAIMS');
    }

    return {
      tenantId: claims.iss,
      subjectId: claims.sub,
      sessionPublicKey: claims.spk,
      scopes: claims.scope,
      payload: claims,
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
 * Verify an Automabase JWT with dynamic tenant configuration lookup
 *
 * @param token - JWT token string (without 'Bearer ' prefix)
 * @param getTenantConfig - Function to get tenant config by tenantId
 * @returns Verified token with tenantId, subjectId, scopes, and sessionPublicKey
 * @throws AuthError if verification fails
 */
export async function verifyAutomabaseJwtWithTenantLookup(
  token: string,
  getTenantConfig: (tenantId: string) => Promise<TenantConfig | null>
): Promise<VerifiedAutomabaseToken> {
  // First decode the token to get tenantId (without verification)
  const decoded = decodeAutomabaseToken(token);
  if (!decoded) {
    throw new AuthError('Invalid token format or missing required claims', 'INVALID_TOKEN');
  }

  // Look up tenant configuration
  const tenantConfig = await getTenantConfig(decoded.tenantId);
  if (!tenantConfig) {
    throw new AuthError(`Unknown tenant: ${decoded.tenantId}`, 'INVALID_TOKEN');
  }

  // Verify with full validation
  return verifyAutomabaseJwt(token, tenantConfig);
}
