/**
 * Utility exports for @automabase/automata-core
 */

// Base62 version utilities
export {
  VERSION_LENGTH,
  VERSION_ZERO as BASE62_VERSION_ZERO,
  VERSION_MAX,
  numberToVersion,
  versionToNumber,
  versionIncrement,
  versionDecrement,
  versionCompare,
  isValidVersion,
  versionAdd,
} from './base62';
