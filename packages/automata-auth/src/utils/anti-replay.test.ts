import { describe, it, expect } from 'vitest';
import { validateTimestamp, AntiReplayError } from './anti-replay';

describe('anti-replay', () => {
  describe('validateTimestamp', () => {
    it('should accept timestamp within window', () => {
      const now = new Date().toISOString();
      expect(() => validateTimestamp(now, 300)).not.toThrow();
    });

    it('should accept timestamp at edge of window', () => {
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      expect(() => validateTimestamp(fourMinutesAgo, 300)).not.toThrow();
    });

    it('should reject timestamp outside window', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      expect(() => validateTimestamp(tenMinutesAgo, 300)).toThrow(AntiReplayError);
    });

    it('should reject missing timestamp', () => {
      expect(() => validateTimestamp(undefined, 300)).toThrow(AntiReplayError);
      try {
        validateTimestamp(undefined, 300);
      } catch (e) {
        expect((e as AntiReplayError).code).toBe('MISSING_TIMESTAMP');
      }
    });

    it('should reject invalid timestamp format', () => {
      expect(() => validateTimestamp('not-a-date', 300)).toThrow(AntiReplayError);
      try {
        validateTimestamp('not-a-date', 300);
      } catch (e) {
        expect((e as AntiReplayError).code).toBe('INVALID_TIMESTAMP');
      }
    });

    it('should use default 5 minute window', () => {
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      expect(() => validateTimestamp(fourMinutesAgo)).not.toThrow();

      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      expect(() => validateTimestamp(sixMinutesAgo)).toThrow(AntiReplayError);
    });

    it('should reject future timestamps outside window', () => {
      const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      expect(() => validateTimestamp(tenMinutesLater, 300)).toThrow(AntiReplayError);
    });
  });
});

