/**
 * Tenant API Lambda Handler
 *
 * Provides read-only access to tenant information for authenticated users.
 * Tenant updates are handled by tenant-admin-api.
 *
 * Routes:
 * - GET /tenant - Read tenant info (any authenticated user)
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AuthError } from '@automabase/automata-auth';
import { authenticate } from './utils/auth-middleware';
import { handleGetTenant } from './handlers/tenant-handlers';
import { unauthorized, methodNotAllowed, internalError } from './utils/response-helpers';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Request:', {
    method: event.httpMethod,
    path: event.path,
    requestId: context.awsRequestId,
  });

  const { httpMethod } = event;

  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id,X-Request-Timestamp,X-Request-Signature',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
      },
      body: '',
    };
  }

  // Only GET method is allowed
  if (httpMethod !== 'GET') {
    return methodNotAllowed(httpMethod);
  }

  // Authenticate request
  const authResult = await authenticate(event);

  if ('error' in authResult) {
    const error = authResult.error;
    console.error('Authentication failed:', error.message);

    if (error instanceof AuthError) {
      return unauthorized(error.message);
    }
    return internalError('Authentication failed', context.awsRequestId);
  }

  const auth = authResult.context;

  try {
    return await handleGetTenant(event, auth);
  } catch (error) {
    console.error('Unhandled error:', error);
    return internalError('Internal server error', context.awsRequestId);
  }
};
