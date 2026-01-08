import { describe, it, expect } from 'vitest';
import { handler } from './index';
import type { APIGatewayProxyEvent } from 'aws-lambda';

describe('handler', () => {
  it('should return 401 for missing authorization', async () => {
    const event = {
      httpMethod: 'GET',
      resource: '/automata',
      headers: {},
      queryStringParameters: null,
      pathParameters: null,
      body: null,
    } as unknown as APIGatewayProxyEvent;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Authorization');
  });
});

