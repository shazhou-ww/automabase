/**
 * Batch commands
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { AutomataApiClient } from '../api/automata-client';
import { error, printJson } from '../utils/output';

export function createBatchCommand(): Command {
  const batch = new Command('batch').description('Batch operations');

  // batch send-events
  batch
    .command('send-events <automataId>')
    .description('Send multiple events to an automata')
    .requiredOption('-f, --file <path>', 'Path to events JSON file')
    .action(async (automataId: string, options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        const eventsJson = readFileSync(options.file, 'utf-8');
        const events = JSON.parse(eventsJson);

        if (!Array.isArray(events)) {
          error('Events file must contain a JSON array');
          process.exit(1);
        }

        const result = await client.batchSendEvents(automataId, events);
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to send batch events');
        process.exit(1);
      }
    });

  // batch states
  batch
    .command('states')
    .description('Get states for multiple automatas')
    .requiredOption('--ids <ids>', 'Comma-separated automata IDs')
    .action(async (options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        const automataIds = options.ids.split(',').map((id: string) => id.trim());
        const result = await client.batchGetStates(automataIds);
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to get batch states');
        process.exit(1);
      }
    });

  return batch;
}
