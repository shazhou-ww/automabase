import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from './index';

const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'automata-api',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:automata-api',
  memoryLimitInMB: '512',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/automata-api',
  logStreamName: '2024/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

const createMockEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => ({
  httpMethod: 'GET',
  path: '/automatas',
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

describe('automata-api handler', () => {
  it('should return 400 for unknown routes', async () => {
    // /automatas without further path doesn't match any route
    const event = createMockEvent({ path: '/automatas', httpMethod: 'GET' });
    const context = createMockContext();

    const result = await handler(event, context);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('Unknown route');
  });
});
