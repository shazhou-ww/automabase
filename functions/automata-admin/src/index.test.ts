import { describe, it, expect } from 'vitest';

describe('automata-admin', () => {
  it('should export handler function', async () => {
    const { handler } = await import('./index');
    expect(typeof handler).toBe('function');
  });
});
