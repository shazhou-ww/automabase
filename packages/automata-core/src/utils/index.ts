/**
 * Utilities exports for @automabase/automata-core
 */

export {
  isValidVersion,
  numberToVersion,
  VERSION_LENGTH,
  VERSION_MAX,
  versionAdd,
  versionCompare,
  versionDecrement,
  versionIncrement,
  versionToNumber,
} from './base62';
export { executeTransition } from './jsonata-runner';
