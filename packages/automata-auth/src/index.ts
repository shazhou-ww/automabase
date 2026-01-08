/**
 * Automata Auth - JWT verification utilities
 * Supports Auth0 and other OAuth providers using JWKS
 * Also supports Automabase native JWT format (Section 4.1 of BUSINESS_MODEL_SPEC.md)
 */

// Re-export error class
export { AuthError } from './errors/auth-error';
// Re-export all types
export type {
  // New Automabase types
  AutomabaseJwtClaims,
  JwtConfig,
  TenantConfig,
  TenantRegistrationRequest,
  VerifiedAutomabaseToken,
  VerifiedToken,
} from './types/auth-types';
// Re-export Automabase JWT verification functions
export {
  decodeAutomabaseToken,
  verifyAutomabaseJwt,
  verifyAutomabaseJwtWithTenantLookup,
} from './utils/automabase-jwt';
// Re-export descriptor signature functions and types
export {
  type AutomataDescriptor,
  computeDescriptorHash,
  createDescriptorSignature, // @deprecated - use signDescriptor() for production
  type DescriptorSignaturePayload,
  type DescriptorSignatureResult,
  signDescriptor,
  verifyDescriptorSignature,
} from './utils/descriptor-signature';

// Re-export JWKS cache utilities
export { clearJwksCache } from './utils/jwks-cache';
// Re-export JWT verification functions (legacy OAuth/Auth0 support)
export {
  createJwtVerifier,
  verifyJwt,
} from './utils/jwt-verifier';
// Re-export replay protection functions
export {
  validateRequestIdFormat,
  validateRequestTimestamp,
} from './utils/replay-protection';
// Re-export request signature verification functions
export {
  buildCanonicalRequest,
  extractSignedHeaders,
  verifyRequestSignature,
  verifyRequestSignatureFromEvent,
} from './utils/request-signature';
// Re-export signature middleware
export { verifyRequestSignatureAndReplay } from './utils/signature-middleware';
// Re-export token utilities
export {
  decodeTokenClaims,
  extractBearerToken,
  verifyJwtWithTenantConfig,
} from './utils/token-utils';
// Re-export validation functions
export {
  isValidUlid,
  validateJwksEndpoint,
  validateTenantRegistration,
} from './validators/tenant-validators';
