/**
 * @automabase/tenant-admin
 *
 * Tenant administration operations for Automabase platform.
 * Provides write operations for tenant lifecycle management:
 * - Create new tenants
 * - Update tenant properties
 * - Change tenant status (suspend/resume/delete)
 *
 * Read operations (getTenant) are available in @automabase/automata-core
 */

export {
  createTenant,
  generateTenantId,
  updateTenant,
  updateTenantStatus,
} from './tenant-admin-repository';
