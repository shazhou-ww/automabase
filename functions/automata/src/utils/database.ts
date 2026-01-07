import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { TenantConfig } from '@automabase/automata-auth';

// Constants
export const TABLE_NAME = process.env.AUTOMATA_TABLE || 'automata';
export const TENANT_CONFIG_TABLE = process.env.TENANT_CONFIG_TABLE || 'tenant-config';
export const META_SK = '#META';
export const CONFIG_SK = '#CONFIG';
export const MAX_BATCH_SIZE = 100; // Maximum events per query
export const VERSION_ZERO = '000000'; // Initial version (6-digit base62, ~568 billion max)
export const TENANT_USER_INDEX = 'tenant-user-index'; // GSI for listing automata by tenant+user

// Tenant ID claim name from environment
export const TENANT_ID_CLAIM = process.env.TENANT_ID_CLAIM || 'tenant_id';

// Tenant config cache (in-memory, per Lambda instance)
const tenantConfigCache = new Map<string, { config: TenantConfig; expiresAt: number }>();
const TENANT_CONFIG_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// DynamoDB client - use local endpoint for SAM Local
const isLocal = process.env.AWS_SAM_LOCAL === 'true';
export const dynamoClient = new DynamoDBClient(
  isLocal ? { endpoint: 'http://host.docker.internal:8000' } : {}
);
export const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Get tenant configuration from DynamoDB with caching
 */
export async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  // Check cache first
  const cached = tenantConfigCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  // Fetch from DynamoDB
  const result = await docClient.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
    })
  );

  if (!result.Item) {
    return null;
  }

  const config: TenantConfig = {
    tenantId: result.Item.pk,
    jwksUri: result.Item.jwksUri,
    issuer: result.Item.issuer,
    audience: result.Item.audience,
    createdAt: result.Item.createdAt,
    updatedAt: result.Item.updatedAt,
  };

  // Cache the result
  tenantConfigCache.set(tenantId, {
    config,
    expiresAt: Date.now() + TENANT_CONFIG_CACHE_DURATION,
  });

  return config;
}