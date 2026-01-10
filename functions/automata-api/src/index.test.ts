import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from './index';

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test',
  logStreamName: '2024/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

function createEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test',
        userArn: null,
      },
      path: '/',
      stage: 'test',
      requestId: 'request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'resource-id',
      resourcePath: '/',
    },
    resource: '/',
    ...overrides,
  };
}

describe('handler', () => {
  it('should handle OPTIONS request (CORS)', async () => {
    const event = createEvent({
      httpMethod: 'OPTIONS',
      path: '/v1/accounts/me',
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers?.['Access-Control-Allow-Methods']).toContain('GET');
  });

  it('should return 404 for unknown routes', async () => {
    const event = createEvent({
      httpMethod: 'GET',
      path: '/v1/unknown',
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });

  it('should return 401 for missing auth header', async () => {
    const event = createEvent({
      httpMethod: 'GET',
      path: '/v1/accounts/me',
    });

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toContain('Authorization');
  });
});
