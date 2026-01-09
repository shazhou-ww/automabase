/**
 * Base62 Version Utilities
 * Based on BUSINESS_MODEL_SPEC.md Appendix A
 *
 * Charset: 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz
 * 6-digit Base62 version range: 000000 ~ zzzzzz (approximately 56.8 billion)
 */

// Base62 charset (sortable: 0-9A-Za-z)
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = 62;

/** Version string length (6 digits) */
export const VERSION_LENGTH = 6;

/** Initial version: 000000 */
export const VERSION_ZERO = '000000';

/** Maximum version: zzzzzz */
export const VERSION_MAX = 'zzzzzz';

/**
 * Convert a number to a 6-digit Base62 string
 */
export function numberToVersion(num: number): string {
  if (num < 0) {
    throw new Error('Version number cannot be negative');
  }

  let result = '';
  let n = num;

  // Convert to base62
  for (let i = 0; i < VERSION_LENGTH; i++) {
    result = BASE62_CHARS[n % BASE] + result;
    n = Math.floor(n / BASE);
  }

  if (n > 0) {
    throw new Error('Version number too large (overflow)');
  }

  return result;
}

/**
 * Convert a 6-digit Base62 string to a number
 */
export function versionToNumber(version: string): number {
  if (version.length !== VERSION_LENGTH) {
    throw new Error(`Version must be ${VERSION_LENGTH} characters`);
  }

  let result = 0;
  for (let i = 0; i < version.length; i++) {
    const char = version[i];
    const index = BASE62_CHARS.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base62 character: ${char}`);
    }
    result = result * BASE + index;
  }

  return result;
}

/**
 * Increment a Base62 version string by 1
 * "000000" → "000001", "00000z" → "000010"
 */
export function versionIncrement(version: string): string {
  if (version.length !== VERSION_LENGTH) {
    throw new Error(`Version must be ${VERSION_LENGTH} characters`);
  }

  const chars = version.split('');

  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = BASE62_CHARS.indexOf(chars[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base62 character: ${chars[i]}`);
    }
    if (idx < BASE - 1) {
      chars[i] = BASE62_CHARS[idx + 1];
      return chars.join('');
    }
    chars[i] = '0'; // carry
  }

  throw new Error('Version overflow');
}

/**
 * Decrement a Base62 version string by 1
 * "000001" → "000000", "000010" → "00000z"
 */
export function versionDecrement(version: string): string {
  if (version.length !== VERSION_LENGTH) {
    throw new Error(`Version must be ${VERSION_LENGTH} characters`);
  }

  if (version === VERSION_ZERO) {
    throw new Error('Version underflow');
  }

  const chars = version.split('');

  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = BASE62_CHARS.indexOf(chars[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base62 character: ${chars[i]}`);
    }
    if (idx > 0) {
      chars[i] = BASE62_CHARS[idx - 1];
      return chars.join('');
    }
    chars[i] = BASE62_CHARS[BASE - 1]; // borrow (z)
  }

  throw new Error('Version underflow');
}

/**
 * Compare two version strings
 * @returns negative if a < b, positive if a > b, 0 if equal
 */
export function versionCompare(a: string, b: string): number {
  if (a.length !== VERSION_LENGTH || b.length !== VERSION_LENGTH) {
    throw new Error(`Versions must be ${VERSION_LENGTH} characters`);
  }

  // Base62 strings are lexicographically sortable
  return a.localeCompare(b);
}

/**
 * Check if a version string is valid
 */
export function isValidVersion(version: string): boolean {
  if (version.length !== VERSION_LENGTH) {
    return false;
  }

  for (const char of version) {
    if (BASE62_CHARS.indexOf(char) === -1) {
      return false;
    }
  }

  return true;
}

/**
 * Add two version numbers (as a + n)
 */
export function versionAdd(version: string, n: number): string {
  const num = versionToNumber(version);
  return numberToVersion(num + n);
}
