/**
 * Config commands
 */

import { input } from '@inquirer/prompts';
import { Command } from 'commander';
import {
  getConfigPath,
  getConfigValue,
  loadConfig,
  saveConfig,
  setConfigValue,
} from '../config/config-manager';
import { error, info, printJson, success } from '../utils/output';

export function createConfigCommand(): Command {
  const config = new Command('config').description('Manage global configuration');

  // config init
  config
    .command('init')
    .description('Initialize configuration interactively')
    .action(async () => {
      try {
        const currentConfig = loadConfig();

        const adminUrl = await input({
          message: 'Admin API URL:',
          default: currentConfig.admin?.url || '',
        });

        const adminKey = await input({
          message: 'Admin API Key:',
          default: currentConfig.admin?.key || '',
        });

        const apiUrl = await input({
          message: 'Automata API URL:',
          default: currentConfig.api?.url || '',
        });

        const newConfig = {
          ...currentConfig,
          admin:
            adminUrl || adminKey
              ? { url: adminUrl || undefined, key: adminKey || undefined }
              : undefined,
          api: apiUrl ? { url: apiUrl } : undefined,
        };

        saveConfig(newConfig);
        success(`Configuration saved to ${getConfigPath()}`);
      } catch (err) {
        if (err instanceof Error && err.message.includes('User force closed')) {
          info('Configuration cancelled');
          return;
        }
        throw err;
      }
    });

  // config show
  config
    .command('show')
    .description('Show current configuration')
    .action(() => {
      const currentConfig = loadConfig();
      info(`Configuration file: ${getConfigPath()}`);
      printJson(currentConfig);
    });

  // config set
  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const validKeys = ['admin.url', 'admin.key', 'api.url', 'defaultProfile'];

      if (!validKeys.includes(key)) {
        error(`Invalid key: ${key}`);
        info(`Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
      }

      setConfigValue(key, value);
      success(`Set ${key} = ${key.includes('key') ? '***' : value}`);
    });

  // config get
  config
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const value = getConfigValue(key);
      if (value === undefined) {
        error(`Key not found: ${key}`);
        process.exit(1);
      }
      console.log(value);
    });

  return config;
}
