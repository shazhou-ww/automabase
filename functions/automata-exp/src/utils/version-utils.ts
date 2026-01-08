/**
 * Version management utilities for automata versioning
 * Uses base62 encoding for sortable version strings
 */

// Base62 charset (sortable: 0-9A-Za-z)
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Increment a base62 version string by 1
 * "000000" → "000001", "00000z" → "000010"
 */
export function versionIncrement(v: string): string {
  const chars = v.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = BASE62.indexOf(chars[i]);
    if (idx < 61) {
      chars[i] = BASE62[idx + 1];
      return chars.join('');
    }
    chars[i] = '0'; // carry
  }
  throw new Error('Version overflow');
}

/**
 * Decrement a base62 version string by 1
 * "000001" → "000000", "000010" → "00000z"
 */
export function versionDecrement(v: string): string {
  const chars = v.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = BASE62.indexOf(chars[i]);
    if (idx > 0) {
      chars[i] = BASE62[idx - 1];
      return chars.join('');
    }
    chars[i] = 'z'; // borrow
  }
  throw new Error('Version underflow');
}