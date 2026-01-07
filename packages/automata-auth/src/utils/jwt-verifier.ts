import * as jose from 'jose';
import type { JwtConfig, VerifiedToken } from '../types/auth-types';
import { AuthError } from '../errors/auth-error';
import { getJwks } from './jwks-cache';

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
 * Create a JWT verifier function with pre-configured settings
 * Useful for reusing configuration across multiple verifications
 */
export function createJwtVerifier(config: JwtConfig) {
  return (token: string) => verifyJwt(token, config);
}