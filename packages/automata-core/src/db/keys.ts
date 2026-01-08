/**
 * DynamoDB Key Builders
 * Based on BUSINESS_MODEL_SPEC.md Section 6
 */

import { PREFIX, META_SK } from './constants';

/**
 * Build primary key for Tenant entity
 */
export function tenantPK(tenantId: string): string {
  return `${PREFIX.TENANT}${tenantId}`;
}

/**
 * Build primary key for Automata entity
 */
export function automataPK(automataId: string): string {
  return `${PREFIX.AUTOMATA}${automataId}`;
}

/**
 * Build sort key for Event
 */
export function eventSK(version: string): string {
  return `${PREFIX.EVENT}${version}`;
}

/**
 * Build LSI1 sort key for Event by type
 */
export function eventTypeSK(eventType: string, version: string): string {
  return `${PREFIX.EVENT_TYPE}${eventType}#${version}`;
}

/**
 * Build sort key for Snapshot
 */
export function snapshotSK(version: string): string {
  return `${PREFIX.SNAPSHOT}${version}`;
}

/**
 * Build GSI1 primary key for Automata (Tenant+Realm index)
 */
export function gsi1PK(tenantId: string, realmId: string): string {
  return `${PREFIX.TENANT}${tenantId}#${PREFIX.REALM}${realmId}`;
}

/**
 * Build GSI1 sort key for Automata
 */
export function gsi1SK(createdAt: string, automataId: string): string {
  return `${createdAt}#${automataId}`;
}

/**
 * Build GSI2 primary key for Subject index
 */
export function gsi2PK(subjectId: string): string {
  return `${PREFIX.SUBJECT}${subjectId}`;
}

/**
 * Build GSI2 sort key for Subject index
 */
export function gsi2SK(createdAt: string, automataId: string): string {
  return `${createdAt}#${automataId}`;
}

/**
 * Tenant item keys
 */
export function tenantKeys(tenantId: string) {
  return {
    pk: tenantPK(tenantId),
    sk: META_SK,
  };
}

/**
 * Automata item keys
 */
export function automataKeys(automataId: string) {
  return {
    pk: automataPK(automataId),
    sk: META_SK,
  };
}

/**
 * Event item keys
 */
export function eventKeys(automataId: string, version: string) {
  return {
    pk: automataPK(automataId),
    sk: eventSK(version),
  };
}

/**
 * Extract tenant ID from PK
 */
export function extractTenantId(pk: string): string | null {
  if (!pk.startsWith(PREFIX.TENANT)) {
    return null;
  }
  return pk.slice(PREFIX.TENANT.length);
}

/**
 * Extract automata ID from PK
 */
export function extractAutomataId(pk: string): string | null {
  if (!pk.startsWith(PREFIX.AUTOMATA)) {
    return null;
  }
  return pk.slice(PREFIX.AUTOMATA.length);
}

/**
 * Extract version from event SK
 */
export function extractEventVersion(sk: string): string | null {
  if (!sk.startsWith(PREFIX.EVENT)) {
    return null;
  }
  return sk.slice(PREFIX.EVENT.length);
}
