/**
 * Tenant Repository - DynamoDB operations for Tenant entity
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type GetCommandInput,
  type PutCommandInput,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { ulid } from 'ulid';

import type { Tenant, CreateTenantRequest, UpdateTenantRequest } from '../types/tenant';
import { getDocClient } from './client';
import { TABLE_NAME, META_SK } from './constants';
import { tenantKeys, tenantPK } from './keys';

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
 * Create a new tenant
 */
export async function createTenant(request: CreateTenantRequest): Promise<Tenant> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  const item: TenantItem = {
    pk: tenantPK(request.tenantId),
    sk: META_SK,
    tenantId: request.tenantId,
    ownerSubjectId: request.ownerSubjectId,
    jwksUri: request.jwksUri,
    name: request.name,
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

  try {
    await docClient.send(new PutCommand(params));
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new Error(`Tenant with ID ${request.tenantId} already exists`);
    }
    throw error;
  }

  return itemToTenant(item);
}

/**
 * Update a tenant
 * @returns Updated fields and timestamp, or null if tenant not found
 */
export async function updateTenant(
  tenantId: string,
  updates: UpdateTenantRequest
): Promise<{ updatedFields: string[]; updatedAt: string } | null> {
  const docClient = getDocClient();
  const now = new Date().toISOString();

  // Build update expression dynamically
  const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
  const expressionAttributeNames: Record<string, string> = {
    '#updatedAt': 'updatedAt',
  };
  const expressionAttributeValues: Record<string, unknown> = {
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

  if (updatedFields.length === 0) {
    // No fields to update
    return { updatedFields: [], updatedAt: now };
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
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return null; // Tenant not found
    }
    throw error;
  }
}

/**
 * Generate a new tenant ID (ULID)
 */
export function generateTenantId(): string {
  return ulid();
}
