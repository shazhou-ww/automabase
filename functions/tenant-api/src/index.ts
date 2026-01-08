import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AuthError } from '@automabase/automata-auth';
import { authenticate } from './utils/auth-middleware';
import { handleGetTenant, handleUpdateTenant } from './handlers/tenant-handlers';
import { unauthorized, methodNotAllowed, internalError } from './utils/response-helpers';

/**
 * Tenant API Lambda Handler
 *
 * Routes:
 * - GET /tenant - Read tenant info
 * - PATCH /tenant - Update tenant info
 */
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
    switch (httpMethod) {
      case 'GET':
        return await handleGetTenant(event, auth);

      case 'PATCH':
        return await handleUpdateTenant(event, auth);

      default:
        return methodNotAllowed(httpMethod);
    }
  } catch (error) {
    console.error('Unhandled error:', error);
    return internalError('Internal server error', context.awsRequestId);
  }
};
