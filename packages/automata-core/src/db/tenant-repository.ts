/**
 * Tenant Repository - Read operations for Tenant entity
 *
 * Write operations (create, update, status change) are in @automabase/tenant-admin
 */

import { GetCommand, type GetCommandInput } from '@aws-sdk/lib-dynamodb';

import type { Tenant } from '../types/tenant';
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
