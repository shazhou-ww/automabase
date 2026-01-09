/**
 * Tenant Admin API - Platform management for Automabase
 *
 * This API provides administrative operations for managing tenants.
 * All endpoints require API Key authentication via X-Admin-Key header.
 *
 * Routes:
 * - POST   /admin/tenants              - Create a new tenant
 * - GET    /admin/tenants              - List all tenants
 * - GET    /admin/tenants/{tenantId}   - Get a specific tenant
 * - PATCH  /admin/tenants/{tenantId}   - Update a tenant
 * - POST   /admin/tenants/{tenantId}/suspend - Suspend a tenant
 * - POST   /admin/tenants/{tenantId}/resume  - Resume a tenant
 * - DELETE /admin/tenants/{tenantId}   - Delete a tenant
 */

import { authenticateRequest } from '@automabase/platform-auth';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  handleCreateTenant,
  handleDeleteTenant,
  handleGetTenant,
  handleListTenants,
  handleResumeTenant,
  handleSuspendTenant,
  handleUpdateTenant,
} from './handlers/tenant-handlers';
import { internalError, methodNotAllowed } from './utils/response-helpers';

/**
 * Main Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('[DEBUG] Request received:', {
    method: event.httpMethod,
    path: event.path,
    resource: event.resource,
    requestId: context.awsRequestId,
    headers: event.headers,
    hasAdminKey: !!event.headers?.['X-Admin-Key'] || !!event.headers?.['x-admin-key'],
    localAdminKeySet: !!process.env.LOCAL_ADMIN_API_KEY,
    localAdminKeyPrefix: process.env.LOCAL_ADMIN_API_KEY?.substring(0, 20) + '...',
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      },
      body: '',
    };
  }

  // Authenticate request using platform auth
  const authResult = await authenticateRequest(event, {
    secretName: process.env.ADMIN_API_KEY_SECRET || 'automabase/admin-api-key',
  });

  if (!authResult.authenticated) {
    return authResult.response;
  }

  const auth = authResult.context;
  const { httpMethod, resource } = event;

  try {
    // Route to appropriate handler
    if (resource === '/admin/tenants') {
      switch (httpMethod) {
        case 'POST':
          return await handleCreateTenant(event, auth);
        case 'GET':
          return await handleListTenants(event, auth);
        default:
          return methodNotAllowed(httpMethod);
      }
    }

    if (resource === '/admin/tenants/{tenantId}') {
      switch (httpMethod) {
        case 'GET':
          return await handleGetTenant(event, auth);
        case 'PATCH':
          return await handleUpdateTenant(event, auth);
        case 'DELETE':
          return await handleDeleteTenant(event, auth);
        default:
          return methodNotAllowed(httpMethod);
      }
    }

    if (resource === '/admin/tenants/{tenantId}/suspend') {
      if (httpMethod === 'POST') {
        return await handleSuspendTenant(event, auth);
      }
      return methodNotAllowed(httpMethod);
    }

    if (resource === '/admin/tenants/{tenantId}/resume') {
      if (httpMethod === 'POST') {
        return await handleResumeTenant(event, auth);
      }
      return methodNotAllowed(httpMethod);
    }

    return methodNotAllowed(httpMethod);
  } catch (error) {
    console.error('Unhandled error:', error);
    return internalError('Internal server error', context.awsRequestId);
  }
};
