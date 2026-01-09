import {
  type AutomataDescriptor,
  computeDescriptorHash,
  signDescriptor,
} from '@automabase/automata-auth';

/**
 * Configuration for AutomataServerSDK
 */
export interface AutomataServerSDKConfig {
  /** Tenant ID */
  tenantId: string;
  /** Private RSA key in PEM format or JWK format for signing descriptors */
  privateKey: string;
  /** Default expiration time in seconds for signatures (default: 3600 = 1 hour) */
  defaultExpirationSeconds?: number;
}

/**
 * Server-side SDK for automata operations
 *
 * This SDK is designed to be used by tenant authentication services
 * to sign automata descriptors before they are sent to clients.
 */
export class AutomataServerSDK {
  private tenantId: string;
  private privateKey: string;
  private defaultExpirationSeconds: number;

  constructor(config: AutomataServerSDKConfig) {
    this.tenantId = config.tenantId;
    this.privateKey = config.privateKey;
    this.defaultExpirationSeconds = config.defaultExpirationSeconds ?? 3600; // 1 hour default
  }

  /**
   * Sign an automata descriptor
   *
   * Creates a JWT signature for the automata descriptor that can be used
   * by clients to create automata. The signature ensures that only
   * tenant-authorized descriptors can be created.
   *
   * @param descriptor - The automata descriptor to sign
   * @param expiresInSeconds - Signature expiration time in seconds (optional, uses default if not provided)
   * @returns Promise resolving to JWT signature string
   *
   * @example
   * ```typescript
   * const signature = await sdk.signDescriptor({
   *   name: 'OrderWorkflow',
   *   stateSchema: {...},
   *   eventSchemas: {...},
   *   initialState: {...},
   *   transition: '...'
   * }, 7200); // 2 hours expiration
   * ```
   */
  async signDescriptor(descriptor: AutomataDescriptor, expiresInSeconds?: number): Promise<string> {
    const expiration = expiresInSeconds ?? this.defaultExpirationSeconds;
    return await signDescriptor(descriptor, this.tenantId, this.privateKey, expiration);
  }

  /**
   * Compute hash of an automata descriptor
   *
   * This can be useful for caching or comparing descriptors.
   *
   * @param descriptor - The automata descriptor to hash
   * @returns SHA-256 hash string
   */
  computeDescriptorHash(descriptor: AutomataDescriptor): string {
    return computeDescriptorHash(descriptor);
  }

  /**
   * Get the tenant ID configured for this SDK instance
   */
  getTenantId(): string {
    return this.tenantId;
  }
}
