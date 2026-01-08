/**
 * Tenant API Handlers
 * Simplified to read-only public access for authenticated users
 *
 * Note: Tenant updates are now handled by tenant-admin-api
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTenant } from '@automabase/automata-core';
import type { TenantResponse } from '@automabase/automata-core';
import type { AuthContext } from '../utils/auth-middleware';
import { ok, notFound, internalError } from '../utils/response-helpers';

/**
 * GET /tenant
 * Read tenant information
 *
 * Any authenticated user (with valid JWT) can read their own tenant info.
 * No special permission scope required.
 */
export async function handleGetTenant(
  _event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const { tenantId } = auth.token;

  try {
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      return notFound('Tenant not found');
    }

    // Build response with public tenant information
    const response: TenantResponse = {
      tenantId: tenant.tenantId,
      name: tenant.name,
      contactName: tenant.contactName,
      contactEmail: tenant.contactEmail,
      status: tenant.status,
      jwksUri: tenant.jwksUri,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };

    return ok(response);
  } catch (error) {
    console.error('Error getting tenant:', error);
    return internalError('Failed to get tenant');
  }
}
