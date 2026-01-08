/**
 * Tenant Repository - CRUD operations for Tenant entity
 */

import {
  GetCommand,
  type GetCommandInput,
  PutCommand,
  type PutCommandInput,
  UpdateCommand,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';

import type { CreateTenantRequest, Tenant, TenantStatus, UpdateTenantRequest } from '../types/tenant';
import { getDocClient } from './client';
import { TABLE_NAME } from './constants';
import { tenantKeys } from './keys';

/**
 * DynamoDB item structure for Tenant
 */
interface TenantItem {
  pk: string;
  sk: string;
  tenantId: string;
  ownerSubjectId: string;
  jwksUri: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert DynamoDB item to Tenant entity
 */
function itemToTenant(item: TenantItem): Tenant {
  return {
    tenantId: item.tenantId,
    ownerSubjectId: item.ownerSubjectId,
    jwksUri: item.jwksUri,
    name: item.name,
    contactName: item.contactName,
    contactEmail: item.contactEmail,
    status: item.status as Tenant['status'],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Get a tenant by ID
 */
export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const docClient = getDocClient();

  const params: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: tenantKeys(tenantId),
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return null;
  }

  return itemToTenant(result.Item as TenantItem);
}

/**
 * Generate a new tenant ID using ULID
 */
export function generateTenantId(): string {
  return ulid();
}

/**
 * Create a new tenant
 */
export async function createTenant(request: CreateTenantRequest): Promise<Tenant> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  const tenantId = request.tenantId || generateTenantId();
  const keys = tenantKeys(tenantId);

  const item: TenantItem = {
    ...keys,
    tenantId,
    name: request.name,
    jwksUri: request.jwksUri,
    ownerSubjectId: request.ownerSubjectId,
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const params: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: 'attribute_not_exists(pk)',
  };

  await docClient.send(new PutCommand(params));

  return itemToTenant(item);
}

/**
 * Update result type
 */
export interface UpdateTenantResult {
  updatedFields: string[];
  updatedAt: string;
}

/**
 * Update a tenant's properties
 */
export async function updateTenant(
  tenantId: string,
  updates: UpdateTenantRequest
): Promise<UpdateTenantResult | null> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  // Build update expression
  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionAttributeNames: Record<string, string> = {
    '#updatedAt': 'updatedAt',
  };
  const expressionAttributeValues: Record<string, string> = {
    ':updatedAt': now,
  };
  const updatedFields: string[] = [];

  if (updates.name !== undefined) {
    updateExpressions.push('#name = :name');
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeValues[':name'] = updates.name;
    updatedFields.push('name');
  }

  if (updates.contactName !== undefined) {
    updateExpressions.push('#contactName = :contactName');
    expressionAttributeNames['#contactName'] = 'contactName';
    expressionAttributeValues[':contactName'] = updates.contactName;
    updatedFields.push('contactName');
  }

  if (updates.contactEmail !== undefined) {
    updateExpressions.push('#contactEmail = :contactEmail');
    expressionAttributeNames['#contactEmail'] = 'contactEmail';
    expressionAttributeValues[':contactEmail'] = updates.contactEmail;
    updatedFields.push('contactEmail');
  }

  if (updates.jwksUri !== undefined) {
    updateExpressions.push('#jwksUri = :jwksUri');
    expressionAttributeNames['#jwksUri'] = 'jwksUri';
    expressionAttributeValues[':jwksUri'] = updates.jwksUri;
    updatedFields.push('jwksUri');
  }

  const params: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: tenantKeys(tenantId),
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: 'attribute_exists(pk)',
    ReturnValues: 'NONE',
  };

  try {
    await docClient.send(new UpdateCommand(params));
    return { updatedFields, updatedAt: now };
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return null;
    }
    throw error;
  }
}

/**
 * Update a tenant's status
 */
export async function updateTenantStatus(
  tenantId: string,
  status: TenantStatus
): Promise<UpdateTenantResult | null> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  const params: UpdateCommandInput = {
    TableName: TABLE_NAME,
    Key: tenantKeys(tenantId),
    UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':updatedAt': now,
    },
    ConditionExpression: 'attribute_exists(pk)',
    ReturnValues: 'NONE',
  };

  try {
    await docClient.send(new UpdateCommand(params));
    return { updatedFields: ['status'], updatedAt: now };
  } catch (error: unknown) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      return null;
    }
    throw error;
  }
}
