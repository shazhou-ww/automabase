/**
 * Event commands
 */

import { Command } from 'commander';
import { AutomataApiClient } from '../api/automata-client';
import { error, getOutputFormat, printData, printJson, success } from '../utils/output';

export function createEventCommand(): Command {
  const event = new Command('event').description('Event management');

  // event send
  event
    .command('send <automataId>')
    .description('Send an event to an automata')
    .requiredOption('-t, --type <type>', 'Event type')
    .option('-d, --data <json>', 'Event data (JSON string)')
    .action(async (automataId: string, options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        let eventData: unknown;
        if (options.data) {
          try {
            eventData = JSON.parse(options.data);
          } catch {
            error('Invalid JSON in --data');
            process.exit(1);
          }
        }

        const result = await client.sendEvent(automataId, options.type, eventData);

        if (getOutputFormat() === 'json') {
          printJson(result);
        } else {
          success(`Event sent: ${result.eventId}`);
          console.log(`Version: ${result.baseVersion} → ${result.newVersion}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to send event');
        process.exit(1);
      }
    });

  // event list
  event
    .command('list <automataId>')
    .description('List events for an automata')
    .option('--direction <dir>', 'Query direction: forward or backward', 'backward')
    .option('--anchor <version>', 'Start from this version')
    .option('--limit <n>', 'Maximum number of events', '100')
    .action(async (automataId: string, options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);

        const result = await client.listEvents(automataId, {
          direction: options.direction as 'forward' | 'backward',
          anchor: options.anchor,
          limit: Number.parseInt(options.limit, 10),
        });

        printData(result.events, {
          headers: ['VERSION', 'TYPE', 'SENDER', 'TIMESTAMP'],
          getRow: (e: unknown) => {
            const ev = e as {
              baseVersion: string;
              eventType: string;
              senderSubjectId: string;
              timestamp: string;
            };
            return [
              ev.baseVersion,
              ev.eventType,
              ev.senderSubjectId,
              new Date(ev.timestamp).toLocaleString(),
            ];
          },
        });

        if (result.nextAnchor) {
          console.log(`\nNext anchor: ${result.nextAnchor}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to list events');
        process.exit(1);
      }
    });

  // event get
  event
    .command('get <automataId> <version>')
    .description('Get a specific event')
    .action(async (automataId: string, version: string, _options, command) => {
      try {
        const globalOpts = command.parent?.parent?.opts() || {};
        const client = new AutomataApiClient(globalOpts.profile);
        const result = await client.getEvent(automataId, version);
        printJson(result);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to get event');
        process.exit(1);
      }
    });

  return event;
}
