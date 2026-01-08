/**
 * Response helper utilities for Lambda API Gateway
 */

import type { APIGatewayProxyResult } from 'aws-lambda';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
};

/**
 * Create a success response (200 OK)
 */
export function ok<T>(body: T): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Create a created response (201 Created)
 */
export function created<T>(body: T): APIGatewayProxyResult {
  return {
    statusCode: 201,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify(body),
  };
}

/**
 * Create a no content response (204 No Content)
 */
export function noContent(): APIGatewayProxyResult {
  return {
    statusCode: 204,
    headers: CORS_HEADERS,
    body: '',
  };
}

/**
 * Create a bad request response (400 Bad Request)
 */
export function badRequest(message: string): APIGatewayProxyResult {
  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Bad Request',
      message,
    }),
  };
}

/**
 * Create a not found response (404 Not Found)
 */
export function notFound(message: string): APIGatewayProxyResult {
  return {
    statusCode: 404,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Not Found',
      message,
    }),
  };
}

/**
 * Create a conflict response (409 Conflict)
 */
export function conflict(message: string): APIGatewayProxyResult {
  return {
    statusCode: 409,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Conflict',
      message,
    }),
  };
}

/**
 * Create a method not allowed response (405 Method Not Allowed)
 */
export function methodNotAllowed(method: string): APIGatewayProxyResult {
  return {
    statusCode: 405,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Method Not Allowed',
      message: `Method ${method} not allowed`,
    }),
  };
}

/**
 * Create an internal error response (500 Internal Server Error)
 */
export function internalError(message: string, requestId?: string): APIGatewayProxyResult {
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Internal Server Error',
      message,
      ...(requestId ? { requestId } : {}),
    }),
  };
}

