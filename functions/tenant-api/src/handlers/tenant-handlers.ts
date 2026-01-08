/**
 * Tenant API Handlers
 * Based on BUSINESS_MODEL_SPEC.md Section 5.2
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTenant, updateTenant } from '@automabase/automata-core';
import type { TenantResponse, UpdateTenantRequest, UpdateTenantResponse } from '@automabase/automata-core';
import type { AuthContext } from '../utils/auth-middleware';
import { ok, badRequest, forbidden, notFound, internalError } from '../utils/response-helpers';

/**
 * GET /tenant
 * Read tenant information
 *
 * Permission: tenant:{id}:read or tenant:{id}:readwrite
 */
export async function handleGetTenant(
  _event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const { tenantId } = auth.token;

  // Check permission
  if (!auth.permissions.canReadTenant(tenantId)) {
    return forbidden('Insufficient permissions to read tenant');
  }

  try {
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      return notFound('Tenant not found');
    }

    // Build response (exclude sensitive/internal fields)
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

/**
 * PATCH /tenant
 * Update tenant information
 *
 * Permission: tenant:{id}:readwrite
 */
export async function handleUpdateTenant(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  const { tenantId } = auth.token;

  // Check permission
  if (!auth.permissions.canWriteTenant(tenantId)) {
    return forbidden('Insufficient permissions to update tenant');
  }

  // Parse request body
  let updates: UpdateTenantRequest;
  try {
    if (!event.body) {
      return badRequest('Request body is required');
    }
    updates = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate update fields
  const allowedFields = ['name', 'contactName', 'contactEmail'];
  const providedFields = Object.keys(updates);
  const invalidFields = providedFields.filter((f) => !allowedFields.includes(f));

  if (invalidFields.length > 0) {
    return badRequest(`Invalid fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}`);
  }

  // Validate field values
  if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.length === 0)) {
    return badRequest('name must be a non-empty string');
  }

  if (updates.contactName !== undefined && typeof updates.contactName !== 'string') {
    return badRequest('contactName must be a string');
  }

  if (updates.contactEmail !== undefined) {
    if (typeof updates.contactEmail !== 'string') {
      return badRequest('contactEmail must be a string');
    }
    // Basic email validation
    if (updates.contactEmail.length > 0 && !updates.contactEmail.includes('@')) {
      return badRequest('contactEmail must be a valid email address');
    }
  }

  try {
    const result = await updateTenant(tenantId, updates);

    if (!result) {
      return notFound('Tenant not found');
    }

    const response: UpdateTenantResponse = {
      updatedFields: result.updatedFields,
      updatedAt: result.updatedAt,
    };

    return ok(response);
  } catch (error) {
    console.error('Error updating tenant:', error);
    return internalError('Failed to update tenant');
  }
}
