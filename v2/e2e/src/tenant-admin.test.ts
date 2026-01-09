/**
 * E2E Tests for Tenant Admin API
 *
 * Prerequisites:
 * - SAM Local running: bun run sam:local
 * - DynamoDB Local running with tables created
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders } from './config';
import { apiRequest, uniqueId } from './utils';

interface Tenant {
  tenantId: string;
  name: string;
  jwksUri: string;
  ownerSubjectId: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  contactName?: string;
  contactEmail?: string;
}

interface CreateTenantRequest {
  name: string;
  jwksUri: string;
  ownerSubjectId: string;
  contactName?: string;
  contactEmail?: string;
}

describe('Tenant Admin API', () => {
  let createdTenantId: string;

  beforeAll(() => {
    // Ensure we have a unique test run
    console.log(`Starting e2e tests at ${new Date().toISOString()}`);
  });

  describe('POST /admin/tenants', () => {
    it('should create a new tenant', async () => {
      const testId = uniqueId();
      const request: CreateTenantRequest = {
        name: `Test Tenant ${testId}`,
        jwksUri: 'https://example.com/.well-known/jwks.json',
        ownerSubjectId: `sha256:${testId}-owner-key-12345678901234567890`,
        contactName: 'Test User',
        contactEmail: 'test@example.com',
      };

      const response = await apiRequest<Tenant>('POST', '/admin/tenants', {
        headers: adminHeaders(),
        body: request,
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data?.tenantId).toBeDefined();
      expect(response.data?.name).toBe(request.name);
      expect(response.data?.jwksUri).toBe(request.jwksUri);
      expect(response.data?.ownerSubjectId).toBe(request.ownerSubjectId);
      expect(response.data?.status).toBe('active');
      expect(response.data?.createdAt).toBeDefined();

      // Save for subsequent tests
      if (response.data?.tenantId) {
        createdTenantId = response.data.tenantId;
      }
    });

    it('should return 400 for missing required fields', async () => {
      const response = await apiRequest('POST', '/admin/tenants', {
        headers: adminHeaders(),
        body: { name: 'Missing Fields' },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should return 401 for missing API key', async () => {
      const response = await apiRequest('POST', '/admin/tenants', {
        headers: { 'Content-Type': 'application/json' },
        body: {
          name: 'Test',
          jwksUri: 'https://example.com/jwks.json',
          ownerSubjectId: 'sha256:test',
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('GET /admin/tenants/{tenantId}', () => {
    it('should get an existing tenant', async () => {
      // Skip if no tenant was created
      if (!createdTenantId) {
        console.log('Skipping: No tenant created in previous test');
        return;
      }

      const response = await apiRequest<Tenant>('GET', `/admin/tenants/${createdTenantId}`, {
        headers: adminHeaders(),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data?.tenantId).toBe(createdTenantId);
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await apiRequest('GET', '/admin/tenants/01NONEXISTENT000000000000', {
        headers: adminHeaders(),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /admin/tenants/{tenantId}', () => {
    it('should update tenant properties', async () => {
      if (!createdTenantId) {
        console.log('Skipping: No tenant created');
        return;
      }

      const response = await apiRequest<{ tenantId: string; updatedFields: string[] }>(
        'PATCH',
        `/admin/tenants/${createdTenantId}`,
        {
          headers: adminHeaders(),
          body: { name: 'Updated Tenant Name' },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data?.updatedFields).toContain('name');
    });
  });

  describe('POST /admin/tenants/{tenantId}/suspend', () => {
    it('should suspend a tenant', async () => {
      if (!createdTenantId) {
        console.log('Skipping: No tenant created');
        return;
      }

      const response = await apiRequest<{ tenantId: string; status: string }>(
        'POST',
        `/admin/tenants/${createdTenantId}/suspend`,
        { headers: adminHeaders() }
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data?.status).toBe('suspended');
    });
  });

  describe('POST /admin/tenants/{tenantId}/resume', () => {
    it('should resume a suspended tenant', async () => {
      if (!createdTenantId) {
        console.log('Skipping: No tenant created');
        return;
      }

      const response = await apiRequest<{ tenantId: string; status: string }>(
        'POST',
        `/admin/tenants/${createdTenantId}/resume`,
        { headers: adminHeaders() }
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data?.status).toBe('active');
    });
  });

  describe('DELETE /admin/tenants/{tenantId}', () => {
    it('should delete (mark as deleted) a tenant', async () => {
      if (!createdTenantId) {
        console.log('Skipping: No tenant created');
        return;
      }

      const response = await apiRequest<{ tenantId: string; status: string }>(
        'DELETE',
        `/admin/tenants/${createdTenantId}`,
        { headers: adminHeaders() }
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data?.status).toBe('deleted');
    });
  });
});
