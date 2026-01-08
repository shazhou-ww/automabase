import { META_SK } from '../utils/database';

/**
 * Metadata for an automata stored in DynamoDB
 */
export interface AutomataMeta {
  pk: string;
  sk: typeof META_SK;
  userId: string; // Owner of the automata
  tenantId: string; // Tenant ID
  name?: string; // Optional name
  gsi1pk: string; // "TENANT#tenantId#USER#userId" for tenant-user-index
  gsi1sk: string; // createdAt for sorting
  stateSchema: unknown; // JSONSchema for state validation
  eventSchemas: Record<string, unknown>; // event type -> JSONSchema
  transition: string; // JSONata expression
  initialState: unknown; // Initial state (immutable, version "000000")
  currentState: unknown; // Current state of the automata
  version: string; // Current version (base62, e.g., "000000")
  createdAt: string;
  updatedAt: string;
  descriptorSignature: string; // JWT signature of the automata descriptor
  descriptorHash: string; // SHA-256 hash of the descriptor for integrity
  signatureExpiresAt: string; // ISO date when the descriptor signature expires
}

/**
 * Automata descriptor that gets signed by tenant
 */
export interface AutomataDescriptor {
  stateSchema: unknown;
  eventSchemas: Record<string, unknown>;
  transition: string;
  initialState: unknown;
  name: string;
}

/**
 * Event record stored in DynamoDB
 */
export interface EventRecord {
  pk: string;
  sk: string; // version (base62, e.g., "000001")
  type: string; // event type
  data: unknown; // event data
  nextState: unknown; // state after this event
  createdAt: string;
}

/**
 * Result of backtrace/replay operations
 */
export interface BacktraceReplayResult {
  events: Array<{
    version: string;
    type: string;
    data: unknown;
    nextState: unknown;
    createdAt: string;
  }>;
  nextAnchor: string | null;
}