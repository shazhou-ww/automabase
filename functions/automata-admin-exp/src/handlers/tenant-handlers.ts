import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  type TenantRegistrationRequest,
  validateTenantRegistration,
  validateJwksEndpoint,
  AuthError,
} from '@automabase/automata-auth';
import { success, created, error, notFound } from '../utils/response-helpers';

// Constants
const TENANT_CONFIG_TABLE = process.env.TENANT_CONFIG_TABLE || 'tenant-config';
const CONFIG_SK = '#CONFIG';
const MAX_BATCH_SIZE = 100;

// DynamoDB client
const isLocal = process.env.AWS_SAM_LOCAL === 'true';
const dynamoClient = new DynamoDBClient(
  isLocal ? { endpoint: 'http://host.docker.internal:8000' } : {}
);
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Register a new tenant
 * POST /tenants
 * Body: { tenantId: string, jwksUri: string, issuer: string, audience: string }
 */
export async function registerTenant(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return error('Request body is required');
  }

  let body: TenantRegistrationRequest;
  try {
    body = JSON.parse(event.body);
  } catch {
    return error('Invalid JSON body');
  }

  // Validate request
  const validationErrors = validateTenantRegistration(body);
  if (validationErrors.length > 0) {
    return error(validationErrors.join('; '));
  }

  // Check if tenant already exists
  const existingTenant = await docClient.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: body.tenantId, sk: CONFIG_SK },
    })
  );

  if (existingTenant.Item) {
    return error('Tenant already exists');
  }

  // Validate JWKS endpoint
  try {
    await validateJwksEndpoint(body.jwksUri);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return error(`JWKS validation failed: ${err.message}`);
    }
    return error('Failed to validate JWKS endpoint');
  }

  const now = new Date().toISOString();

  // Store tenant configuration
  await docClient.send(
    new PutCommand({
      TableName: TENANT_CONFIG_TABLE,
      Item: {
        pk: body.tenantId,
        sk: CONFIG_SK,
        jwksUri: body.jwksUri,
        issuer: body.issuer,
        audience: body.audience,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    })
  );

  return created({
    tenantId: body.tenantId,
    jwksUri: body.jwksUri,
    issuer: body.issuer,
    audience: body.audience,
    createdAt: now,
  });
}

/**
 * List all tenants
 * GET /tenants?limit={number}&cursor={lastEvaluatedKey}
 */
export async function listTenants(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const limitParam = event.queryStringParameters?.limit;
  const cursor = event.queryStringParameters?.cursor;
  const limit = Math.min(
    limitParam ? Number.parseInt(limitParam, 10) : MAX_BATCH_SIZE,
    MAX_BATCH_SIZE
  );

  if (Number.isNaN(limit) || limit < 1) {
    return error('Invalid limit parameter');
  }

  // Parse cursor if provided
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    } catch {
      return error('Invalid cursor');
    }
  }

  // Scan tenants (filter by sk = #CONFIG)
  const result = await docClient.send(
    new ScanCommand({
      TableName: TENANT_CONFIG_TABLE,
      FilterExpression: 'sk = :sk',
      ExpressionAttributeValues: { ':sk': CONFIG_SK },
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  const tenants = (result.Items || []).map((item) => ({
    tenantId: item.pk,
    jwksUri: item.jwksUri,
    issuer: item.issuer,
    audience: item.audience,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  // Build next cursor if there are more results
  let nextCursor: string | null = null;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return success({
    tenants,
    nextCursor,
  });
}

/**
 * Get tenant configuration
 * GET /tenants/{tenantId}
 */
export async function getTenant(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;
  if (!tenantId) {
    return error('tenantId is required');
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
    })
  );

  if (!result.Item) {
    return notFound('Tenant not found');
  }

  return success({
    tenantId: result.Item.pk,
    jwksUri: result.Item.jwksUri,
    issuer: result.Item.issuer,
    audience: result.Item.audience,
    createdAt: result.Item.createdAt,
    updatedAt: result.Item.updatedAt,
  });
}

/**
 * Update tenant configuration
 * PUT /tenants/{tenantId}
 * Body: { jwksUri?: string, issuer?: string, audience?: string }
 */
export async function updateTenant(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;
  if (!tenantId) {
    return error('tenantId is required');
  }

  if (!event.body) {
    return error('Request body is required');
  }

  let body: { jwksUri?: string; issuer?: string; audience?: string };
  try {
    body = JSON.parse(event.body);
  } catch {
    return error('Invalid JSON body');
  }

  // Check if tenant exists
  const existingResult = await docClient.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
    })
  );

  if (!existingResult.Item) {
    return notFound('Tenant not found');
  }

  // Build update expression
  const updateParts: string[] = [];
  const expressionValues: Record<string, unknown> = {};

  if (body.jwksUri) {
    // Validate new JWKS endpoint
    try {
      await validateJwksEndpoint(body.jwksUri);
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        return error(`JWKS validation failed: ${err.message}`);
      }
      return error('Failed to validate JWKS endpoint');
    }
    updateParts.push('jwksUri = :jwksUri');
    expressionValues[':jwksUri'] = body.jwksUri;
  }

  if (body.issuer) {
    updateParts.push('issuer = :issuer');
    expressionValues[':issuer'] = body.issuer;
  }

  if (body.audience) {
    updateParts.push('audience = :audience');
    expressionValues[':audience'] = body.audience;
  }

  if (updateParts.length === 0) {
    return error('No fields to update');
  }

  const now = new Date().toISOString();
  updateParts.push('updatedAt = :now');
  expressionValues[':now'] = now;

  await docClient.send(
    new UpdateCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
    })
  );

  // Return updated config
  const updatedResult = await docClient.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
    })
  );

  return success({
    tenantId: updatedResult.Item?.pk,
    jwksUri: updatedResult.Item?.jwksUri,
    issuer: updatedResult.Item?.issuer,
    audience: updatedResult.Item?.audience,
    createdAt: updatedResult.Item?.createdAt,
    updatedAt: updatedResult.Item?.updatedAt,
  });
}

/**
 * Delete a tenant
 * DELETE /tenants/{tenantId}
 */
export async function deleteTenant(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const tenantId = event.pathParameters?.tenantId;
  if (!tenantId) {
    return error('tenantId is required');
  }

  // Check if tenant exists
  const existingResult = await docClient.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
    })
  );

  if (!existingResult.Item) {
    return notFound('Tenant not found');
  }

  await docClient.send(
    new DeleteCommand({
      TableName: TENANT_CONFIG_TABLE,
      Key: { pk: tenantId, sk: CONFIG_SK },
    })
  );

  return success();
}