/**
 * Realm commands
 */

import { Command } from 'commander';
import { AutomataApiClient } from '../api/automata-client';
import { error, printData } from '../utils/output';

export function createRealmCommand(): Command {
  const realm = new Command('realm').description('Realm management');

  // realm list
  realm
    .command('list')
    .description('List realms the user has access to')
    .option('--limit <n>', 'Maximum number of realms', '100')
    .option('--cursor <cursor>', 'Pagination cursor')
    .action(async (options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        const result = await client.listRealms({
          limit: Number.parseInt(options.limit, 10),
          cursor: options.cursor,
        });

        printData(result.realms, {
          headers: ['REALM ID', 'AUTOMATA COUNT', 'CREATED'],
          getRow: (r: unknown) => {
            const realm = r as { realmId: string; automataCount: number; createdAt: string };
            return [
              realm.realmId,
              String(realm.automataCount),
              new Date(realm.createdAt).toLocaleDateString(),
            ];
          },
        });

        if (result.nextCursor) {
          console.log(`\nNext cursor: ${result.nextCursor}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to list realms');
        process.exit(1);
      }
    });

  return realm;
}
