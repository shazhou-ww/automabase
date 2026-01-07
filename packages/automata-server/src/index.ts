/**
 * @automabase/automata-server
 * 
 * Server-side SDK for automata management with:
 * - Descriptor signing for tenant authentication services
 * - Server utilities for automata operations
 * 
 * @example
 * ```typescript
 * import { AutomataServerSDK } from '@automabase/automata-server';
 * 
 * // Initialize with tenant configuration
 * const sdk = new AutomataServerSDK({
 *   tenantId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   privateKey: process.env.TENANT_PRIVATE_KEY, // PEM format RSA private key
 * });
 * 
 * // Sign an automata descriptor
 * const descriptor = {
 *   name: 'OrderWorkflow',
 *   stateSchema: { type: 'object', properties: {...} },
 *   eventSchemas: { ORDER_CREATED: {...}, ORDER_COMPLETED: {...} },
 *   initialState: { status: 'pending' },
 *   transition: 'state.merge(event.data)'
 * };
 * 
 * const signature = await sdk.signDescriptor(descriptor, 3600); // 1 hour expiration
 * 
 * // The signature can then be used by clients to create automata
 * ```
 */

export { AutomataServerSDK, type AutomataServerSDKConfig } from './sdk';
