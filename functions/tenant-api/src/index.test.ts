import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from './index';

const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'tenant-api',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:tenant-api',
  memoryLimitInMB: '512',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/tenant-api',
  logStreamName: '2024/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

const createMockEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => ({
  httpMethod: 'GET',
  path: '/tenant',
  pathParameters: null,
  queryStringParameters: null,
  headers: {},
  body: null,
  isBase64Encoded: false,
  multiValueHeaders: {},
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as APIGatewayProxyEvent['requestContext'],
  resource: '',
  ...overrides,
});

describe('tenant-api handler', () => {
  it('should return 401 for GET /tenant without authorization', async () => {
    const event = createMockEvent({ httpMethod: 'GET' });
    const context = createMockContext();

    const result = await handler(event, context);

    // Without authorization header, should return 401
    expect(result.statusCode).toBe(401);
  });

  it('should return 405 for PATCH /tenant (moved to admin API)', async () => {
    const event = createMockEvent({
      httpMethod: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    });
    const context = createMockContext();

    const result = await handler(event, context);

    // PATCH is no longer supported - use admin API instead
    expect(result.statusCode).toBe(405);
  });

  it('should return 405 for unsupported methods', async () => {
    const event = createMockEvent({ httpMethod: 'DELETE' });
    const context = createMockContext();

    const result = await handler(event, context);

    expect(result.statusCode).toBe(405);
  });

  it('should return 200 for OPTIONS (CORS preflight)', async () => {
    const event = createMockEvent({ httpMethod: 'OPTIONS' });
    const context = createMockContext();

    const result = await handler(event, context);

    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });
});
