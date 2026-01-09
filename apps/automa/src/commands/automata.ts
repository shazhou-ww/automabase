/**
 * Automata commands
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { AutomataApiClient } from '../api/automata-client';
import { error, getOutputFormat, printData, printJson, success } from '../utils/output';

export function createAutomataCommand(): Command {
  const automata = new Command('automata').description('Automata management');

  // automata create
  automata
    .command('create <realmId>')
    .description('Create a new automata in a realm')
    .requiredOption('-f, --file <path>', 'Path to descriptor JSON file')
    .requiredOption('-s, --signature <sig>', 'Descriptor signature')
    .action(async (realmId: string, options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        const descriptorJson = readFileSync(options.file, 'utf-8');
        const descriptor = JSON.parse(descriptorJson);

        const result = await client.createAutomata(realmId, {
          descriptor,
          descriptorSignature: options.signature,
        });

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Automata created: ${result.automataId}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to create automata');
        process.exit(1);
      }
    });

  // automata list
  automata
    .command('list <realmId>')
    .description('List automatas in a realm')
    .option('--limit <n>', 'Maximum number of automatas', '100')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(async (realmId: string, options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        const result = await client.listAutomatas(realmId, {
          limit: Number.parseInt(options.limit, 10),
          cursor: options.cursor,
        });

        printData(result.automatas, {
          headers: ['AUTOMATA ID', 'NAME', 'VERSION', 'STATUS', 'UPDATED'],
          getRow: (a: unknown) => {
            const automata = a as {
              automataId: string;
              descriptor: { name: string };
              version: string;
              status: string;
              updatedAt: string;
            };
            return [
              automata.automataId,
              automata.descriptor.name,
              automata.version,
              automata.status,
              new Date(automata.updatedAt).toLocaleDateString(),
            ];
          },
        });

        if (result.nextCursor) {
          console.log(`\nNext cursor: ${result.nextCursor}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to list automatas');
        process.exit(1);
      }
    });

  // automata state
  automata
    .command('state <automataId>')
    .description('Get automata current state')
    .action(async (automataId: string, _options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);
        const result = await client.getState(automataId);
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to get state');
        process.exit(1);
      }
    });

  // automata descriptor
  automata
    .command('descriptor <automataId>')
    .description('Get automata descriptor')
    .action(async (automataId: string, _options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);
        const result = await client.getDescriptor(automataId);
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to get descriptor');
        process.exit(1);
      }
    });

  // automata archive
  automata
    .command('archive <automataId>')
    .description('Archive an automata')
    .action(async (automataId: string, _options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);
        const result = await client.archiveAutomata(automataId);

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Automata ${automataId} archived`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to archive automata');
        process.exit(1);
      }
    });

  // automata history
  automata
    .command('history <automataId> <version>')
    .description('Get historical state at a specific version')
    .action(async (automataId: string, version: string, _options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);
        const result = await client.getHistoricalState(automataId, version);
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to get historical state');
        process.exit(1);
      }
    });

  // automata snapshots
  automata
    .command('snapshots <automataId>')
    .description('List snapshots for an automata')
    .option('--limit <n>', 'Maximum number of snapshots', '100')
    .option('--start-version <version>', 'Start from this version')
    .action(async (automataId: string, options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        const result = await client.listSnapshots(automataId, {
          limit: Number.parseInt(options.limit, 10),
          startVersion: options.startVersion,
        });

        printData(result.snapshots, {
          headers: ['VERSION', 'CREATED'],
          getRow: (s: unknown) => {
            const snapshot = s as { version: string; createdAt: string };
            return [snapshot.version, new Date(snapshot.createdAt).toLocaleString()];
          },
        });
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to list snapshots');
        process.exit(1);
      }
    });

  return automata;
}
