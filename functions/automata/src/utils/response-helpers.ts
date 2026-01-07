import type { APIGatewayProxyResult } from 'aws-lambda';

/**
 * Response helper functions for API Gateway responses
 */

// Success response
export const success = (data?: unknown): APIGatewayProxyResult => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: true, ...(data !== undefined && { data }) }),
});

// Error response
export const error = (message: string): APIGatewayProxyResult => ({
  statusCode: 400,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: message }),
});

// Response helpers for auth errors
export const unauthorized = (message: string): APIGatewayProxyResult => ({
  statusCode: 401,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: message }),
});

export const forbidden = (message: string): APIGatewayProxyResult => ({
  statusCode: 403,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: message }),
});