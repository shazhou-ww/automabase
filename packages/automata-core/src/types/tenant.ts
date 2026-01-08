/**
 * Tenant Entity Types
 * Based on BUSINESS_MODEL_SPEC.md Section 2.1
 */

/**
 * Tenant status enum
 */
export type TenantStatus = 'active' | 'suspended' | 'deleted';

/**
 * Tenant entity - the authorization principal (Issuer)
 * Manages keys and signs JWTs
 */
export interface Tenant {
  // === Immutable Properties ===
  /** Primary key, tenant unique identifier (ULID format) */
  tenantId: string;
  /** Owner Subject ID = SHA256(OwnerPubKey) */
  ownerSubjectId: string;
  /** JWKS endpoint URL for fetching public keys to verify JWT and descriptor signatures */
  jwksUri: string;
  /** Creation timestamp (ISO8601) */
  createdAt: string;

  // === Mutable Properties ===
  /** Tenant name */
  name: string;
  /** Contact person name */
  contactName?: string;
  /** Contact email */
  contactEmail?: string;
  /** Tenant status */
  status: TenantStatus;
  /** Last update timestamp (ISO8601) */
  updatedAt: string;
}

/**
 * Tenant creation request
 */
export interface CreateTenantRequest {
  /** Tenant ID (ULID format, 26 characters) */
  tenantId: string;
  /** Owner Subject ID = SHA256(OwnerPubKey) */
  ownerSubjectId: string;
  /** JWKS endpoint URL */
  jwksUri: string;
  /** Tenant name */
  name: string;
  /** Contact person name */
  contactName?: string;
  /** Contact email */
  contactEmail?: string;
}

/**
 * Tenant update request (PATCH /tenant)
 */
export interface UpdateTenantRequest {
  /** Tenant name */
  name?: string;
  /** Contact person name */
  contactName?: string;
  /** Contact email */
  contactEmail?: string;
}

/**
 * Tenant read response (GET /tenant)
 */
export interface TenantResponse {
  tenantId: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  status: TenantStatus;
  jwksUri: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tenant update response
 */
export interface UpdateTenantResponse {
  updatedFields: string[];
  updatedAt: string;
}
