/**
 * JWT Types for Automabase
 * Based on BUSINESS_MODEL_SPEC.md Section 4.1
 */

/**
 * JWT Claims structure for Automabase tokens
 */
export interface AutomabaseJwtPayload {
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
 * Verified token result with extracted permissions
 */
export interface VerifiedAutomabaseToken {
  /** Tenant ID (from iss claim) */
  tenantId: string;
  /** Subject ID (from sub claim) */
  subjectId: string;
  /** Session Public Key (from spk claim) */
  sessionPublicKey: string;
  /** Permission scopes */
  scopes: string[];
  /** Raw JWT payload */
  payload: AutomabaseJwtPayload;
}

/**
 * Request context extracted from JWT and headers
 */
export interface RequestContext {
  /** Tenant ID */
  tenantId: string;
  /** Subject ID */
  subjectId: string;
  /** Permission scopes */
  scopes: string[];
  /** Request ID (from X-Request-Id header) */
  requestId: string;
  /** Request timestamp (from X-Request-Timestamp header) */
  requestTimestamp: string;
}
