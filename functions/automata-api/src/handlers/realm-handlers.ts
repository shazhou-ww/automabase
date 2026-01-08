/**
 * Realm API Handlers
 * Based on BUSINESS_MODEL_SPEC.md Section 5.3
 */

import type { ListRealmsResponse, RealmSummary } from '@automabase/automata-core';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AuthContext } from '../utils/auth-middleware';
import { forbidden, ok } from '../utils/response-helpers';

/**
 * GET /realms
 * List realms the user has access to
 *
 * Permission: At least one realm:*:read permission
 */
export async function handleListRealms(
  event: APIGatewayProxyEvent,
  auth: AuthContext
): Promise<APIGatewayProxyResult> {
  // Get all realm IDs the user has read access to
  const readableRealmIds = auth.permissions.getReadableRealmIds();

  if (readableRealmIds.length === 0) {
    return forbidden('No realm access permissions');
  }

  // Parse pagination params
  const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit ?? '100', 10), 1000);
  const cursor = event.queryStringParameters?.cursor;

  // Note: In a real implementation, we would query DynamoDB for realm summaries
  // For now, return the realm IDs with placeholder data
  // TODO: Implement proper realm summary aggregation

  let startIndex = 0;
  if (cursor) {
    try {
      startIndex = Number.parseInt(Buffer.from(cursor, 'base64').toString('utf-8'), 10);
    } catch {
      startIndex = 0;
    }
  }

  const paginatedRealmIds = readableRealmIds.slice(startIndex, startIndex + limit);
  const realms: RealmSummary[] = paginatedRealmIds.map((realmId) => ({
    realmId,
    automataCount: 0, // TODO: Aggregate from DynamoDB
    createdAt: new Date().toISOString(), // TODO: Get from first automata
  }));

  const response: ListRealmsResponse = {
    realms,
  };

  if (startIndex + limit < readableRealmIds.length) {
    response.nextCursor = Buffer.from((startIndex + limit).toString()).toString('base64');
  }

  return ok(response);
}
