/**
 * Response helpers for Lambda API Gateway responses
 */

import type { APIGatewayProxyResult } from 'aws-lambda';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'Content-Type,Authorization,X-Request-Id,X-Request-Timestamp,X-Request-Signature',
};

/**
 * Create a successful JSON response
 */
export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Create a 200 OK response
 */
export function ok(body: unknown): APIGatewayProxyResult {
  return jsonResponse(200, body);
}

/**
 * Create a 201 Created response
 */
export function created(body: unknown): APIGatewayProxyResult {
  return jsonResponse(201, body);
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(message: string, details?: unknown): APIGatewayProxyResult {
  return jsonResponse(400, { error: 'Bad Request', message, details });
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorized(message = 'Unauthorized'): APIGatewayProxyResult {
  return jsonResponse(401, { error: 'Unauthorized', message });
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(message = 'Forbidden'): APIGatewayProxyResult {
  return jsonResponse(403, { error: 'Forbidden', message });
}

/**
 * Create a 404 Not Found response
 */
export function notFound(message = 'Not Found'): APIGatewayProxyResult {
  return jsonResponse(404, { error: 'Not Found', message });
}

/**
 * Create a 405 Method Not Allowed response
 */
export function methodNotAllowed(method: string): APIGatewayProxyResult {
  return jsonResponse(405, {
    error: 'Method Not Allowed',
    message: `Method ${method} not allowed`,
  });
}

/**
 * Create a 500 Internal Server Error response
 */
export function internalError(
  message = 'Internal Server Error',
  requestId?: string
): APIGatewayProxyResult {
  return jsonResponse(500, { error: 'Internal Server Error', message, requestId });
}
