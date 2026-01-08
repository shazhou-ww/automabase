/**
 * Database exports for @automabase/automata-core
 */

// Automata repository
export {
  archiveAutomata,
  createAutomata,
  generateAutomataId,
  getAutomata,
  listAutomatasInRealm,
  updateAutomataState,
} from './automata-repository';
// Client
export {
  createDocClient,
  createDynamoDBClient,
  getDocClient,
  getDynamoDBClient,
  resetClients,
} from './client';
// Constants
export {
  DEFAULT_PAGE_SIZE,
  GSI,
  LSI,
  MAX_PAGE_SIZE,
  META_SK,
  PREFIX,
  REQUEST_ID_TABLE,
  REQUEST_ID_TTL_SECONDS,
  TABLE_NAME,
  VERSION_ZERO,
} from './constants';
// Event repository
export {
  createEvent,
  createEventWithStateUpdate,
  getEvent,
  listEvents,
  listEventsByType,
} from './event-repository';
// Key builders
export {
  automataKeys,
  automataPK,
  eventKeys,
  eventSK,
  eventTypeSK,
  extractAutomataId,
  extractEventVersion,
  extractTenantId,
  gsi1PK,
  gsi1SK,
  gsi2PK,
  gsi2SK,
  snapshotSK,
  tenantKeys,
  tenantPK,
} from './keys';
// Request ID repository
export {
  checkAndRecordRequestId,
  hasRequestId,
} from './request-id-repository';
// Snapshot repository
export {
  createSnapshot,
  getLatestSnapshot,
  getSnapshot,
  listSnapshots,
  type Snapshot,
  shouldCreateSnapshot,
} from './snapshot-repository';
// Tenant repository (read-only, write operations are in @automabase/tenant-admin)
export { getTenant } from './tenant-repository';
