/**
 * Cryptographic utilities for request signing using WebCrypto API
 *
 * Uses ECDSA P-256 algorithm for better browser compatibility.
 * Private keys are stored as CryptoKey objects and never exposed as strings.
 */

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // WebCrypto BufferSource typing can be picky around ArrayBufferLike/SharedArrayBuffer.
  // Copy into a real ArrayBuffer to keep typecheck stable across lib settings.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/**
 * Generate ECDSA P-256 key pair using WebCrypto API
 *
 * Keys are generated as extractable for persistence in IndexedDB.
 * This is an internal function - keys are managed automatically by the client.
 *
 * @returns Object containing CryptoKey private key and Base64URL-encoded public key
 */
export async function generateKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable: true for IndexedDB persistence
    ['sign', 'verify']
  );

  // Export public key as Base64URL for API usage
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyBase64Url = base64UrlEncode(new Uint8Array(publicKeyRaw));

  return {
    privateKey: keyPair.privateKey,
    publicKey: publicKeyBase64Url,
  };
}

/**
 * Sign data with ECDSA P-256 private key
 *
 * @param data - Data to sign
 * @param privateKey - CryptoKey private key
 * @returns Base64URL-encoded signature
 */
export async function signData(data: Uint8Array, privateKey: CryptoKey): Promise<string> {
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    privateKey,
    toArrayBuffer(data)
  );

  return base64UrlEncode(new Uint8Array(signature));
}

/**
 * Verify ECDSA P-256 signature
 *
 * @param signature - Base64URL-encoded signature
 * @param data - Original data that was signed
 * @param publicKeyBase64Url - Base64URL-encoded public key (raw format)
 * @returns True if signature is valid
 */
export async function verifySignature(
  signature: string,
  data: Uint8Array,
  publicKeyBase64Url: string
): Promise<boolean> {
  try {
    const signatureBytes = base64UrlDecode(signature);
    const publicKeyBytes = base64UrlDecode(publicKeyBase64Url);

    // Import public key
    const publicKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(publicKeyBytes),
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false, // not extractable
      ['verify']
    );

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      toArrayBuffer(signatureBytes),
      toArrayBuffer(data)
    );
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
