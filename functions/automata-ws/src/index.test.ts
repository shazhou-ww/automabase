import { describe, it, expect } from 'vitest';
import { handler } from './index';
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

const createMockWebSocketEvent = (
  routeKey: string,
  overrides: Partial<APIGatewayProxyWebsocketEventV2> = {}
): APIGatewayProxyWebsocketEventV2 => ({
  requestContext: {
    routeKey,
    connectionId: 'test-connection-id',
    eventType: 'MESSAGE',
    extendedRequestId: 'test-extended-id',
    requestTime: new Date().toISOString(),
    messageDirection: 'IN',
    stage: 'prod',
    connectedAt: Date.now(),
    requestTimeEpoch: Date.now(),
    requestId: 'test-request-id',
    domainName: 'test.execute-api.us-east-1.amazonaws.com',
    apiId: 'test-api-id',
  },
  body: null,
  isBase64Encoded: false,
  ...overrides,
});

describe('automata-ws handler', () => {
  it('should handle $connect event', async () => {
    const event = createMockWebSocketEvent('$connect');

    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200, body: 'Connected' });
  });

  it('should handle $disconnect event', async () => {
    const event = createMockWebSocketEvent('$disconnect');

    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200, body: 'Disconnected' });
  });

  it('should return 501 for unimplemented routes', async () => {
    const event = createMockWebSocketEvent('subscribe', {
      body: JSON.stringify({ automataId: 'test-id' }),
    });

    const result = await handler(event);

    expect(result).toEqual({ statusCode: 501, body: 'Not implemented' });
  });
});
