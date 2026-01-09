/**
 * Authentication middleware for tenant-api
 */

import {
  AuthError,
  extractBearerToken,
  type TenantConfig,
  type VerifiedAutomabaseToken,
  verifyAutomabaseJwtWithTenantLookup,
  verifyRequestSignatureAndReplay,
} from '@automabase/automata-auth';
import { getTenant, PermissionChecker } from '@automabase/automata-core';
import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Authentication context extracted from JWT
 */
export interface AuthContext {
  /** Verified token */
  token: VerifiedAutomabaseToken;
  /** Permission checker instance */
  permissions: PermissionChecker;
}

/**
 * Get tenant configuration from DynamoDB
 * Maps Tenant entity to TenantConfig for JWT verification
 */
async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return null;
  }

  // Map Tenant to TenantConfig
  // For Automabase tokens, issuer equals tenantId
  return {
    tenantId: tenant.tenantId,
    jwksUri: tenant.jwksUri,
    issuer: tenant.tenantId, // Automabase uses tenantId as issuer
    audience: process.env.JWT_AUDIENCE || 'automabase:api:prod',
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

/**
 * Extract and verify JWT from request
 * @returns AuthContext or null if authentication fails
 */
export async function authenticate(
  event: APIGatewayProxyEvent
): Promise<{ context: AuthContext } | { error: AuthError | Error }> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    return { error: new AuthError('Missing or invalid Authorization header', 'MISSING_TOKEN') };
  }

  try {
    const verified = await verifyAutomabaseJwtWithTenantLookup(token, getTenantConfig);

    // Verify request signature and replay protection (Phase 2)
    const signatureCheck = await verifyRequestSignatureAndReplay(event, verified);
    if (!signatureCheck.valid) {
      return {
        error:
          signatureCheck.error ||
          new AuthError('Signature verification failed', 'INVALID_SIGNATURE'),
      };
    }

    // Create permission checker with scopes from token
    const permissions = new PermissionChecker(verified.scopes);

    return {
      context: {
        token: verified,
        permissions,
      },
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err };
    }
    return { error: err as Error };
  }
}
