/**
 * WebSocket authentication utilities
 */

import {
  type TenantConfig,
  type VerifiedAutomabaseToken,
  verifyAutomabaseJwtWithTenantLookup,
} from '@automabase/automata-auth';
import { getTenant, PermissionChecker } from '@automabase/automata-core';

/**
 * Get tenant configuration from DynamoDB
 */
async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return null;
  }

  return {
    tenantId: tenant.tenantId,
    jwksUri: tenant.jwksUri,
    issuer: tenant.tenantId,
    audience: process.env.JWT_AUDIENCE || 'automabase:api:prod',
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

/**
 * Verify JWT token from query string or header
 */
export async function verifyToken(
  token: string | undefined
): Promise<{ token: VerifiedAutomabaseToken; permissions: PermissionChecker } | null> {
  if (!token) {
    return null;
  }

  try {
    const verified = await verifyAutomabaseJwtWithTenantLookup(token, getTenantConfig);
    const permissions = new PermissionChecker(verified.scopes);

    return { token: verified, permissions };
  } catch {
    return null;
  }
}
