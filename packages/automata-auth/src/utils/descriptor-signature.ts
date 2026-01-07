import { createHash } from 'crypto';
import * as jose from 'jose';
import type { TenantConfig } from '../types/auth-types';
import { verifyJwtWithTenantConfig } from './token-utils';

/**
 * Automata descriptor that gets signed by tenant
 */
export interface AutomataDescriptor {
  /** JSONSchema for state validation */
  stateSchema: unknown;
  /** Event type -> JSONSchema mapping */
  eventSchemas: Record<string, unknown>;
  /** JSONata expression for state transitions */
  transition: string;
  /** Initial state value */
  initialState: unknown;
  /** Name for the automata (required) */
  name: string;
}

/**
 * Descriptor signature JWT payload
 */
export interface DescriptorSignaturePayload {
  /** Tenant ID that issued the signature */
  iss: string;
  /** SHA-256 hash of the descriptor */
  sub: string;
  /** Expiration time (Unix timestamp) */
  exp: number;
  /** Issued at time (Unix timestamp) */
  iat: number;
  /** The complete descriptor for verification */
  descriptor: AutomataDescriptor;
}

/**
 * Compute SHA-256 hash of an automata descriptor
 */
export function computeDescriptorHash(descriptor: AutomataDescriptor): string {
  // Create a canonical JSON representation for consistent hashing
  const canonicalDescriptor = {
    stateSchema: descriptor.stateSchema,
    eventSchemas: descriptor.eventSchemas,
    transition: descriptor.transition,
    initialState: descriptor.initialState,
    name: descriptor.name,
  };

  const jsonString = JSON.stringify(canonicalDescriptor, Object.keys(canonicalDescriptor).sort());
  return createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Result of descriptor signature verification
 */
export interface DescriptorSignatureResult {
  isValid: boolean;
  payload?: DescriptorSignaturePayload;
  error?: string;
}

/**
 * Verify an automata descriptor signature
 * @param signature - JWT signature from tenant
 * @param descriptor - The descriptor to verify against
 * @param getTenantConfig - Function to get tenant config
 * @returns Promise resolving to verification result with payload if valid
 */
export async function verifyDescriptorSignature(
  signature: string,
  descriptor: AutomataDescriptor,
  getTenantConfig: (tenantId: string) => Promise<TenantConfig>
): Promise<DescriptorSignatureResult> {
  try {
    // Verify the JWT signature and decode payload
    const verifiedToken = await verifyJwtWithTenantConfig(signature, getTenantConfig);

    // Extract the descriptor signature payload
    const payload = verifiedToken as DescriptorSignaturePayload;

    // Verify payload structure
    if (!payload.iss || !payload.sub || !payload.exp || !payload.descriptor) {
      return { isValid: false, error: 'Invalid descriptor signature payload' };
    }

    // Check if signature has expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { isValid: false, error: 'Descriptor signature has expired' };
    }

    // Compute expected hash of the provided descriptor
    const expectedHash = computeDescriptorHash(descriptor);
    if (payload.sub !== expectedHash) {
      return { isValid: false, error: 'Descriptor hash mismatch' };
    }

    // Verify the descriptor in the signature matches the provided descriptor
    const signedDescriptor = payload.descriptor;
    if (
      JSON.stringify(signedDescriptor.stateSchema) !== JSON.stringify(descriptor.stateSchema) ||
      JSON.stringify(signedDescriptor.eventSchemas) !== JSON.stringify(descriptor.eventSchemas) ||
      signedDescriptor.transition !== descriptor.transition ||
      JSON.stringify(signedDescriptor.initialState) !== JSON.stringify(descriptor.initialState) ||
      signedDescriptor.name !== descriptor.name
    ) {
      return { isValid: false, error: 'Descriptor content mismatch' };
    }

    return { isValid: true, payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { isValid: false, error: message };
  }
}

/**
 * Create a descriptor signature JWT (server-side use)
 * 
 * This function should be used by tenant authentication services to sign
 * automata descriptors. It generates a proper JWT token signed with the
 * tenant's private key.
 * 
 * @param descriptor - The automata descriptor to sign
 * @param tenantId - Tenant ID that will sign the descriptor
 * @param privateKey - Private RSA key in PEM format or JWK format
 * @param expiresInSeconds - Signature expiration time in seconds (default: 3600 = 1 hour)
 * @returns Promise resolving to JWT signature string
 * 
 * @example
 * ```typescript
 * import { signDescriptor } from '@automabase/automata-auth';
 * 
 * // Using PEM format private key
 * const signature = await signDescriptor(
 *   {
 *     name: 'MyAutomata',
 *     stateSchema: {...},
 *     eventSchemas: {...},
 *     initialState: {...},
 *     transition: '...'
 *   },
 *   tenantId,
 *   privateKeyPEM
 * );
 * 
 * // Using JWK format private key
 * const signature = await signDescriptor(
 *   descriptor,
 *   tenantId,
 *   privateKeyJWK
 * );
 * ```
 */
export async function signDescriptor(
  descriptor: AutomataDescriptor,
  tenantId: string,
  privateKey: string | jose.JWK,
  expiresInSeconds: number = 3600 // 1 hour default
): Promise<string> {
  // Parse the private key
  let key: jose.KeyLike;
  if (typeof privateKey === 'string') {
    // Assume PEM format
    key = await jose.importPKCS8(privateKey, 'RS256');
  } else {
    // JWK format
    key = await jose.importJWK(privateKey, 'RS256');
  }

  // Compute descriptor hash
  const descriptorHash = computeDescriptorHash(descriptor);

  // Create JWT payload
  const payload: DescriptorSignaturePayload = {
    iss: tenantId,
    sub: descriptorHash,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000),
    descriptor,
  };

  // Sign the JWT
  const jwt = new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(payload.iat)
    .setIssuer(tenantId)
    .setSubject(descriptorHash)
    .setExpirationTime(payload.exp);

  return await jwt.sign(key);
}

/**
 * Create a descriptor signature JWT (mock implementation for testing/client use)
 * 
 * ⚠️ WARNING: This is a mock implementation that does NOT produce valid signatures.
 * It is only for testing purposes. In production, use signDescriptor() instead.
 * 
 * @deprecated Use signDescriptor() for production code. This function will be removed in a future version.
 */
export function createDescriptorSignature(
  descriptor: AutomataDescriptor,
  tenantId: string,
  privateKey: string,
  expiresInSeconds: number = 3600 // 1 hour default
): string {
  // This is a mock implementation for testing only
  const payload: DescriptorSignaturePayload = {
    iss: tenantId,
    sub: computeDescriptorHash(descriptor),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    iat: Math.floor(Date.now() / 1000),
    descriptor,
  };

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'mock_signature'; // Not a real signature

  return `${header}.${payloadB64}.${signature}`;
}