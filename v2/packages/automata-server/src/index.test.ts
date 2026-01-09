/**
 * Tests for @automabase/automata-server
 */

import { describe, expect, it } from 'vitest';

describe('AutomataServerSDK', () => {
  it('should export AutomataServerSDK', async () => {
    const mod = await import('./index');
    expect(mod.AutomataServerSDK).toBeDefined();
  });
});
