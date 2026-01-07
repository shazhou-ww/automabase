/**
 * Automata Admin - Tenant management and platform administration
 *
 * This function handles:
 * - Tenant registration and configuration
 * - Tenant CRUD operations
 *
 * Note: In production, this API should be protected by API Key or admin authentication.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error } from './utils/response-helpers';
import {
  registerTenant,
  listTenants,
  getTenant,
  updateTenant,
  deleteTenant,
} from './handlers/tenant-handlers';

/**
 * Main handler - routes requests to appropriate handlers
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const method = event.httpMethod;
    const path = event.resource;

    // Tenant routes
    if (method === 'POST' && path === '/tenants') {
      return await registerTenant(event);
    }

    if (method === 'GET' && path === '/tenants') {
      return await listTenants(event);
    }

    if (method === 'GET' && path === '/tenants/{tenantId}') {
      return await getTenant(event);
    }

    if (method === 'PUT' && path === '/tenants/{tenantId}') {
      return await updateTenant(event);
    }

    if (method === 'DELETE' && path === '/tenants/{tenantId}') {
      return await deleteTenant(event);
    }

    return error(`Unknown route: ${method} ${path}`, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Handler error:', err);
    return error(message, 500);
  }
};
