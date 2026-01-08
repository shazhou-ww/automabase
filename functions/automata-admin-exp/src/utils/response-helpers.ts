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

// Created response
export const created = (data?: unknown): APIGatewayProxyResult => ({
  statusCode: 201,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: true, ...(data !== undefined && { data }) }),
});

// Error response
export const error = (message: string, statusCode = 400): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ success: false, error: message }),
});

// Not found response
export const notFound = (message: string): APIGatewayProxyResult => error(message, 404);