/**
 * Admin API Client
 * Uses API Key authentication
 */

import { getAdminKey, getAdminUrl } from '../config/config-manager';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateTenantRequest {
  name: string;
  jwksUri: string;
  ownerSubjectId: string;
  tenantId?: string;
  contactName?: string;
  contactEmail?: string;
}

export interface Tenant {
  tenantId: string;
  name: string;
  jwksUri: string;
  ownerSubjectId: string;
  contactName?: string;
  contactEmail?: string;
  status: 'active' | 'suspended' | 'deleted';
  createdAt: string;
  updatedAt?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  contactName?: string;
  contactEmail?: string;
  jwksUri?: string;
}

export class AdminApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl || getAdminUrl() || '').replace(/\/$/, '');
    this.apiKey = apiKey || getAdminKey() || '';

    if (!this.baseUrl) {
      throw new Error('Admin API URL not configured. Run: automa config set admin.url <url>');
    }

    if (!this.apiKey) {
      throw new Error('Admin API key not configured. Run: automa config set admin.key <key>');
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Request failed: ${response.status}`);
    }

    return result.data as T;
  }

  async createTenant(request: CreateTenantRequest): Promise<Tenant> {
    return this.request<Tenant>('POST', '/admin/tenants', request);
  }

  async listTenants(options?: {
    limit?: number;
    cursor?: string;
  }): Promise<{ tenants: Tenant[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);

    const query = params.toString();
    return this.request('GET', `/admin/tenants${query ? `?${query}` : ''}`);
  }

  async getTenant(tenantId: string): Promise<Tenant> {
    return this.request<Tenant>('GET', `/admin/tenants/${encodeURIComponent(tenantId)}`);
  }

  async updateTenant(
    tenantId: string,
    updates: UpdateTenantRequest
  ): Promise<{
    tenantId: string;
    updatedFields: string[];
    updatedAt: string;
  }> {
    return this.request('PATCH', `/admin/tenants/${encodeURIComponent(tenantId)}`, updates);
  }

  async suspendTenant(tenantId: string): Promise<{
    tenantId: string;
    status: string;
    updatedAt?: string;
    message?: string;
  }> {
    return this.request('POST', `/admin/tenants/${encodeURIComponent(tenantId)}/suspend`);
  }

  async resumeTenant(tenantId: string): Promise<{
    tenantId: string;
    status: string;
    updatedAt?: string;
    message?: string;
  }> {
    return this.request('POST', `/admin/tenants/${encodeURIComponent(tenantId)}/resume`);
  }

  async deleteTenant(tenantId: string): Promise<{
    tenantId: string;
    status: string;
    deletedAt?: string;
    message?: string;
  }> {
    return this.request('DELETE', `/admin/tenants/${encodeURIComponent(tenantId)}`);
  }
}
