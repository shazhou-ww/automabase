/**
 * DynamoDB Table Constants
 * Based on BUSINESS_MODEL_SPEC.md Section 6
 */

// Table names from environment
export const TABLE_NAME = process.env.AUTOMABASE_TABLE || 'automabase';
export const REQUEST_ID_TABLE = process.env.REQUEST_ID_TABLE || 'automabase-request-ids';

// Sort key constants
export const META_SK = '#META';

// Key prefixes for Single Table Design
export const PREFIX = {
  TENANT: 'TENANT#',
  AUTOMATA: 'AUTOMATA#',
  EVENT: 'EVT#',
  EVENT_TYPE: 'EVTYPE#',
  SNAPSHOT: 'SNAP#',
  SUBJECT: 'SUBJECT#',
  REALM: 'REALM#',
} as const;

// GSI names
export const GSI = {
  /** GSI1: Query Automata by Tenant/Realm */
  TENANT_REALM: 'gsi1-tenant-realm-index',
  /** GSI2: Query by Subject (for audit) */
  SUBJECT: 'gsi2-subject-index',
} as const;

// LSI names
export const LSI = {
  /** LSI1: Query Events by type */
  EVENT_TYPE: 'lsi1-event-type-index',
} as const;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 1000;

// Request ID TTL (5 minutes)
export const REQUEST_ID_TTL_SECONDS = 5 * 60;

// Version constants
export const VERSION_ZERO = '000000';
