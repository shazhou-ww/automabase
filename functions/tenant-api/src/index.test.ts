import { describe, it, expect } from 'vitest';
import { handler } from './index';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

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
  it('should return 501 for GET /tenant', async () => {
    const event = createMockEvent({ httpMethod: 'GET' });
    const context = createMockContext();

    const result = await handler(event, context);

    expect(result.statusCode).toBe(501);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('GET /tenant');
  });

  it('should return 501 for PATCH /tenant', async () => {
    const event = createMockEvent({
      httpMethod: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    });
    const context = createMockContext();

    const result = await handler(event, context);

    expect(result.statusCode).toBe(501);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('PATCH /tenant');
  });

  it('should return 405 for unsupported methods', async () => {
    const event = createMockEvent({ httpMethod: 'DELETE' });
    const context = createMockContext();

    const result = await handler(event, context);

    expect(result.statusCode).toBe(405);
  });
});
