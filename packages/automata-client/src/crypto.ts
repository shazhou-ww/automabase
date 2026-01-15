/**
 * Cryptographic utilities for request signing
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Enable synchronous methods by providing sha512 hash function (v3 API)
ed.hashes.sha512 = sha512;

/**
 * Generate Ed25519 key pair
 *
 * @returns Object containing Base64URL-encoded public and private keys
 */
export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  // v3 API uses utils.randomSecretKey()
  const privateKeyBytes = ed.utils.randomSecretKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

  return {
    publicKey: base64UrlEncode(publicKeyBytes),
    privateKey: base64UrlEncode(privateKeyBytes),
  };
}

/**
 * Sign data with Ed25519 private key
 *
 * @param data - Data to sign
 * @param privateKeyBase64Url - Base64URL-encoded private key
 * @returns Base64URL-encoded signature
 */
export async function signData(data: Uint8Array, privateKeyBase64Url: string): Promise<string> {
  const privateKey = base64UrlDecode(privateKeyBase64Url);
  const signature = await ed.signAsync(data, privateKey);
  return base64UrlEncode(signature);
}

/**
 * Verify Ed25519 signature
 *
 * @param signature - Base64URL-encoded signature
 * @param data - Original data that was signed
 * @param publicKeyBase64Url - Base64URL-encoded public key
 * @returns True if signature is valid
 */
export async function verifySignature(
  signature: string,
  data: Uint8Array,
  publicKeyBase64Url: string
): Promise<boolean> {
  try {
    const signatureBytes = base64UrlDecode(signature);
    const publicKey = base64UrlDecode(publicKeyBase64Url);
    return await ed.verifyAsync(signatureBytes, data, publicKey);
  } catch {
    return false;
  }
}

/**
 * Base64URL encode bytes
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  // Use Buffer in Node.js environment
  if (typeof Buffer !== 'undefined') {
    const base64 = Buffer.from(bytes).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Fallback for browser environments
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL decode to bytes
 */
export function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  // Use Buffer in Node.js environment
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }

  // Fallback for browser environments
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
