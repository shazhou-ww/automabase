import type * as jose from 'jose';

/**
 * Configuration for JWT verification
 */
export interface JwtConfig {
  /** JWKS URI for fetching public keys (e.g., https://your-tenant.auth0.com/.well-known/jwks.json) */
  jwksUri: string;
  /** Expected issuer (e.g., https://your-tenant.auth0.com/) - for Automabase, this is the tenantId */
  issuer: string;
  /** Expected audience (your API identifier, e.g., "automabase:api:prod") */
  audience: string;
  /** Claim name for tenant ID (default: 'iss' for Automabase, 'tenant_id' for legacy) */
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
  /** Expected issuer URL - for Automabase tokens, this equals tenantId */
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
 * @deprecated Use VerifiedAutomabaseToken for new code
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
 * Automabase JWT Claims structure
 * Based on BUSINESS_MODEL_SPEC.md Section 4.1
 */
export interface AutomabaseJwtClaims {
  /** Issuer - Tenant ID */
  iss: string;
  /** Subject ID = SHA256(Subject Public Key) */
  sub: string;
  /** Audience (e.g., "automabase:api:prod") */
  aud: string | string[];
  /** Expiration time (Unix timestamp) */
  exp: number;
  /** Issued at time (Unix timestamp) */
  iat: number;
  /** Permission scopes array */
  scope: string[];
  /** Session Public Key (Ed25519, 32 bytes, Base64URL encoded) */
  spk: string;
}

/**
 * Verified Automabase token with extracted permissions
 */
export interface VerifiedAutomabaseToken {
  /** Tenant ID (from iss claim) */
  tenantId: string;
  /** Subject ID (from sub claim) */
  subjectId: string;
  /** Session Public Key (from spk claim, Base64URL encoded) */
  sessionPublicKey: string;
  /** Permission scopes */
  scopes: string[];
  /** Raw JWT payload */
  payload: AutomabaseJwtClaims;
}