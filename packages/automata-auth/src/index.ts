/**
 * Automata Auth - JWT verification utilities
 * Supports Auth0 and other OAuth providers using JWKS
 * Also supports Automabase native JWT format (Section 4.1 of BUSINESS_MODEL_SPEC.md)
 */

// Re-export all types
export type {
  JwtConfig,
  TenantConfig,
  TenantRegistrationRequest,
  VerifiedToken,
  // New Automabase types
  AutomabaseJwtClaims,
  VerifiedAutomabaseToken,
} from './types/auth-types';

// Re-export error class
export { AuthError } from './errors/auth-error';

// Re-export JWT verification functions (legacy OAuth/Auth0 support)
export {
  verifyJwt,
  createJwtVerifier,
} from './utils/jwt-verifier';

// Re-export Automabase JWT verification functions
export {
  decodeAutomabaseToken,
  verifyAutomabaseJwt,
  verifyAutomabaseJwtWithTenantLookup,
} from './utils/automabase-jwt';

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

// Re-export descriptor signature functions and types
export {
  verifyDescriptorSignature,
  computeDescriptorHash,
  signDescriptor,
  createDescriptorSignature, // @deprecated - use signDescriptor() for production
  type AutomataDescriptor,
  type DescriptorSignaturePayload,
  type DescriptorSignatureResult,
} from './utils/descriptor-signature';

// Re-export request signature verification functions
export {
  buildCanonicalRequest,
  extractSignedHeaders,
  verifyRequestSignature,
  verifyRequestSignatureFromEvent,
} from './utils/request-signature';

// Re-export replay protection functions
export {
  validateRequestTimestamp,
  validateRequestIdFormat,
} from './utils/replay-protection';

// Re-export signature middleware
export {
  verifyRequestSignatureAndReplay,
} from './utils/signature-middleware';