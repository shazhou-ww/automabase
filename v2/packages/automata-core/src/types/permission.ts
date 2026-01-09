/**
 * Permission Types
 * Based on BUSINESS_MODEL_SPEC.md Section 3
 */

/**
 * Resource types that can be authorized
 * Note: 'tenant' permission is no longer used - tenant management is handled by admin API
 */
export type ResourceType = 'realm' | 'automata';

/**
 * Access levels
 */
export type AccessLevel = 'read' | 'write' | 'readwrite';

/**
 * Parsed permission object
 */
export interface Permission {
  /** Resource type: tenant, realm, or automata */
  resourceType: ResourceType;
  /** Resource ID (ULID) or '*' for wildcard */
  resourceId: string;
  /** Access level */
  accessLevel: AccessLevel;
  /** Whether this is a wildcard permission */
  isWildcard: boolean;
}

/**
 * Permission string format: {resource-type}:{resource-id}:{access-level}
 * Examples:
 *   realm:01F8MECHZX3TBDSZ7XRADM79XV:read
 *   automata:01AN4Z07BY79KA1307SR9X4MV3:readwrite
 */

/**
 * Parse a permission string into a Permission object
 * @returns Permission object or null if invalid
 */
export function parsePermission(permStr: string): Permission | null {
  const parts = permStr.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [resourceType, resourceId, accessLevel] = parts;

  // Validate resource type (tenant is no longer supported)
  if (!['realm', 'automata'].includes(resourceType)) {
    return null;
  }

  // Validate access level
  if (!['read', 'write', 'readwrite'].includes(accessLevel)) {
    return null;
  }

  // Validate resource ID format (ULID: 26 uppercase alphanumeric chars) or wildcard '*'
  const isWildcard = resourceId === '*';
  if (!isWildcard && !/^[0-9A-Z]{26}$/.test(resourceId)) {
    return null;
  }

  return {
    resourceType: resourceType as ResourceType,
    resourceId,
    accessLevel: accessLevel as AccessLevel,
    isWildcard,
  };
}

/**
 * Format a Permission object into a permission string
 */
export function formatPermission(perm: Permission): string {
  return `${perm.resourceType}:${perm.resourceId}:${perm.accessLevel}`;
}

/**
 * Permission checker class for verifying access rights
 */
export class PermissionChecker {
  private permissions: Permission[];
  private realmToAutomata: Map<string, string[]>;

  constructor(scopes: string[], realmAutomataMap?: Map<string, string[]>) {
    this.permissions = [];
    for (const scope of scopes) {
      const perm = parsePermission(scope);
      if (perm) {
        this.permissions.push(perm);
      }
    }
    this.realmToAutomata = realmAutomataMap ?? new Map();
  }

  /**
   * Check if the user has the required access level for a resource
   */
  hasAccess(resourceType: ResourceType, resourceId: string, requiredLevel: AccessLevel): boolean {
    for (const perm of this.permissions) {
      // Wildcard match
      if (perm.resourceType === resourceType && perm.isWildcard) {
        if (this.levelSatisfies(perm.accessLevel, requiredLevel)) {
          return true;
        }
      }

      // Direct match on resource type and ID
      if (perm.resourceType === resourceType && perm.resourceId === resourceId) {
        if (this.levelSatisfies(perm.accessLevel, requiredLevel)) {
          return true;
        }
      }

      // Realm -> Automata inheritance
      if (resourceType === 'automata' && perm.resourceType === 'realm') {
        // Check if this automata belongs to the realm with permission
        // This requires knowing the automata's realmId (passed via realmAutomataMap or looked up)
        const automatasInRealm = this.realmToAutomata.get(perm.resourceId);
        if (automatasInRealm?.includes(resourceId)) {
          if (this.levelSatisfies(perm.accessLevel, requiredLevel)) {
            return true;
          }
        }
        // Wildcard realm permission applies to all realms
        if (perm.isWildcard) {
          if (this.levelSatisfies(perm.accessLevel, requiredLevel)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if the user has read access to a realm
   */
  canReadRealm(realmId: string): boolean {
    return this.hasAccess('realm', realmId, 'read');
  }

  /**
   * Check if the user has readwrite access to a realm
   */
  canWriteRealm(realmId: string): boolean {
    return this.hasAccess('realm', realmId, 'readwrite');
  }

  /**
   * Check if the user has read access to an automata
   * Checks both direct automata permissions and inherited realm permissions
   */
  canReadAutomata(automataId: string, realmId?: string): boolean {
    // Direct automata permission
    if (this.hasAccess('automata', automataId, 'read')) {
      return true;
    }
    // Inherited from realm permission
    if (realmId && this.hasAccess('realm', realmId, 'read')) {
      return true;
    }
    return false;
  }

  /**
   * Check if the user has readwrite access to an automata
   */
  canWriteAutomata(automataId: string, realmId?: string): boolean {
    // Direct automata permission
    if (this.hasAccess('automata', automataId, 'readwrite')) {
      return true;
    }
    // Inherited from realm permission
    if (realmId && this.hasAccess('realm', realmId, 'readwrite')) {
      return true;
    }
    return false;
  }

  /**
   * Get all realm IDs the user has read access to
   */
  getReadableRealmIds(): string[] {
    const realmIds = new Set<string>();
    for (const perm of this.permissions) {
      if (perm.resourceType === 'realm' && this.levelSatisfies(perm.accessLevel, 'read')) {
        realmIds.add(perm.resourceId);
      }
    }
    return Array.from(realmIds);
  }

  /**
   * Check if one access level satisfies another
   * readwrite satisfies read, write, and readwrite
   * read only satisfies read
   * write only satisfies write
   */
  private levelSatisfies(have: AccessLevel, need: AccessLevel): boolean {
    if (have === 'readwrite') {
      return true; // readwrite satisfies all
    }
    return have === need;
  }
}
