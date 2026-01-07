/**
 * Automata Auth - JWT verification utilities
 * Supports Auth0 and other OAuth providers using JWKS
 */

// Re-export all types
export type {
  JwtConfig,
  TenantConfig,
  TenantRegistrationRequest,
  VerifiedToken,
} from './types/auth-types';

// Re-export error class
export { AuthError } from './errors/auth-error';

// Re-export JWT verification functions
export {
  verifyJwt,
  createJwtVerifier,
} from './utils/jwt-verifier';

// Re-export JWKS cache utilities
export { clearJwksCache } from './utils/jwks-cache';

// Re-export token utilities
export {
  extractBearerToken,
  decodeTokenClaims,
  verifyJwtWithTenantConfig,
} from './utils/token-utils';

// Re-export validation functions
export {
  isValidUlid,
  validateTenantRegistration,
  validateJwksEndpoint,
} from './validators/tenant-validators';
