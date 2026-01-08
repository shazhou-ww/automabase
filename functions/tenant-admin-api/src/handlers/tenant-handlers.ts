/**
 * Tenant Admin Handlers
 * CRUD operations for tenant management
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getTenant,
  createTenant,
  updateTenant,
  generateTenantId,
  getDocClient,
  TABLE_NAME,
  tenantKeys,
  META_SK,
} from '@automabase/automata-core';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type {
  CreateTenantRequest,
  TenantStatus,
} from '@automabase/automata-core';
import type { PlatformAuthContext } from '@automabase/platform-auth';
import {
  ok,
  created,
  badRequest,
  notFound,
  conflict,
  internalError,
} from '../utils/response-helpers';

/**
 * POST /admin/tenants
 * Create a new tenant
 */
export async function handleCreateTenant(
  event: APIGatewayProxyEvent,
  _auth: PlatformAuthContext
): Promise<APIGatewayProxyResult> {
  // Parse request body
  if (!event.body) {
    return badRequest('Request body is required');
  }

  let body: Partial<CreateTenantRequest>;
  try {
    body = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    return badRequest('name is required and must be a string');
  }

  if (!body.jwksUri || typeof body.jwksUri !== 'string') {
    return badRequest('jwksUri is required and must be a string');
  }

  if (!body.ownerSubjectId || typeof body.ownerSubjectId !== 'string') {
    return badRequest('ownerSubjectId is required and must be a string');
  }

  // Validate jwksUri format
  try {
    new URL(body.jwksUri);
  } catch {
    return badRequest('jwksUri must be a valid URL');
  }

  // Generate tenant ID if not provided
  const tenantId = body.tenantId || generateTenantId();

  try {
    // Check if tenant already exists
    const existing = await getTenant(tenantId);
    if (existing) {
      return conflict(`Tenant with ID ${tenantId} already exists`);
    }

    // Create the tenant
    const request: CreateTenantRequest = {
      tenantId,
      name: body.name,
      jwksUri: body.jwksUri,
      ownerSubjectId: body.ownerSubjectId,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
    };

    const tenant = await createTenant(request);

    return created({
      tenantId: tenant.tenantId,
      name: tenant.name,
      jwksUri: tenant.jwksUri,
      ownerSubjectId: tenant.ownerSubjectId,
      status: tenant.status,
      createdAt: tenant.createdAt,
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    return internalError('Failed to create tenant');
  }
}

/**
 * GET /admin/tenants
 * List all tenants
 */
export async function handleListTenants(
  event: APIGatewayProxyEvent,
  _auth: PlatformAuthContext
): Promise<APIGatewayProxyResult> {
  // Note: In a full implementation, we would add pagination and use a GSI
  // For now, return a simple message indicating this needs to be implemented
  // with proper DynamoDB scan/query

  // TODO: Use these parameters when implementing proper listing with GSI
  // const limit = event.queryStringParameters?.limit
  //   ? Number.parseInt(event.queryStringParameters.limit, 10)
  //   : 100;
  // const cursor = event.queryStringParameters?.cursor;
  void event.queryStringParameters;

  // TODO: Implement proper listing with GSI
  // For now, return placeholder response
  return ok({
    tenants: [],
    nextCursor: null,
    message: 'Tenant listing requires GSI implementation',
  });
}

/**
 * GET /admin/tenants/{tenantId}
 * Get a specific tenant
 */
export async function handleGetTenant(
  event: APIGatewayProxyEvent,
  _auth: PlatformAuthContext
): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;

  if (!tenantId) {
    return badRequest('tenantId is required');
  }

  try {
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      return notFound(`Tenant ${tenantId} not found`);
    }

    return ok({
      tenantId: tenant.tenantId,
      name: tenant.name,
      jwksUri: tenant.jwksUri,
      ownerSubjectId: tenant.ownerSubjectId,
      contactName: tenant.contactName,
      contactEmail: tenant.contactEmail,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    });
  } catch (error) {
    console.error('Error getting tenant:', error);
    return internalError('Failed to get tenant');
  }
}

/**
 * PATCH /admin/tenants/{tenantId}
 * Update a tenant
 */
export async function handleUpdateTenant(
  event: APIGatewayProxyEvent,
  _auth: PlatformAuthContext
): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;

  if (!tenantId) {
    return badRequest('tenantId is required');
  }

  if (!event.body) {
    return badRequest('Request body is required');
  }

  let updates: {
    name?: string;
    contactName?: string;
    contactEmail?: string;
    jwksUri?: string;
  };

  try {
    updates = JSON.parse(event.body);
  } catch {
    return badRequest('Invalid JSON in request body');
  }

  // Validate allowed fields
  const allowedFields = ['name', 'contactName', 'contactEmail', 'jwksUri'];
  const providedFields = Object.keys(updates);
  const invalidFields = providedFields.filter((f) => !allowedFields.includes(f));

  if (invalidFields.length > 0) {
    return badRequest(
      `Invalid fields: ${invalidFields.join(', ')}. Allowed: ${allowedFields.join(', ')}`
    );
  }

  // Validate jwksUri if provided
  if (updates.jwksUri) {
    try {
      new URL(updates.jwksUri);
    } catch {
      return badRequest('jwksUri must be a valid URL');
    }
  }

  try {
    const result = await updateTenant(tenantId, updates);

    if (!result) {
      return notFound(`Tenant ${tenantId} not found`);
    }

    return ok({
      tenantId,
      updatedFields: result.updatedFields,
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    console.error('Error updating tenant:', error);
    return internalError('Failed to update tenant');
  }
}

/**
 * POST /admin/tenants/{tenantId}/suspend
 * Suspend a tenant
 */
export async function handleSuspendTenant(
  event: APIGatewayProxyEvent,
  _auth: PlatformAuthContext
): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;

  if (!tenantId) {
    return badRequest('tenantId is required');
  }

  try {
    // Get current tenant to check status
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      return notFound(`Tenant ${tenantId} not found`);
    }

    if (tenant.status === 'suspended') {
      return ok({
        tenantId,
        status: 'suspended',
        message: 'Tenant is already suspended',
      });
    }

    if (tenant.status === 'deleted') {
      return badRequest('Cannot suspend a deleted tenant');
    }

    // Update status to suspended
    // Note: We need to add a method to update status in automata-core
    // For now, we'll use a workaround through updateTenant if it supports status
    const result = await updateTenantStatus(tenantId, 'suspended');

    return ok({
      tenantId,
      status: 'suspended',
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    console.error('Error suspending tenant:', error);
    return internalError('Failed to suspend tenant');
  }
}

/**
 * POST /admin/tenants/{tenantId}/resume
 * Resume a suspended tenant
 */
export async function handleResumeTenant(
  event: APIGatewayProxyEvent,
  _auth: PlatformAuthContext
): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;

  if (!tenantId) {
    return badRequest('tenantId is required');
  }

  try {
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      return notFound(`Tenant ${tenantId} not found`);
    }

    if (tenant.status === 'active') {
      return ok({
        tenantId,
        status: 'active',
        message: 'Tenant is already active',
      });
    }

    if (tenant.status === 'deleted') {
      return badRequest('Cannot resume a deleted tenant');
    }

    const result = await updateTenantStatus(tenantId, 'active');

    return ok({
      tenantId,
      status: 'active',
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    console.error('Error resuming tenant:', error);
    return internalError('Failed to resume tenant');
  }
}

/**
 * DELETE /admin/tenants/{tenantId}
 * Delete a tenant (mark as deleted)
 */
export async function handleDeleteTenant(
  event: APIGatewayProxyEvent,
  _auth: PlatformAuthContext
): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;

  if (!tenantId) {
    return badRequest('tenantId is required');
  }

  try {
    const tenant = await getTenant(tenantId);

    if (!tenant) {
      return notFound(`Tenant ${tenantId} not found`);
    }

    if (tenant.status === 'deleted') {
      return ok({
        tenantId,
        status: 'deleted',
        message: 'Tenant is already deleted',
      });
    }

    const result = await updateTenantStatus(tenantId, 'deleted');

    return ok({
      tenantId,
      status: 'deleted',
      deletedAt: result.updatedAt,
    });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    return internalError('Failed to delete tenant');
  }
}

/**
 * Helper function to update tenant status
 */
async function updateTenantStatus(
  tenantId: string,
  status: TenantStatus
): Promise<{ updatedAt: string }> {
  const docClient = getDocClient();
  const keys = tenantKeys(tenantId);
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: keys.pk, sk: META_SK },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':now': now,
      },
      ConditionExpression: 'attribute_exists(pk)',
    })
  );

  return { updatedAt: now };
}

