/**
 * Database exports for @automabase/automata-core
 */

// Constants
export {
  TABLE_NAME,
  REQUEST_ID_TABLE,
  META_SK,
  PREFIX,
  GSI,
  LSI,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  REQUEST_ID_TTL_SECONDS,
  VERSION_ZERO,
} from './constants';

// Key builders
export {
  tenantPK,
  automataPK,
  eventSK,
  eventTypeSK,
  snapshotSK,
  gsi1PK,
  gsi1SK,
  gsi2PK,
  gsi2SK,
  tenantKeys,
  automataKeys,
  eventKeys,
  extractTenantId,
  extractAutomataId,
  extractEventVersion,
} from './keys';

// Client
export {
  createDynamoDBClient,
  createDocClient,
  getDynamoDBClient,
  getDocClient,
  resetClients,
} from './client';

// Tenant repository
export {
  getTenant,
  createTenant,
  updateTenant,
  generateTenantId,
} from './tenant-repository';

// Automata repository
export {
  getAutomata,
  createAutomata,
  listAutomatasInRealm,
  updateAutomataState,
  archiveAutomata,
  generateAutomataId,
} from './automata-repository';

// Event repository
export {
  getEvent,
  createEvent,
  createEventWithStateUpdate,
  listEvents,
  listEventsByType,
} from './event-repository';
