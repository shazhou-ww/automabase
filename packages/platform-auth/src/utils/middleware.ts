/**
 * Lambda middleware for platform authentication
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { PlatformAuthConfig, PlatformAuthContext } from '../types/platform-types';
import { verifyApiKey } from './api-key-verifier';

/**
 * Authentication result for middleware
 */
export type AuthMiddlewareResult =
  | { authenticated: true; context: PlatformAuthContext }
  | { authenticated: false; response: APIGatewayProxyResult };

/**
 * Extract API key header from Lambda event
 * Checks both X-Admin-Key and Authorization headers
 */
export function extractApiKeyHeader(event: APIGatewayProxyEvent): string | undefined {
  const headers = event.headers || {};

  // Case-insensitive header lookup
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      normalizedHeaders[key.toLowerCase()] = value;
    }
  }

  // Check X-Admin-Key first
  if (normalizedHeaders['x-admin-key']) {
    return normalizedHeaders['x-admin-key'];
  }

  // Check Authorization header with AdminKey scheme
  const authHeader = normalizedHeaders.authorization;
  if (authHeader?.startsWith('AdminKey ')) {
    return authHeader;
  }

  return undefined;
}

/**
 * Create an unauthorized response
 */
function unauthorizedResponse(message: string): APIGatewayProxyResult {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'AdminKey',
    },
    body: JSON.stringify({
      error: 'Unauthorized',
      message,
    }),
  };
}

/**
 * Create an internal error response
 */
function internalErrorResponse(message: string): APIGatewayProxyResult {
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: 'Internal Server Error',
      message,
    }),
  };
}

/**
 * Authenticate a Lambda API Gateway event
 *
 * @param event API Gateway event
 * @param config Platform auth configuration
 * @returns Authentication result with context or error response
 */
export async function authenticateRequest(
  event: APIGatewayProxyEvent,
  config: Partial<PlatformAuthConfig> = {}
): Promise<AuthMiddlewareResult> {
  const apiKeyHeader = extractApiKeyHeader(event);

  const result = await verifyApiKey(apiKeyHeader, config);

  if (result.success) {
    return {
      authenticated: true,
      context: result.context,
    };
  }

  // Map error codes to responses
  switch (result.error.code) {
    case 'MISSING_API_KEY':
    case 'INVALID_API_KEY_FORMAT':
    case 'INVALID_API_KEY':
      return {
        authenticated: false,
        response: unauthorizedResponse(result.error.message),
      };

    case 'SECRET_NOT_FOUND':
    case 'SECRET_FETCH_ERROR':
      console.error('Platform auth error:', result.error);
      return {
        authenticated: false,
        response: internalErrorResponse('Authentication service unavailable'),
      };

    default:
      return {
        authenticated: false,
        response: internalErrorResponse('Unknown authentication error'),
      };
  }
}

/**
 * Create a middleware wrapper for Lambda handlers
 *
 * @param config Platform auth configuration
 * @returns Middleware function
 */
export function createPlatformAuthMiddleware(config: Partial<PlatformAuthConfig> = {}) {
  return function withPlatformAuth<T extends APIGatewayProxyResult>(
    handler: (event: APIGatewayProxyEvent, context: PlatformAuthContext) => Promise<T>
  ) {
    return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const authResult = await authenticateRequest(event, config);

      if (!authResult.authenticated) {
        return authResult.response;
      }

      return handler(event, authResult.context);
    };
  };
}
