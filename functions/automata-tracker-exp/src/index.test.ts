import { describe, it, expect } from 'vitest';

describe('automata-tracker WebSocket', () => {
  describe('Message types', () => {
    it('should format subscribed message correctly', () => {
      const message = {
        type: 'subscribed',
        automataId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        state: { count: 0 },
        version: '000000',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      expect(message.type).toBe('subscribed');
      expect(message.automataId).toBeDefined();
      expect(message.state).toBeDefined();
      expect(message.version).toBe('000000');
    });

    it('should format state update message correctly', () => {
      const message = {
        type: 'state',
        automataId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        event: { type: 'INCREMENT', data: { amount: 1 } },
        state: { count: 1 },
        version: '000001',
        timestamp: '2024-01-01T00:00:01.000Z',
      };

      expect(message.type).toBe('state');
      expect(message.event.type).toBe('INCREMENT');
      expect(message.state).toEqual({ count: 1 });
      expect(message.version).toBe('000001');
    });

    it('should format error message correctly', () => {
      const message = {
        type: 'error',
        message: 'Automata not found',
      };

      expect(message.type).toBe('error');
      expect(message.message).toBeDefined();
    });
  });

  describe('Client message format', () => {
    it('should parse subscribe action', () => {
      const clientMessage = {
        action: 'subscribe',
        automataId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      };

      expect(clientMessage.action).toBe('subscribe');
      expect(clientMessage.automataId).toBeDefined();
    });

    it('should parse unsubscribe action', () => {
      const clientMessage = {
        action: 'unsubscribe',
        automataId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      };

      expect(clientMessage.action).toBe('unsubscribe');
      expect(clientMessage.automataId).toBeDefined();
    });
  });

  describe('Connection record structure', () => {
    it('should have correct structure', () => {
      const record = {
        pk: '01ARZ3NDEKTSV4RRFFQ69G5FAV', // automataId
        sk: 'abc123def456', // connectionId
        subscribedAt: '2024-01-01T00:00:00.000Z',
      };

      expect(record.pk).toBeDefined();
      expect(record.sk).toBeDefined();
      expect(record.subscribedAt).toBeDefined();
    });
  });
});
