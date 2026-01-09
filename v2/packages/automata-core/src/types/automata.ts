/**
 * Automata Entity Types
 * Based on BUSINESS_MODEL_SPEC.md Section 2.2
 */

import type { JSONSchema7 } from 'json-schema';

/**
 * Automata status enum
 */
export type AutomataStatus = 'active' | 'archived';

/**
 * Automata descriptor structure
 * This is signed by the tenant and immutable after creation
 */
export interface AutomataDescriptor {
  /** Automata name */
  name: string;
  /** State JSON Schema for validation */
  stateSchema: JSONSchema7;
  /** Event type to JSON Schema mapping */
  eventSchemas: Record<string, JSONSchema7>;
  /** JSONata transition expression */
  transition: string;
  /** Initial state value */
  initialState: unknown;
}

/**
 * Automata entity - finite state machine instance
 */
export interface Automata {
  // === Immutable Properties ===
  /** Primary key, automata unique identifier (ULID format) */
  automataId: string;
  /** Owning tenant ID */
  tenantId: string;
  /** Owning realm ID */
  realmId: string;
  /** Descriptor (immutable definition) */
  descriptor: AutomataDescriptor;
  /** JWT signature of the descriptor */
  descriptorSignature: string;
  /** SHA256 hash of the descriptor */
  descriptorHash: string;
  /** Creator Subject ID (for audit, not used in authorization) */
  creatorSubjectId: string;
  /** Creation timestamp (ISO8601) */
  createdAt: string;

  // === Mutable Properties ===
  /** Current state value */
  currentState: unknown;
  /** Current version (6-digit Base62) */
  version: string;
  /** Automata status */
  status: AutomataStatus;
  /** Last update timestamp (ISO8601) */
  updatedAt: string;
}

/**
 * Create automata request
 */
export interface CreateAutomataRequest {
  /** Automata descriptor */
  descriptor: AutomataDescriptor;
  /** JWT signature of the descriptor */
  descriptorSignature: string;
}

/**
 * Create automata response
 */
export interface CreateAutomataResponse {
  automataId: string;
  createdAt: string;
}

/**
 * Automata list item (for listing)
 */
export interface AutomataListItem {
  automataId: string;
  name: string;
  version: string;
  status: AutomataStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * List automatas response
 */
export interface ListAutomatasResponse {
  automatas: AutomataListItem[];
  nextCursor?: string;
}

/**
 * Get automata state response
 */
export interface AutomataStateResponse {
  automataId: string;
  currentState: unknown;
  version: string;
  status: AutomataStatus;
  updatedAt: string;
}

/**
 * Get automata descriptor response
 */
export interface AutomataDescriptorResponse {
  automataId: string;
  tenantId: string;
  realmId: string;
  descriptor: AutomataDescriptor;
  descriptorHash: string;
  creatorSubjectId: string;
  createdAt: string;
}

/**
 * Update automata request (PATCH)
 */
export interface UpdateAutomataRequest {
  status?: 'archived';
}

/**
 * Update automata response
 */
export interface UpdateAutomataResponse {
  automataId: string;
  status: AutomataStatus;
  updatedAt: string;
}
