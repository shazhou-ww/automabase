import type * as jose from 'jose';

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