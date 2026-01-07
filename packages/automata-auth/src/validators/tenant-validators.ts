import type { TenantRegistrationRequest } from '../types/auth-types';
import { AuthError } from '../errors/auth-error';

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