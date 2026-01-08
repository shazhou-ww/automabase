/**
 * Tests for @automabase/automata-core
 */

import { describe, expect, it } from 'vitest';
import {
  // Event utilities
  createEventId,
  formatPermission,
  isValidVersion,
  numberToVersion,
  PermissionChecker,
  parseEventId,
  // Permission utilities
  parsePermission,
  VERSION_MAX,
  VERSION_ZERO,
  versionDecrement,
  // Base62 utilities
  versionIncrement,
  versionToNumber,
} from './index';

describe('Base62 Version Utilities', () => {
  describe('versionIncrement', () => {
    it('should increment version correctly', () => {
      expect(versionIncrement('000000')).toBe('000001');
      expect(versionIncrement('000009')).toBe('00000A');
      expect(versionIncrement('00000Z')).toBe('00000a');
      expect(versionIncrement('00000z')).toBe('000010');
    });

    it('should throw on overflow', () => {
      expect(() => versionIncrement('zzzzzz')).toThrow('overflow');
    });
  });

  describe('versionDecrement', () => {
    it('should decrement version correctly', () => {
      expect(versionDecrement('000001')).toBe('000000');
      expect(versionDecrement('00000A')).toBe('000009');
      expect(versionDecrement('00000a')).toBe('00000Z');
      expect(versionDecrement('000010')).toBe('00000z');
    });

    it('should throw on underflow', () => {
      expect(() => versionDecrement('000000')).toThrow('underflow');
    });
  });

  describe('versionToNumber / numberToVersion', () => {
    it('should convert correctly', () => {
      expect(versionToNumber('000000')).toBe(0);
      expect(versionToNumber('000001')).toBe(1);
      expect(versionToNumber('00000A')).toBe(10);
      expect(versionToNumber('00000z')).toBe(61);
      expect(versionToNumber('000010')).toBe(62);

      expect(numberToVersion(0)).toBe('000000');
      expect(numberToVersion(1)).toBe('000001');
      expect(numberToVersion(10)).toBe('00000A');
      expect(numberToVersion(61)).toBe('00000z');
      expect(numberToVersion(62)).toBe('000010');
    });

    it('should round-trip correctly', () => {
      for (let i = 0; i < 1000; i++) {
        const version = numberToVersion(i);
        expect(versionToNumber(version)).toBe(i);
      }
    });
  });

  describe('isValidVersion', () => {
    it('should validate correct versions', () => {
      expect(isValidVersion(VERSION_ZERO)).toBe(true);
      expect(isValidVersion(VERSION_MAX)).toBe(true);
      expect(isValidVersion('00001a')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(isValidVersion('00000')).toBe(false); // too short
      expect(isValidVersion('0000000')).toBe(false); // too long
      expect(isValidVersion('00000!')).toBe(false); // invalid char
    });
  });
});

describe('Permission Utilities', () => {
  describe('parsePermission', () => {
    it('should parse valid permissions', () => {
      const perm = parsePermission('realm:01F8MECHZX3TBDSZ7XRADM79XV:read');
      expect(perm).toEqual({
        resourceType: 'realm',
        resourceId: '01F8MECHZX3TBDSZ7XRADM79XV',
        accessLevel: 'read',
        isWildcard: false,
      });
    });

    it('should return null for invalid permissions', () => {
      expect(parsePermission('invalid')).toBeNull();
      expect(parsePermission('invalid:id:read')).toBeNull();
      expect(parsePermission('realm:invalid:read')).toBeNull();
      expect(parsePermission('realm:01F8MECHZX3TBDSZ7XRADM79XV:invalid')).toBeNull();
    });
  });

  describe('formatPermission', () => {
    it('should format permission correctly', () => {
      const perm = {
        resourceType: 'automata' as const,
        resourceId: '01AN4Z07BY79KA1307SR9X4MV3',
        accessLevel: 'readwrite' as const,
      };
      expect(formatPermission(perm)).toBe('automata:01AN4Z07BY79KA1307SR9X4MV3:readwrite');
    });
  });

  describe('PermissionChecker', () => {
    it('should check realm permissions', () => {
      const checker = new PermissionChecker(['realm:01F8MECHZX3TBDSZ7XRADM79XV:readwrite']);
      expect(checker.canReadRealm('01F8MECHZX3TBDSZ7XRADM79XV')).toBe(true);
      expect(checker.canWriteRealm('01F8MECHZX3TBDSZ7XRADM79XV')).toBe(true);
    });

    it('should check automata permissions with realm inheritance', () => {
      const checker = new PermissionChecker(['realm:01F8MECHZX3TBDSZ7XRADM79XV:read']);
      // Direct automata permission check with realm
      expect(
        checker.canReadAutomata('01AN4Z07BY79KA1307SR9X4MV3', '01F8MECHZX3TBDSZ7XRADM79XV')
      ).toBe(true);
      expect(
        checker.canWriteAutomata('01AN4Z07BY79KA1307SR9X4MV3', '01F8MECHZX3TBDSZ7XRADM79XV')
      ).toBe(false);
    });

    it('should get readable realm IDs', () => {
      const checker = new PermissionChecker([
        'realm:01F8MECHZX3TBDSZ7XRADM79XV:read',
        'realm:01AN4Z07BY79KA1307SR9X4MV3:readwrite',
        'automata:01AAAAAAAAAAAAAAAAAAAAAAA1:read',
      ]);
      const realmIds = checker.getReadableRealmIds();
      expect(realmIds).toContain('01F8MECHZX3TBDSZ7XRADM79XV');
      expect(realmIds).toContain('01AN4Z07BY79KA1307SR9X4MV3');
      expect(realmIds).toHaveLength(2);
    });
  });
});

describe('Event Utilities', () => {
  describe('createEventId / parseEventId', () => {
    it('should create and parse event IDs', () => {
      const eventId = createEventId('01AN4Z07BY79KA1307SR9X4MV3', '00001a');
      expect(eventId).toBe('event:01AN4Z07BY79KA1307SR9X4MV3:00001a');

      const parsed = parseEventId(eventId);
      expect(parsed).toEqual({
        automataId: '01AN4Z07BY79KA1307SR9X4MV3',
        baseVersion: '00001a',
      });
    });

    it('should return null for invalid event IDs', () => {
      expect(parseEventId('invalid')).toBeNull();
      expect(parseEventId('other:id:version')).toBeNull();
    });
  });
});
