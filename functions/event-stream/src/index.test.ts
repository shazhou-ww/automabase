import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Create mock using vi.hoisted
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

// Mock DynamoDB
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: mockSend }),
  },
  PutCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Put' })),
  GetCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Get' })),
  DeleteCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Delete' })),
  QueryCommand: vi.fn().mockImplementation((params) => ({ ...params, _type: 'Query' })),
}));

// Mock ULID
vi.mock('ulid', () => {
  let counter = 0;
  return {
    ulid: () => `01ARZ3NDEKTSV4RRFFQ69G5FA${counter++}`,
    decodeTime: () => 1234567890123,
  };
});

// Import after mocks
import { handler } from './index';

const createEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => ({
  httpMethod: 'GET',
  resource: '/',
  path: '/',
  pathParameters: null,
  queryStringParameters: null,
  body: null,
  headers: {},
  multiValueHeaders: {},
  isBase64Encoded: false,
  stageVariables: null,
  requestContext: {} as APIGatewayProxyEvent['requestContext'],
  multiValueQueryStringParameters: null,
  ...overrides,
});

describe('event-stream handler', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('POST /streams - createStream', () => {
    it('should create a stream and return stream id', async () => {
      mockSend.mockResolvedValueOnce({});

      const event = createEvent({
        httpMethod: 'POST',
        resource: '/streams',
        body: JSON.stringify({ schema: { type: 'object' } }),
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatch(/^01ARZ3NDEKTSV4RRFFQ69G5FA/);
    });

    it('should return error if body is missing', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        resource: '/streams',
        body: null,
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Request body is required');
    });

    it('should return error if schema is missing', async () => {
      const event = createEvent({
        httpMethod: 'POST',
        resource: '/streams',
        body: JSON.stringify({}),
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('schema is required');
    });
  });

  describe('DELETE /streams/{streamId} - deleteStream', () => {
    it('should delete stream and all events', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: { pk: 'stream1', sk: '#META' } }) // GetCommand
        .mockResolvedValueOnce({
          Items: [
            { pk: 'stream1', sk: '#META' },
            { pk: 'stream1', sk: 'event1' },
          ],
        }) // QueryCommand
        .mockResolvedValueOnce({}) // DeleteCommand 1
        .mockResolvedValueOnce({}); // DeleteCommand 2

      const event = createEvent({
        httpMethod: 'DELETE',
        resource: '/streams/{streamId}',
        pathParameters: { streamId: 'stream1' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should return error if stream not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const event = createEvent({
        httpMethod: 'DELETE',
        resource: '/streams/{streamId}',
        pathParameters: { streamId: 'nonexistent' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('Stream not found');
    });
  });

  describe('POST /streams/{streamId}/events - pushEvent', () => {
    it('should push event and return event id', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: { pk: 'stream1', sk: '#META' } }) // GetCommand
        .mockResolvedValueOnce({}); // PutCommand

      const event = createEvent({
        httpMethod: 'POST',
        resource: '/streams/{streamId}/events',
        pathParameters: { streamId: 'stream1' },
        body: JSON.stringify({ body: { message: 'hello' } }),
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toMatch(/^01ARZ3NDEKTSV4RRFFQ69G5FA/);
    });

    it('should return error if stream not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const event = createEvent({
        httpMethod: 'POST',
        resource: '/streams/{streamId}/events',
        pathParameters: { streamId: 'nonexistent' },
        body: JSON.stringify({ body: { message: 'hello' } }),
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('Stream not found');
    });

    it('should return error if body field is missing', async () => {
      mockSend.mockResolvedValueOnce({ Item: { pk: 'stream1', sk: '#META' } });

      const event = createEvent({
        httpMethod: 'POST',
        resource: '/streams/{streamId}/events',
        pathParameters: { streamId: 'stream1' },
        body: JSON.stringify({}),
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('body is required');
    });
  });

  describe('GET /streams/{streamId}/events/{eventId} - getEvent', () => {
    it('should return event body', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          pk: 'stream1',
          sk: 'event1',
          body: { message: 'hello' },
          createdAt: '2024-01-01T00:00:00Z',
        },
      });

      const event = createEvent({
        httpMethod: 'GET',
        resource: '/streams/{streamId}/events/{eventId}',
        pathParameters: { streamId: 'stream1', eventId: 'event1' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ message: 'hello' });
    });

    it('should return error if event not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const event = createEvent({
        httpMethod: 'GET',
        resource: '/streams/{streamId}/events/{eventId}',
        pathParameters: { streamId: 'stream1', eventId: 'nonexistent' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('Event not found');
    });
  });

  describe('GET /streams/{streamId}/backtrace - backtrace', () => {
    it('should return events in descending order', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: { pk: 'stream1', sk: '#META' } }) // GetCommand
        .mockResolvedValueOnce({
          Items: [
            { pk: 'stream1', sk: 'event3', body: { n: 3 }, createdAt: '2024-01-03' },
            { pk: 'stream1', sk: 'event2', body: { n: 2 }, createdAt: '2024-01-02' },
          ],
        }); // QueryCommand

      const event = createEvent({
        httpMethod: 'GET',
        resource: '/streams/{streamId}/backtrace',
        pathParameters: { streamId: 'stream1' },
        queryStringParameters: { limit: '10' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.events).toHaveLength(2);
      expect(body.data.events[0].eventId).toBe('event3');
      expect(body.data.nextAnchor).toBe(null);
    });

    it('should return nextAnchor when there are more events', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: { pk: 'stream1', sk: '#META' } })
        .mockResolvedValueOnce({
          Items: [
            { pk: 'stream1', sk: 'event3', body: { n: 3 }, createdAt: '2024-01-03' },
            { pk: 'stream1', sk: 'event2', body: { n: 2 }, createdAt: '2024-01-02' },
            { pk: 'stream1', sk: 'event1', body: { n: 1 }, createdAt: '2024-01-01' },
          ],
        });

      const event = createEvent({
        httpMethod: 'GET',
        resource: '/streams/{streamId}/backtrace',
        pathParameters: { streamId: 'stream1' },
        queryStringParameters: { limit: '2' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.data.events).toHaveLength(2);
      expect(body.data.nextAnchor).toBe('event2');
    });

    it('should return error if stream not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const event = createEvent({
        httpMethod: 'GET',
        resource: '/streams/{streamId}/backtrace',
        pathParameters: { streamId: 'nonexistent' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('Stream not found');
    });
  });

  describe('GET /streams/{streamId}/replay - replay', () => {
    it('should return events in ascending order', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: { pk: 'stream1', sk: '#META' } })
        .mockResolvedValueOnce({
          Items: [
            { pk: 'stream1', sk: 'event1', body: { n: 1 }, createdAt: '2024-01-01' },
            { pk: 'stream1', sk: 'event2', body: { n: 2 }, createdAt: '2024-01-02' },
          ],
        });

      const event = createEvent({
        httpMethod: 'GET',
        resource: '/streams/{streamId}/replay',
        pathParameters: { streamId: 'stream1' },
        queryStringParameters: { limit: '10' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.events).toHaveLength(2);
      expect(body.data.events[0].eventId).toBe('event1');
    });

    it('should return error if stream not found', async () => {
      mockSend.mockResolvedValueOnce({ Item: undefined });

      const event = createEvent({
        httpMethod: 'GET',
        resource: '/streams/{streamId}/replay',
        pathParameters: { streamId: 'nonexistent' },
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('Stream not found');
    });
  });

  describe('unknown routes', () => {
    it('should return error for unknown route', async () => {
      const event = createEvent({
        httpMethod: 'GET',
        resource: '/unknown',
      });

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.error).toBe('Unknown route: GET /unknown');
    });
  });
});
