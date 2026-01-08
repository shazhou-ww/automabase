/**
 * Utilities exports for @automabase/automata-core
 */

export { executeTransition } from './jsonata-runner';
export {
  versionIncrement,
  versionDecrement,
  versionCompare,
  isValidVersion,
  versionToNumber,
  numberToVersion,
  versionAdd,
  VERSION_LENGTH,
  VERSION_ZERO,
  VERSION_MAX,
} from './base62';
