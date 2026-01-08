import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { VerifiedToken } from '@automabase/automata-auth';
import { verifyJwtWithTenantConfig, extractBearerToken, AuthError } from '@automabase/automata-auth';
import { getTenantConfig, docClient, TABLE_NAME, META_SK } from '../utils/database';
import { unauthorized, forbidden, error } from '../utils/response-helpers';
import type { AutomataMeta } from '../types/automata-types';
import { TENANT_ID_CLAIM } from '../utils/database';

/**
 * Verify JWT from Authorization header using dynamic tenant config
 */
export async function verifyAuth(event: APIGatewayProxyEvent): Promise<VerifiedToken | APIGatewayProxyResult> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    return unauthorized('Missing or invalid Authorization header');
  }

  try {
    return await verifyJwtWithTenantConfig(token, getTenantConfig, TENANT_ID_CLAIM);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return unauthorized(err.message);
    }
    return unauthorized('Token verification failed');
  }
}

/**
 * Check if auth result is an error response
 */
export function isAuthError(result: VerifiedToken | APIGatewayProxyResult): result is APIGatewayProxyResult {
  return 'statusCode' in result;
}

/**
 * Verify tenant & user authorization for automata access
 * - Validates that the automata belongs to the same tenant
 * - Validates that the user is the owner of the automata
 * 
 * @param meta - Automata metadata to verify
 * @param auth - Verified JWT token with tenant and user information
 * @returns Error response if authorization fails, null if authorized
 */
export function verifyOwnership(
  meta: AutomataMeta,
  auth: VerifiedToken
): APIGatewayProxyResult | null {
  if (meta.tenantId !== auth.tenantId) {
    return forbidden('Access denied: tenant mismatch');
  }
  if (meta.userId !== auth.userId) {
    return forbidden('Access denied: not the owner');
  }
  return null; // No error, authorization verified
}

/**
 * Get automata by ID and verify tenant & user authorization
 * This helper ensures all read/write operations verify:
 * 1. JWT token is valid (tenant config verified)
 * 2. Tenant ID matches
 * 3. User ID matches (user is the owner)
 * 
 * @param automataId - ID of the automata to retrieve
 * @param auth - Verified JWT token with tenant and user information
 * @returns Automata metadata if authorized, error response otherwise
 */
export async function getAutomataWithAuth(
  automataId: string,
  auth: VerifiedToken
): Promise<AutomataMeta | APIGatewayProxyResult> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: automataId, sk: META_SK },
    })
  );

  if (!result.Item) {
    return error('Automata not found');
  }

  const meta = result.Item as AutomataMeta;
  const ownershipError = verifyOwnership(meta, auth);
  if (ownershipError) {
    return ownershipError;
  }

  return meta;
}

/**
 * Check if result is an error response
 */
export function isErrorResponse(result: AutomataMeta | APIGatewayProxyResult): result is APIGatewayProxyResult {
  return 'statusCode' in result;
}