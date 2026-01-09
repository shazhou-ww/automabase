/**
 * Tenant info command (user-facing)
 */

import { Command } from 'commander';
import { AutomataApiClient } from '../api/automata-client';
import { error, printJson } from '../utils/output';

export function createTenantCommand(): Command {
  const tenant = new Command('tenant').description('Tenant information');

  // tenant info
  tenant
    .command('info')
    .description('Get current tenant information')
    .action(async (_options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);
        const result = await client.getTenantInfo();
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to get tenant info');
        process.exit(1);
      }
    });

  return tenant;
}
