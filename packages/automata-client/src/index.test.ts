import { describe, expect, it } from 'vitest';
import { example } from './index';

describe('example', () => {
  it('should return a greeting', () => {
    expect(example()).toContain('automata-client');
  });
});
