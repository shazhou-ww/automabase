import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from './index';

describe('handler', () => {
  it('should return 400 when connectionId is missing', async () => {
    const event = {
      requestContext: {
        // missing connectionId
        routeKey: '$default',
      },
    } as unknown as APIGatewayProxyEvent;
    const context = {
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
    } as Context;

    const result = await handler(event, context);

    expect(result.statusCode).toBe(400);
    expect(result.body).toContain('Missing connectionId');
  });

  it('should reject $connect without token', async () => {
    process.env.WEBSOCKET_API_ENDPOINT = 'http://localhost:3001';

    const event = {
      requestContext: {
        connectionId: 'test-conn',
        routeKey: '$connect',
        domainName: 'localhost:3001',
        stage: 'local',
      },
      queryStringParameters: {},
      isBase64Encoded: false,
    } as unknown as APIGatewayProxyEvent;

    const context = {
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
    } as Context;

    const result = await handler(event, context);

    expect(result.statusCode).toBe(401);
    expect(result.body).toContain('Missing token');
  });
});
