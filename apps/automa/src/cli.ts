/**
 * CLI Configuration
 */

import { Command } from 'commander';
import { createAdminTenantCommand } from './commands/admin/tenant';
import { createAutomataCommand } from './commands/automata';
import { createBatchCommand } from './commands/batch';
import { createConfigCommand } from './commands/config';
import { createEventCommand } from './commands/event';
import { createProfileCommand } from './commands/profile';
import { createRealmCommand } from './commands/realm';
import { createTenantCommand } from './commands/tenant';
import { type OutputFormat, setOutputFormat, setQuietMode, setVerboseMode } from './utils/output';

export function createCli(): Command {
  const program = new Command();

  program
    .name('automa')
    .description('CLI for Automabase - manage tenants, automatas, and events')
    .version('1.0.0');

  // Global options
  program
    .option('-o, --output <format>', 'Output format: json or table', 'json')
    .option('-q, --quiet', 'Quiet mode - minimal output')
    .option('-v, --verbose', 'Verbose mode - detailed output')
    .option('--profile <name>', 'Use specific profile')
    .option('--admin-url <url>', 'Override admin API URL')
    .option('--admin-key <key>', 'Override admin API key')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      setOutputFormat(opts.output as OutputFormat);
      setQuietMode(opts.quiet || false);
      setVerboseMode(opts.verbose || false);
    });

  // Config command
  program.addCommand(createConfigCommand());

  // Profile command
  program.addCommand(createProfileCommand());

  // Admin commands
  const admin = new Command('admin').description('Platform administration');
  admin.addCommand(createAdminTenantCommand());
  program.addCommand(admin);

  // Tenant command (user-facing)
  program.addCommand(createTenantCommand());

  // Realm command
  program.addCommand(createRealmCommand());

  // Automata command
  program.addCommand(createAutomataCommand());

  // Event command
  program.addCommand(createEventCommand());

  // Batch command
  program.addCommand(createBatchCommand());

  return program;
}
