/**
 * Admin Tenant commands
 */

import { input } from '@inquirer/prompts';
import { Command } from 'commander';
import { AdminApiClient, type CreateTenantRequest } from '../../api/admin-client';
import { error, getOutputFormat, printData, printJson, success } from '../../utils/output';

function getClient(options: { adminUrl?: string; adminKey?: string }): AdminApiClient {
  return new AdminApiClient(options.adminUrl, options.adminKey);
}

export function createAdminTenantCommand(): Command {
  const tenant = new Command('tenant').description('Manage tenants');

  // tenant create
  tenant
    .command('create')
    .description('Create a new tenant')
    .option('--name <name>', 'Tenant name')
    .option('--jwks-uri <uri>', 'JWKS URI for tenant authentication')
    .option('--owner-subject-id <id>', 'Owner subject ID')
    .option('--tenant-id <id>', 'Custom tenant ID (optional)')
    .option('--contact-name <name>', 'Contact name')
    .option('--contact-email <email>', 'Contact email')
    .action(async (options) => {
      try {
        let name = options.name;
        let jwksUri = options.jwksUri;
        let ownerSubjectId = options.ownerSubjectId;

        // Interactive mode
        if (!name) {
          name = await input({
            message: 'Tenant name:',
            validate: (v) => (v ? true : 'Name is required'),
          });
        }

        if (!jwksUri) {
          jwksUri = await input({
            message: 'JWKS URI:',
            validate: (v) => (v ? true : 'JWKS URI is required'),
          });
        }

        if (!ownerSubjectId) {
          ownerSubjectId = await input({
            message: 'Owner Subject ID:',
            validate: (v) => (v ? true : 'Owner Subject ID is required'),
          });
        }

        const request: CreateTenantRequest = {
          name,
          jwksUri,
          ownerSubjectId,
          tenantId: options.tenantId,
          contactName: options.contactName,
          contactEmail: options.contactEmail,
        };

        const client = getClient(options);
        const result = await client.createTenant(request);

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Tenant created: ${result.tenantId}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to create tenant');
        process.exit(1);
      }
    });

  // tenant list
  tenant
    .command('list')
    .description('List all tenants')
    .option('--limit <n>', 'Maximum number of tenants to return', '100')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(async (options) => {
      try {
        const client = getClient(options);
        const result = await client.listTenants({
          limit: Number.parseInt(options.limit, 10),
          cursor: options.cursor,
        });

        printData(result.tenants, {
          headers: ['TENANT ID', 'NAME', 'STATUS', 'CREATED'],
          getRow: (t: unknown) => {
            const tenant = t as {
              tenantId: string;
              name: string;
              status: string;
              createdAt: string;
            };
            return [
              tenant.tenantId,
              tenant.name,
              tenant.status,
              new Date(tenant.createdAt).toLocaleDateString(),
            ];
          },
        });

        if (result.nextCursor) {
          console.log(`\nNext cursor: ${result.nextCursor}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to list tenants');
        process.exit(1);
      }
    });

  // tenant get
  tenant
    .command('get <tenantId>')
    .description('Get tenant details')
    .action(async (tenantId: string, options) => {
      try {
        const client = getClient(options);
        const result = await client.getTenant(tenantId);
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to get tenant');
        process.exit(1);
      }
    });

  // tenant update
  tenant
    .command('update <tenantId>')
    .description('Update tenant')
    .option('--name <name>', 'New tenant name')
    .option('--contact-name <name>', 'Contact name')
    .option('--contact-email <email>', 'Contact email')
    .option('--jwks-uri <uri>', 'JWKS URI')
    .action(async (tenantId: string, options) => {
      try {
        const updates: Record<string, string> = {};
        if (options.name) updates.name = options.name;
        if (options.contactName) updates.contactName = options.contactName;
        if (options.contactEmail) updates.contactEmail = options.contactEmail;
        if (options.jwksUri) updates.jwksUri = options.jwksUri;

        if (Object.keys(updates).length === 0) {
          error('No updates specified');
          process.exit(1);
        }

        const client = getClient(options);
        const result = await client.updateTenant(tenantId, updates);

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Tenant ${tenantId} updated`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to update tenant');
        process.exit(1);
      }
    });

  // tenant suspend
  tenant
    .command('suspend <tenantId>')
    .description('Suspend a tenant')
    .action(async (tenantId: string, options) => {
      try {
        const client = getClient(options);
        const result = await client.suspendTenant(tenantId);

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Tenant ${tenantId} suspended`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to suspend tenant');
        process.exit(1);
      }
    });

  // tenant resume
  tenant
    .command('resume <tenantId>')
    .description('Resume a suspended tenant')
    .action(async (tenantId: string, options) => {
      try {
        const client = getClient(options);
        const result = await client.resumeTenant(tenantId);

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Tenant ${tenantId} resumed`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to resume tenant');
        process.exit(1);
      }
    });

  // tenant delete
  tenant
    .command('delete <tenantId>')
    .description('Delete a tenant')
    .action(async (tenantId: string, options) => {
      try {
        const client = getClient(options);
        const result = await client.deleteTenant(tenantId);

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Tenant ${tenantId} deleted`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete tenant');
        process.exit(1);
      }
    });

  return tenant;
}
