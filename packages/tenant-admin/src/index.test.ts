import { describe, expect, it } from 'vitest';
import { createTenant, generateTenantId, updateTenant, updateTenantStatus } from './index';

describe('@automabase/tenant-admin', () => {
  describe('exports', () => {
    it('should export createTenant', () => {
      expect(typeof createTenant).toBe('function');
    });

    it('should export generateTenantId', () => {
      expect(typeof generateTenantId).toBe('function');
    });

    it('should export updateTenant', () => {
      expect(typeof updateTenant).toBe('function');
    });

    it('should export updateTenantStatus', () => {
      expect(typeof updateTenantStatus).toBe('function');
    });
  });

  describe('generateTenantId', () => {
    it('should generate a valid ULID', () => {
      const id = generateTenantId();
      expect(id).toMatch(/^[0-9A-Z]{26}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTenantId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
