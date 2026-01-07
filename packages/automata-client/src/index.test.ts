import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomataClient } from './client';

describe('AutomataClient', () => {
  let client: AutomataClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new AutomataClient({
      baseUrl: 'https://api.example.com',
      fetch: mockFetch as unknown as typeof fetch,
    });
  });

  describe('REST API', () => {
    describe('create', () => {
      it('should create an automata', async () => {
        mockFetch.mockResolvedValueOnce({
          json: () => Promise.resolve({ success: true, data: { id: 'test-id' } }),
        });

        const result = await client.create({
          stateSchema: { type: 'object' },
          eventSchemas: { INCREMENT: { type: 'object' } },
          initialState: { count: 0 },
          transition: 'state',
        });

        expect(result.id).toBe('test-id');
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/automata',
          expect.objectContaining({
            method: 'POST',
            body: expect.any(String),
          })
        );
      });
    });

    describe('get', () => {
      it('should get an automata', async () => {
        const mockMeta = {
          id: 'test-id',
          version: '000001',
          state: { count: 1 },
          initialState: { count: 0 },
          stateSchema: {},
          eventSchemas: {},
          transition: 'state',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:01.000Z',
        };

        mockFetch.mockResolvedValueOnce({
          json: () => Promise.resolve({ success: true, data: mockMeta }),
        });

        const result = await client.get('test-id');

        expect(result.id).toBe('test-id');
        expect(result.version).toBe('000001');
        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/automata/test-id',
          expect.objectContaining({ method: 'GET' })
        );
      });

      it('should encode automata ID in URL', async () => {
        mockFetch.mockResolvedValueOnce({
          json: () => Promise.resolve({ success: true, data: {} }),
        });

        await client.get('test/id/with/slashes');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/automata/test%2Fid%2Fwith%2Fslashes',
          expect.any(Object)
        );
      });
    });

    describe('postEvent', () => {
      it('should post an event', async () => {
        mockFetch.mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              success: true,
              data: { version: '000002', state: { count: 2 } },
            }),
        });

        const result = await client.postEvent('test-id', {
          type: 'INCREMENT',
          data: { amount: 1 },
        });

        expect(result.version).toBe('000002');
        expect(result.state).toEqual({ count: 2 });
      });
    });

    describe('backtrace', () => {
      it('should fetch events in reverse order', async () => {
        mockFetch.mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                events: [
                  { version: '000002', type: 'INCREMENT', data: {}, nextState: { count: 2 }, createdAt: '' },
                  { version: '000001', type: 'INCREMENT', data: {}, nextState: { count: 1 }, createdAt: '' },
                ],
                nextAnchor: null,
              },
            }),
        });

        const result = await client.backtrace('test-id', { limit: 10 });

        expect(result.events).toHaveLength(2);
        expect(result.events[0].version).toBe('000002');
      });
    });

    describe('error handling', () => {
      it('should throw on error response', async () => {
        mockFetch.mockResolvedValueOnce({
          json: () =>
            Promise.resolve({ success: false, error: 'Automata not found' }),
        });

        await expect(client.get('nonexistent')).rejects.toThrow('Automata not found');
      });
    });
  });

  describe('WebSocket tracking', () => {
    it('should report tracking disabled when wsUrl not provided', () => {
      expect(client.trackingEnabled).toBe(false);
    });

    it('should report tracking enabled when wsUrl provided', () => {
      const wsClient = new AutomataClient({
        baseUrl: 'https://api.example.com',
        wsUrl: 'wss://ws.example.com/prod',
        fetch: mockFetch as unknown as typeof fetch,
      });
      expect(wsClient.trackingEnabled).toBe(true);
    });

    it('should report disconnected initially', () => {
      expect(client.connected).toBe(false);
    });
  });
});

describe('Types', () => {
  it('should have correct message type structure', () => {
    const subscribedMsg = {
      type: 'subscribed' as const,
      automataId: 'test',
      state: { count: 0 },
      version: '000000',
      timestamp: '2024-01-01T00:00:00.000Z',
    };

    const stateMsg = {
      type: 'state' as const,
      automataId: 'test',
      event: { type: 'INCREMENT', data: {} },
      state: { count: 1 },
      version: '000001',
      timestamp: '2024-01-01T00:00:01.000Z',
    };

    expect(subscribedMsg.type).toBe('subscribed');
    expect(stateMsg.type).toBe('state');
    expect(stateMsg.event.type).toBe('INCREMENT');
  });
});
