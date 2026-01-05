import { describe, it, expect } from 'vitest';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const createEvent = (body: unknown): APIGatewayProxyEvent => ({
  body: body ? JSON.stringify(body) : null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'POST',
  isBase64Encoded: false,
  path: '/jsonata-eval',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as APIGatewayProxyEvent['requestContext'],
  resource: ''
});

describe('jsonata-eval handler', () => {
  it('should return 400 when body is missing', async () => {
    const event = createEvent(null);
    event.body = null;

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'Request body is required' });
  });

  it('should return 400 when function is missing', async () => {
    const event = createEvent({ data: { a: 1 } });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: 'function is required' });
  });

  it('should evaluate simple JSONata expression', async () => {
    const event = createEvent({
      data: { name: 'John', age: 30 },
      function: 'name'
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: 'John' });
  });

  it('should evaluate JSONata expression with calculation', async () => {
    const event = createEvent({
      data: { prices: [10, 20, 30] },
      function: '$sum(prices)'
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: 60 });
  });

  it('should evaluate JSONata expression with transformation', async () => {
    const event = createEvent({
      data: { 
        users: [
          { name: 'Alice', score: 85 },
          { name: 'Bob', score: 92 }
        ]
      },
      function: 'users[score > 90].name'
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: 'Bob' });
  });

  it('should return 400 for invalid JSONata expression', async () => {
    const event = createEvent({
      data: { a: 1 },
      function: '$invalid('
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBeDefined();
  });

  it('should handle undefined result', async () => {
    const event = createEvent({
      data: { a: 1 },
      function: 'b'
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: undefined });
  });

  it('should handle complex JSONata transformations', async () => {
    const event = createEvent({
      data: {
        order: {
          items: [
            { product: 'A', qty: 2, price: 10 },
            { product: 'B', qty: 1, price: 25 }
          ]
        }
      },
      function: '$sum(order.items.(qty * price))'
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ data: 45 });
  });
});
